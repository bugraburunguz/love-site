package com.lovesite.media.processing;

import com.lovesite.media.Media;
import com.lovesite.media.MediaKind;
import com.lovesite.media.MediaRepository;
import com.lovesite.media.MediaStatus;
import com.lovesite.storage.StorageService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionTemplate;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import java.util.stream.Stream;

/**
 * The state machine and the work of one processing job. Claiming and recording results are short transactions of
 * their own; the slow part (download, ffmpeg/vips, upload) runs outside any transaction.
 */
@Service
public class MediaProcessingService {

    private static final Logger log = LoggerFactory.getLogger(MediaProcessingService.class);
    /** Variants carry a version in their key, so they can be cached forever. */
    static final String CACHE_CONTROL = "private, max-age=31536000, immutable";

    private final MediaRepository media;
    private final JdbcTemplate jdbc;
    private final TransactionTemplate tx;
    private final StorageService storage;
    private final PhotoProcessor photos;
    private final VideoProcessor videos;
    private final ProcessingProperties properties;

    public MediaProcessingService(MediaRepository media, JdbcTemplate jdbc, TransactionTemplate tx, StorageService storage,
                                  PhotoProcessor photos, VideoProcessor videos, ProcessingProperties properties) {
        this.media = media;
        this.jdbc = jdbc;
        this.tx = tx;
        this.storage = storage;
        this.photos = photos;
        this.videos = videos;
        this.properties = properties;
    }

    /**
     * Takes the oldest due UPLOADED item: SELECT ... FOR UPDATE SKIP LOCKED, then PROCESSING with a start time, all in
     * one short transaction. Two workers can never receive the same row.
     */
    public Optional<UUID> claimNext() {
        return tx.execute(status -> {
            List<UUID> ids = jdbc.query(
                    "SELECT id FROM media WHERE status = 'UPLOADED' AND deleted_at IS NULL "
                            + "AND (next_attempt_at IS NULL OR next_attempt_at <= now()) "
                            + "ORDER BY created_at LIMIT 1 FOR UPDATE SKIP LOCKED",
                    (rs, i) -> rs.getObject(1, UUID.class));
            if (ids.isEmpty()) return Optional.<UUID>empty();
            jdbc.update("UPDATE media SET status = 'PROCESSING', processing_started_at = now() WHERE id = ?", ids.get(0));
            return Optional.of(ids.get(0));
        });
    }

    /**
     * A job that has been PROCESSING for too long (the process died or restarted) goes back to the queue; it counts as a
     * failed attempt so a file that crashes the worker cannot loop forever.
     */
    public int reclaimStale() {
        Integer count = tx.execute(status -> jdbc.update(
                "UPDATE media SET attempts = attempts + 1, last_error = 'processing did not finish', processing_started_at = NULL, "
                        + "status = CASE WHEN attempts + 1 >= ? THEN 'FAILED' ELSE 'UPLOADED' END, "
                        + "next_attempt_at = CASE WHEN attempts + 1 >= ? THEN NULL ELSE now() END "
                        + "WHERE status = 'PROCESSING' AND processing_started_at < now() - (? * interval '1 second')",
                properties.maxAttempts(), properties.maxAttempts(), properties.staleAfter().toSeconds()));
        if (count != null && count > 0) log.warn("Put {} stale PROCESSING item(s) back in the queue", count);
        return count == null ? 0 : count;
    }

    /** Runs one claimed job to completion. Never throws: every failure is recorded on the row. */
    public void process(UUID id) {
        Optional<Media> found = media.findById(id);
        if (found.isEmpty()) return;
        Media item = found.get();

        Path tmp = null;
        List<String> uploaded = new ArrayList<>();
        try {
            tmp = Files.createTempDirectory("media-");
            Path original = tmp.resolve("original");
            storage.download(item.getOriginalKey(), original);

            ProcessedMedia result = item.getType() == MediaKind.IMAGE ? photos.process(original, tmp) : videos.process(original, tmp);

            int version = item.getProcessingVersion() + 1;
            String prefix = "albums/" + item.getAlbumId() + "/media/" + item.getId() + "/v" + version + "/";
            String thumbKey = put(prefix + "thumb.webp", result.thumb(), "image/webp", uploaded);
            String displayKey = put(prefix + "display.webp", result.display(), "image/webp", uploaded);
            String loopKey = put(prefix + "loop.mp4", result.loop(), "video/mp4", uploaded);
            String posterKey = put(prefix + "poster.webp", result.poster(), "image/webp", uploaded);

            // The row only points at the new version once every object of it is in the bucket.
            List<String> oldKeys = tx.execute(status -> {
                Media row = media.findById(id).orElseThrow();
                List<String> old = new ArrayList<>(Stream.of(row.getThumbKey(), row.getDisplayKey(), row.getLoopKey(), row.getPosterKey())
                        .filter(k -> k != null).toList());
                row.markReady(version, result.width(), result.height(), result.durationMs(), result.takenAt(),
                        thumbKey, displayKey, loopKey, posterKey);
                media.save(row);
                return old;
            });
            if (oldKeys != null) {
                oldKeys.stream().filter(k -> !uploaded.contains(k)).forEach(this::deleteQuietly);
            }
            log.info("Processed media {} -> v{}", id, version);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            uploaded.forEach(this::deleteQuietly);
            recordFailure(id, e);
        } catch (Exception e) {
            uploaded.forEach(this::deleteQuietly);
            recordFailure(id, e);
        } finally {
            deleteRecursively(tmp);
        }
    }

    private String put(String key, Path file, String contentType, List<String> uploaded) {
        if (file == null) return null;
        storage.upload(key, file, contentType, CACHE_CONTROL);
        uploaded.add(key);
        return key;
    }

    /** Failure bookkeeping: retry with growing delays, FAILED after the last attempt. The detail stays in the row and the log. */
    void recordFailure(UUID id, Throwable error) {
        String message = ProcessRunner.tail(String.valueOf(error.getMessage()), 280);
        log.warn("Processing media {} failed: {}", id, error.toString());
        tx.executeWithoutResult(status -> media.findById(id).ifPresent(row -> {
            int attempts = row.getAttempts() + 1;
            jdbc.update("UPDATE media SET attempts = ?, last_error = ?, processing_started_at = NULL, status = ?, next_attempt_at = ? WHERE id = ?",
                    attempts, message,
                    (attempts >= properties.maxAttempts() ? MediaStatus.FAILED : MediaStatus.UPLOADED).name(),
                    attempts >= properties.maxAttempts() ? null : java.sql.Timestamp.from(Instant.now().plus(properties.backoffAfter(attempts))),
                    id);
        }));
    }

    private void deleteQuietly(String key) {
        try {
            storage.delete(key);
        } catch (RuntimeException e) {
            log.warn("Could not delete {}: {}", key, e.toString());
        }
    }

    private static void deleteRecursively(Path dir) {
        if (dir == null) return;
        try (Stream<Path> walk = Files.walk(dir)) {
            walk.sorted(java.util.Comparator.reverseOrder()).forEach(p -> {
                try {
                    Files.deleteIfExists(p);
                } catch (IOException ignored) {
                    // best effort: the OS temp dir is cleaned on restart anyway
                }
            });
        } catch (IOException ignored) {
            // nothing to clean up
        }
    }
}
