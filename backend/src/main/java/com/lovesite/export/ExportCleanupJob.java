package com.lovesite.export;

import com.lovesite.role.Roles;
import com.lovesite.storage.StorageService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.sql.Timestamp;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

/**
 * Export results are temporary: 24 h after they were made the files (everything under spaces/{space}/exports/{job}/) and the
 * row are deleted. They never counted against the quota.
 */
@Component
public class ExportCleanupJob {

    private static final Logger log = LoggerFactory.getLogger(ExportCleanupJob.class);

    private final JdbcTemplate jdbc;
    private final StorageService storage;
    private final Roles roles;

    public ExportCleanupJob(JdbcTemplate jdbc, StorageService storage, Roles roles) {
        this.jdbc = jdbc;
        this.storage = storage;
        this.roles = roles;
    }

    @Scheduled(initialDelay = 60_000, fixedDelayString = "${app.export.cleanup-interval:10m}")
    void scheduled() {
        if (!roles.runs(Roles.Job.EXPORT_CLEANUP)) return;
        try {
            purgeExpired(Instant.now());
        } catch (RuntimeException e) {
            log.warn("Export cleanup failed, it runs again later: {}", e.toString());
        }
    }

    /** Returns how many exports were removed. A RUNNING one is left to the stale-job rule of the queue. */
    public int purgeExpired(Instant now) {
        int removed = 0;
        while (true) {
            List<UUID[]> batch = jdbc.query("SELECT id, space_id FROM export_job WHERE expires_at < ? AND status <> 'RUNNING' ORDER BY expires_at LIMIT 100",
                    (rs, i) -> new UUID[] {rs.getObject(1, UUID.class), rs.getObject(2, UUID.class)}, Timestamp.from(now));
            if (batch.isEmpty()) break;
            int inBatch = 0;
            for (UUID[] row : batch) {
                try {
                    // every object under the job's prefix, so a half-finished upload leaves nothing behind either
                    for (String key : storage.list(ExportQueue.prefix(row[1], row[0]))) storage.delete(key);
                    jdbc.update("DELETE FROM export_job WHERE id = ?", row[0]);
                    inBatch++;
                } catch (RuntimeException e) {
                    log.warn("Could not remove export {}: {}", row[0], e.toString());
                }
            }
            removed += inBatch;
            if (inBatch == 0) break;
        }
        if (removed > 0) log.info("Removed {} expired export(s)", removed);
        return removed;
    }
}
