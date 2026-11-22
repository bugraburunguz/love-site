package com.lovesite.media;

import com.lovesite.album.AlbumService;
import com.lovesite.media.MediaDtos.MediaResponse;
import com.lovesite.media.MediaDtos.UploadFile;
import com.lovesite.media.MediaDtos.UploadItem;
import com.lovesite.media.MediaDtos.UploadResponse;
import com.lovesite.media.processing.MediaProcessingQueue;
import com.lovesite.page.PageService;
import com.lovesite.space.QuotaService;
import com.lovesite.storage.StorageService;
import com.lovesite.system.ApiException;
import com.lovesite.user.CurrentUser;
import com.lovesite.user.DisplayNames;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionTemplate;

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import java.util.regex.Pattern;

/**
 * Every method takes the calling user and works on that user's space only: albums and media are looked up with the
 * space id in the query itself, so an id from another space behaves exactly like an id that does not exist (404).
 */
@Service
public class MediaService {

    private static final Logger log = LoggerFactory.getLogger(MediaService.class);
    /** Everything the album shows: uploaded items in any processing state (not half-uploaded or rejected ones). */
    private static final List<MediaStatus> LISTED =
            List.of(MediaStatus.UPLOADED, MediaStatus.PROCESSING, MediaStatus.READY, MediaStatus.FAILED);
    private static final Pattern SHA256 = Pattern.compile("[0-9a-fA-F]{64}");
    private static final int MAX_FILENAME = 512;

    private final MediaRepository media;
    private final AlbumService albums;
    private final StorageService storage;
    private final MediaProperties properties;
    private final ObjectProvider<MediaProcessingQueue> queue;
    private final QuotaService quota;
    private final TransactionTemplate tx;
    private final PageService pages;
    private final DisplayNames names;
    private final com.lovesite.space.SignupProperties signup;

    public MediaService(MediaRepository media, AlbumService albums, StorageService storage, MediaProperties properties,
                        ObjectProvider<MediaProcessingQueue> queue, QuotaService quota, TransactionTemplate tx,
                        PageService pages, DisplayNames names, com.lovesite.space.SignupProperties signup) {
        this.signup = signup;
        this.pages = pages;
        this.names = names;
        this.queue = queue;
        this.media = media;
        this.albums = albums;
        this.storage = storage;
        this.properties = properties;
        this.quota = quota;
        this.tx = tx;
    }

    public List<MediaResponse> list(CurrentUser me, UUID albumId) {
        albums.require(me, albumId);
        return media.findBySpaceIdAndAlbumIdAndStatusInAndDeletedAtIsNullOrderByCreatedAtAsc(me.requireSpace(), albumId, LISTED)
                .stream()
                .map(this::toResponse)
                .toList();
    }

    /** Current state of a few items (the album page polls only those that are still being processed). */
    public List<MediaResponse> statusOf(CurrentUser me, List<UUID> ids) {
        if (ids == null || ids.isEmpty()) return List.of();
        if (ids.size() > properties.maxBatchSize()) {
            throw ApiException.badRequest("En fazla " + properties.maxBatchSize() + " medya sorgulanabilir");
        }
        return media.findBySpaceIdAndIdInAndStatusInAndDeletedAtIsNull(me.requireSpace(), ids, LISTED).stream()
                .map(this::toResponse).toList();
    }

    /**
     * FAILED or READY items go back to the queue with a fresh attempt counter. {@code beforeRequeue} runs only once the
     * item is the caller's and may be requeued (a rate limit that should count accepted retries only).
     */
    public MediaResponse reprocess(CurrentUser me, UUID mediaId, Runnable beforeRequeue) {
        Media m = find(me, mediaId);
        if (m.getStatus() != MediaStatus.FAILED && m.getStatus() != MediaStatus.READY) {
            throw ApiException.conflict("Bu medya zaten işleniyor");
        }
        beforeRequeue.run();
        m.requeue();
        m = media.save(m);
        queue.ifAvailable(MediaProcessingQueue::kick);
        return toResponse(m);
    }

