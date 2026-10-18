package com.lovesite.space;

import com.lovesite.backup.PurgeLog;
import com.lovesite.storage.StorageService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.sql.Timestamp;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

/**
 * "Deleting" a photo, video or album only hides it (soft delete); it keeps counting against the space quota. Once it has
 * been in the trash for the retention period (30 days) this job removes the bucket objects (original and every variant)
 * and the rows for good, which is what finally frees the space. There is no restore UI: the 30 days are a safety net
 * for support, not a feature.
 */
@Component
public class TrashPurgeJob {

    private static final Logger log = LoggerFactory.getLogger(TrashPurgeJob.class);
    private static final int BATCH = 200;

    public record Result(int media, int albums) {
    }

    private record Doomed(UUID id, String originalKey, List<String> keys) {
    }

    private final JdbcTemplate jdbc;
    private final StorageService storage;
    private final SpaceProperties properties;
    private final PurgeLog purgeLog;
    private final com.lovesite.role.Roles roles;

    public TrashPurgeJob(JdbcTemplate jdbc, StorageService storage, SpaceProperties properties, PurgeLog purgeLog,
                         com.lovesite.role.Roles roles) {
        this.purgeLog = purgeLog;
        this.roles = roles;
        this.jdbc = jdbc;
        this.storage = storage;
        this.properties = properties;
    }

    @Scheduled(cron = "0 30 3 * * *", zone = "Europe/Istanbul")
    public void scheduledPurge() {
        if (!roles.runs(com.lovesite.role.Roles.Job.TRASH_PURGE)) return;
        try {
            purge(Instant.now());
        } catch (RuntimeException e) {
            log.error("Trash purge failed, it will run again tomorrow", e);
        }
    }

    /** The song of an album that stayed in the trash long enough goes with it (and stops counting against the quota). */
    private void purgeAlbumMusic(Timestamp cutoff, Instant now) {
        List<Object[]> albums = jdbc.query("SELECT id, music_key, music_pending_key FROM album WHERE deleted_at < ? "
                + "AND (music_key IS NOT NULL OR music_pending_key IS NOT NULL)",
                (rs, i) -> new Object[] {rs.getObject(1, UUID.class), rs.getString(2), rs.getString(3)}, cutoff);
        for (Object[] row : albums) {
            try {
                if (row[1] != null) {
                    storage.delete((String) row[1]);
                    purgeLog.record((String) row[1], now);
                }
                if (row[2] != null) storage.delete((String) row[2]);
                jdbc.update("UPDATE album SET music_key = NULL, music_content_type = NULL, music_size_bytes = NULL, music_original_filename = NULL, "
                        + "music_pending_key = NULL, music_pending_content_type = NULL, music_pending_size_bytes = NULL, music_pending_filename = NULL WHERE id = ?", row[0]);
            } catch (RuntimeException e) {
                log.warn("Could not purge the song of album {}: {}", row[0], e.toString());
            }
        }
    }

    /** Everything deleted before now - retention goes. Objects are removed first: a row is only dropped once its files are gone. */
    public Result purge(Instant now) {
        Timestamp cutoff = Timestamp.from(now.minus(properties.trashRetention()));
        int media = 0;
        while (true) {
            List<Doomed> batch = jdbc.query(
                    "SELECT id, original_key, thumb_key, display_key, loop_key, poster_key FROM media "
                            + "WHERE status <> 'PROCESSING' AND ((deleted_at IS NOT NULL AND deleted_at < ?) "
                            + "OR album_id IN (SELECT id FROM album WHERE deleted_at < ?)) ORDER BY created_at LIMIT " + BATCH,
                    (rs, i) -> {
                        List<String> keys = new ArrayList<>();
                        for (int c = 2; c <= 6; c++) {
                            if (rs.getString(c) != null) keys.add(rs.getString(c));
                        }
                        return new Doomed(rs.getObject(1, UUID.class), rs.getString(2), keys);
                    }, cutoff, cutoff);
            if (batch.isEmpty()) break;
            int removedInBatch = 0;
            for (Doomed d : batch) {
                try {
                    d.keys().forEach(storage::delete);
                    jdbc.update("DELETE FROM media WHERE id = ?", d.id());
                    // the backup copy of the original lives on for its own retention period
                    purgeLog.record(d.originalKey(), now);
                    removedInBatch++;
                } catch (RuntimeException e) {
                    log.warn("Could not purge media {}, keeping it for the next run: {}", d.id(), e.toString());
                }
            }
            media += removedInBatch;
            if (removedInBatch == 0) break; // everything left in this batch failed: do not spin
        }
        purgeAlbumMusic(cutoff, now);
        int albums = jdbc.update("DELETE FROM album a WHERE a.deleted_at < ? AND NOT EXISTS (SELECT 1 FROM media m WHERE m.album_id = a.id)", cutoff);
        if (media > 0 || albums > 0) log.info("Trash purge removed {} media item(s) and {} album(s)", media, albums);
        return new Result(media, albums);
    }
}