    /**
     * LS-22: a new start for the 3-second clip of a processed video (null = the beginning). The worker cuts it again
     * from the original, so the media goes back into the queue; while it waits, another change is refused.
     */
    public MediaResponse changeClip(CurrentUser me, UUID mediaId, Long startMs, Runnable beforeRequeue) {
        Media m = find(me, mediaId);
        if (m.getType() != MediaKind.VIDEO) throw ApiException.badRequest("Yalnız videoların klibi seçilebilir");
        long limit = m.getDurationMs() != null && m.getDurationMs() > 0 ? m.getDurationMs() : Media.MAX_CLIP_START_MS;
        if (startMs != null && (startMs < 0 || startMs > limit)) {
            throw ApiException.badRequest("Klip videonun içinden seçilmeli");
        }
        Long wanted = startMs == null || startMs == 0 ? null : startMs;
        // the same moment again: nothing to cut (and no free reprocess past the per-media cooldown)
        if (m.getStatus() == MediaStatus.READY && java.util.Objects.equals(wanted, m.getClipStartMs())) return toResponse(m);
        if (m.getStatus() != MediaStatus.FAILED && m.getStatus() != MediaStatus.READY) {
            throw ApiException.conflict("Bu video zaten işleniyor");
        }
        beforeRequeue.run();
        Integer changed = tx.execute(s -> media.requeueWithClip(mediaId, wanted));
        if (changed == null || changed == 0) throw ApiException.conflict("Bu video zaten işleniyor");
        queue.ifAvailable(MediaProcessingQueue::kick);
        return toResponse(media.findById(mediaId).orElseThrow());
    }

    /** Variant URLs only for READY items; they come from the shared presigned-URL cache. */
    public MediaResponse toResponse(Media m) {
        boolean ready = m.getStatus() == MediaStatus.READY;
        Instant displayDate = m.shownDate();
        Instant originalDate = m.getTakenAt() != null ? m.getTakenAt()
                : m.getClientModifiedAt() != null ? m.getClientModifiedAt() : m.getCreatedAt();
        return new MediaResponse(m.getId(), m.getType(), m.getStatus(), m.getOriginalFilename(), m.getContentType(),
                m.getSizeBytes(), m.getCreatedAt(), m.getClientModifiedAt(), displayDate, m.getCaption(),
                ready ? url(m.getThumbKey()) : null, ready ? url(m.getDisplayKey()) : null,
                ready ? url(m.getLoopKey()) : null, ready ? url(m.getPosterKey()) : null,
                ready ? m.getWidth() : null, ready ? m.getHeight() : null, ready ? m.getDurationMs() : null,
                names.of(m.getUploadedBy()), m.getAlbumId(), m.dateUncertain(), m.getDateOverride() != null, originalDate,
                m.getType() == MediaKind.VIDEO ? m.getClipStartMs() : null);
    }

    /** Sets (or with null removes) the hand-set date of a photo / video of the caller's space. */
    public MediaResponse setDate(CurrentUser me, UUID mediaId, Instant takenAt) {
        Media m = find(me, mediaId);
        if (takenAt != null && (takenAt.isBefore(Instant.parse("1900-01-01T00:00:00Z")) || takenAt.isAfter(Instant.now().plus(2, ChronoUnit.DAYS)))) {
            throw ApiException.badRequest("Geçersiz tarih");
        }
        m.setDateOverride(takenAt);
        return toResponse(media.save(m));
    }

    private String url(String key) {
        return key == null ? null : storage.presignGet(key);
    }

    /** Each file is handled on its own: a bad file yields an ERROR item and never fails the batch. */
    public UploadResponse requestUploads(CurrentUser me, UUID albumId, List<UploadFile> files) {
        if (files == null || files.isEmpty()) {
            throw ApiException.badRequest("Dosya listesi boş");
        }
        if (files.size() > properties.maxBatchSize()) {
            throw ApiException.badRequest("Tek istekte en fazla " + properties.maxBatchSize() + " dosya yüklenebilir");
        }
        albums.require(me, albumId);
        UUID spaceId = me.requireSpace();
        boolean free = quota.isFree(spaceId);

        List<Checked> checked = files.stream().map(file -> check(file, free)).toList();
        Batch batch = reserveBatchOrFallBack(me, albumId, checked);
        List<UploadItem> items = batch.failure() == null ? batch.items() : reserveOneByOne(me, albumId, checked, batch);
        return new UploadResponse(items);
    }

    /** Result of the single-transaction attempt: the items, or the file (index) whose database error rolled it back. */
    private record Batch(List<UploadItem> items, int failedAt, RuntimeException failure) {
    }

    /** A file that passed the checks that need no database. */
    private record Candidate(UploadFile file, MediaTypes.Resolved type, String filename, long size, String sha256, Instant modifiedAt) {
    }

    /** Either an ERROR item (the file failed a check) or a candidate for a reservation. */
    private record Checked(String clientId, UploadItem error, Candidate candidate) {
    }

    /** Free bytes of the space while one request reserves its files: limit and usage are read once, under the space lock. */
    private static final class Budget {
        private final long limit;
        private long used;

        private Budget(long limit, long used) {
            this.limit = limit;
            this.used = used;
        }
    }

    private Checked check(UploadFile file, boolean free) {
        String clientId = file.clientId();
        try {
            String filename = file.filename() == null ? "" : file.filename().trim();
            if (filename.isEmpty()) return rejected(clientId, "Dosya adı eksik");
            if (filename.length() > MAX_FILENAME) filename = filename.substring(0, MAX_FILENAME);

            var resolved = MediaTypes.resolve(file.contentType(), filename);
            if (resolved.isEmpty()) return rejected(clientId, "Desteklenmeyen dosya türü");

            long size = file.sizeBytes() == null ? 0 : file.sizeBytes();
            if (size <= 0) return rejected(clientId, "Dosya boş");
            long limit = limitBytes(resolved.get().kind(), free);
            if (size > limit) {
                return rejected(clientId, "Dosya çok büyük (sınır " + limit / (1024 * 1024) + " MB)");
            }

            String sha256 = null;
            if (file.sha256() != null && !file.sha256().isBlank()) {
                if (!SHA256.matcher(file.sha256().trim()).matches()) return rejected(clientId, "Geçersiz sha256");
                sha256 = file.sha256().trim().toLowerCase(Locale.ROOT);
            }
            return new Checked(clientId, null,
                    new Candidate(file, resolved.get(), filename, size, sha256, clientModifiedAt(file.lastModified())));
        } catch (RuntimeException e) {
            log.error("Could not prepare upload for client file {}", clientId, e);
            return rejected(clientId, "Yükleme hazırlanamadı");
        }
    }

    private static Checked rejected(String clientId, String message) {
        return new Checked(clientId, UploadItem.error(clientId, message), null);
    }

    /**
     * All reservations of the request in one transaction: the space row lock is taken once and serialises reservations of
     * one space, so two requests can never both claim the last free bytes. When a file hits a database error the
     * transaction is unusable: everything is rolled back and the caller falls back to one transaction per file.
     */
    private Batch reserveBatchOrFallBack(CurrentUser me, UUID albumId, List<Checked> checked) {
        try {
            return reserveBatch(me, albumId, checked);
        } catch (RuntimeException e) {
            log.warn("Upload batch for album {} could not start, falls back to one file at a time: {}", albumId, e.toString());
            return new Batch(null, -1, e);
        }
    }

    private Batch reserveBatch(CurrentUser me, UUID albumId, List<Checked> checked) {
        UUID spaceId = me.requireSpace();
        return tx.execute(status -> {
            long storageLimit = quota.lockLimit(spaceId);
            Budget budget = new Budget(storageLimit, quota.usage(spaceId));
            Set<UUID> createdInThisBatch = new HashSet<>();
            List<UploadItem> items = new ArrayList<>();
            for (int i = 0; i < checked.size(); i++) {
                Checked c = checked.get(i);
                if (c.error() != null) {
                    items.add(c.error());
                    continue;
                }
                try {
                    items.add(reserve(me, albumId, c.candidate(), createdInThisBatch, budget));
                } catch (RuntimeException e) {
                    log.warn("Upload batch for album {} falls back to one file at a time: {}", albumId, e.toString());
                    status.setRollbackOnly();
                    return new Batch(null, i, e);
                }
            }
            return new Batch(items, -1, null);
        });
    }

    /**
     * The slow path after a database error: each file in its own transaction, so a bad file never fails the batch. The file
     * that failed in the batch is answered from its error, not tried again.
     */
    private List<UploadItem> reserveOneByOne(CurrentUser me, UUID albumId, List<Checked> checked, Batch batch) {
        UUID spaceId = me.requireSpace();
        Set<UUID> createdInThisBatch = new HashSet<>();
        List<UploadItem> items = new ArrayList<>();
        for (int i = 0; i < checked.size(); i++) {
            Checked c = checked.get(i);
            if (c.error() != null) {
                items.add(c.error());
                continue;
            }
            try {
                if (i == batch.failedAt()) {
                    throw batch.failure();
                }
                items.add(tx.execute(status -> {
                    long storageLimit = quota.lockLimit(spaceId);
                    return reserve(me, albumId, c.candidate(), createdInThisBatch, new Budget(storageLimit, quota.usage(spaceId)));
                }));
            } catch (DataIntegrityViolationException e) {
                // Lost a race on (album_id, sha256): a concurrent request inserted the same file first.
                items.add(duplicateOf(spaceId, albumId, c.clientId(), c.candidate().file().sha256())
                        .orElseGet(() -> UploadItem.error(c.clientId(), "Eşzamanlı yükleme çakışması, lütfen tekrar deneyin")));
            } catch (RuntimeException e) {
                log.error("Could not prepare upload for client file {}", c.clientId(), e);
                items.add(UploadItem.error(c.clientId(), "Yükleme hazırlanamadı"));
            }
        }
        return items;
    }

    /** Must run inside a transaction that holds the space lock; adds the reserved size to the budget. */
    private UploadItem reserve(CurrentUser me, UUID albumId, Candidate c, Set<UUID> createdInThisBatch, Budget budget) {
        UUID spaceId = me.requireSpace();
        String clientId = c.file().clientId();
        Media row = null;
        if (c.sha256() != null) {
            var existing = findBySha256(spaceId, albumId, c.sha256());
            if (existing.isPresent()) {
                Media found = existing.get();
                boolean stalePending = found.getStatus() == MediaStatus.PENDING_UPLOAD
                        && !createdInThisBatch.contains(found.getId());
                if (!stalePending) return UploadItem.duplicate(clientId, found.getId());
                row = found; // an earlier attempt that never completed: reuse it for the retry
            }
        }

        // a reused row's own reservation is replaced by the new size
        long replaced = row == null ? 0 : row.getSizeBytes() + (row.getVariantsBytes() == null ? 0 : row.getVariantsBytes());
        long used = budget.used - replaced + c.size();
        if (used > budget.limit) {
            return UploadItem.quotaExceeded(clientId, ApiException.quotaExceeded().getMessage());
        }

        var type = c.type();
        if (row == null) {
            row = new Media(UUID.randomUUID(), spaceId, albumId, me.userId(), type.kind(), c.filename(),
                    type.contentType(), c.size(), c.sha256(), c.modifiedAt());
        } else {
            row.reissue(type.kind(), c.filename(), type.contentType(), c.size(), c.modifiedAt());
        }
        row.setFeatured(Boolean.TRUE.equals(c.file().featured()));
        row.setClipStartMs(type.kind() == MediaKind.VIDEO ? c.file().clipStartMs() : null);
        row = media.saveAndFlush(row);
        createdInThisBatch.add(row.getId());
        budget.used = used;

        String url = storage.presignPut(row.getOriginalKey(), type.contentType(), properties.uploadUrlTtl());
        return UploadItem.presigned(clientId, row.getId(), url, type.contentType());
    }

    /** File.lastModified from the client; anything missing, non-positive or in the future is ignored. */
    static Instant clientModifiedAt(Long epochMillis) {
        if (epochMillis == null || epochMillis <= 0) return null;
        Instant instant = Instant.ofEpochMilli(epochMillis);
        return instant.isAfter(Instant.now().plus(1, ChronoUnit.DAYS)) ? null : instant;
    }

    /** Live (not deleted) media with this hash in the album, if any. */
    public Optional<Media> findBySha256(UUID spaceId, UUID albumId, String sha256) {
        return media.findBySpaceIdAndAlbumIdAndSha256AndDeletedAtIsNull(spaceId, albumId, sha256);
    }

    private Optional<UploadItem> duplicateOf(UUID spaceId, UUID albumId, String clientId, String rawSha256) {
        if (rawSha256 == null || rawSha256.isBlank()) return Optional.empty();
        return findBySha256(spaceId, albumId, rawSha256.trim().toLowerCase(Locale.ROOT))
                .map(existing -> UploadItem.duplicate(clientId, existing.getId()));
    }

    /** Largest single file of this kind the space may upload: free (signup) spaces take only short videos. */
    private long limitBytes(UUID spaceId, MediaKind kind) {
        return limitBytes(kind, kind == MediaKind.VIDEO && quota.isFree(spaceId));
    }

    private long limitBytes(MediaKind kind, boolean free) {
        long limit = properties.limitBytes(kind);
        if (kind == MediaKind.VIDEO && free) limit = Math.min(limit, signup.freeMaxVideoSize().toBytes());
        return limit;
    }

    /** Verifies the stored object with HeadObject. Safe to call repeatedly. */
    public MediaResponse complete(CurrentUser me, UUID mediaId) {
        Media m = find(me, mediaId);
        if (m.getStatus() != MediaStatus.PENDING_UPLOAD) {
            return toResponse(m);
        }

        var head = storage.head(m.getOriginalKey())
                .orElseThrow(() -> ApiException.conflict("Dosya henüz yüklenmedi"));

        long actualSize = head.contentLength() == null ? 0 : head.contentLength();
        long limit = limitBytes(m.getSpaceId(), m.getType());
        String problem = null;
        if (actualSize <= 0) {
            problem = "Yüklenen dosya boş";
        } else if (actualSize > limit) {
            problem = "Yüklenen dosya izin verilen boyutu aşıyor";
        } else if (!MediaTypes.normalize(head.contentType()).equals(m.getContentType())) {
            problem = "Yüklenen dosyanın türü beklenenle uyuşmuyor";
        }

        if (problem != null) {
            storage.delete(m.getOriginalKey());
            m.reject();
            media.save(m);
            throw ApiException.unprocessable(problem);
        }

        // The declared size was reserved at request time, but the stored object may be bigger: check again under the lock.
        UUID spaceId = m.getSpaceId();
        UUID id = m.getId();
        boolean fits = Boolean.TRUE.equals(tx.execute(status -> {
            long storageLimit = quota.lockLimit(spaceId);
            return quota.usageExcluding(spaceId, id) + actualSize <= storageLimit;
        }));
        if (!fits) {
            storage.delete(m.getOriginalKey());
            m.reject();
            media.save(m);
            throw ApiException.quotaExceeded();
        }

        m.markUploaded(actualSize);
        m = media.save(m);
        try {
            pages.autoPlace(m.getSpaceId(), m.getAlbumId(), m.getId(), m.isFeatured());
        } catch (RuntimeException e) {
            log.warn("Could not place media {} on a page, it stays in the tray: {}", m.getId(), e.toString());
        }
        queue.ifAvailable(MediaProcessingQueue::kick);
        return toResponse(m);
    }

    public MediaResponse updateCaption(CurrentUser me, UUID mediaId, String caption) {
        Media m = find(me, mediaId);
        String cleaned = caption == null ? "" : caption.trim();
        m.setCaption(cleaned.isEmpty() ? null : cleaned);
        m = media.save(m);
        return toResponse(m);
    }

    /**
     * Soft delete: the object stays in the bucket (and in the quota) until the trash purge removes it for good, 30 days
     * later (see TrashPurgeJob).
     */
    public void delete(CurrentUser me, UUID mediaId) {
        Media m = find(me, mediaId);
        m.softDelete();
        media.save(m);
        pages.removeMedia(m.getSpaceId(), m.getId());
    }

    public record OriginalDownload(String url, String filename) {
    }

    /**
     * "Orijinal dosya" in the lightbox: a short-lived presigned link that downloads the original under its own file name. Only
     * the caller's own live media (the same 404 for another space's ids).
     */
    public OriginalDownload originalDownload(CurrentUser me, UUID mediaId) {
        Media m = find(me, mediaId);
        if (!LISTED.contains(m.getStatus())) throw ApiException.notFound("Medya bulunamadı");
        return new OriginalDownload(storage.presignDownload(m.getOriginalKey(), m.getOriginalFilename(), m.getContentType()),
                m.getOriginalFilename());
    }

    private Media find(CurrentUser me, UUID mediaId) {
        return media.findByIdAndSpaceIdAndDeletedAtIsNull(mediaId, me.requireSpace())
                .orElseThrow(() -> ApiException.notFound("Medya bulunamadı"));
    }
}
