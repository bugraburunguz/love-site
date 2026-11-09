package com.lovesite.space;

import com.lovesite.role.Roles;
import com.lovesite.storage.StorageService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.support.TransactionTemplate;

import java.sql.Timestamp;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

/**
 * A FREE space (public signup) that is still empty after app.signup.free-empty-ttl (30 days) gives its room in the free
 * pool back: the space and the accounts of its members go, sessions included. "Empty" means nothing anyone would miss:
 * no photo or video (not even in the trash), no album song, no day note, no special day. Albums without content and
 * unused invitations go with it. Invited spaces are never touched.
 */
@Component
public class FreeSpaceCleanupJob {

    private static final Logger log = LoggerFactory.getLogger(FreeSpaceCleanupJob.class);

    private static final String EMPTY_FREE_SPACES = "SELECT s.id FROM space s WHERE s.kind = 'FREE' AND s.created_at < ? "
            + "AND NOT EXISTS (SELECT 1 FROM media m WHERE m.space_id = s.id) "
            + "AND NOT EXISTS (SELECT 1 FROM album a WHERE a.space_id = s.id AND (a.music_key IS NOT NULL OR a.music_size_bytes IS NOT NULL "
            + "OR a.music_pending_key IS NOT NULL)) "
            + "AND NOT EXISTS (SELECT 1 FROM day_note d WHERE d.space_id = s.id) "
            + "AND NOT EXISTS (SELECT 1 FROM special_day x WHERE x.space_id = s.id) "
            // the age counts from the newest member (a partner who just joined gets their own 30 days); never the admin's space
            + "AND NOT EXISTS (SELECT 1 FROM space_member sm JOIN app_user u ON u.id = sm.user_id "
            + "WHERE sm.space_id = s.id AND (sm.joined_at >= ? OR u.is_admin))";

    private final JdbcTemplate jdbc;
    private final TransactionTemplate tx;
    private final StorageService storage;
    private final SignupProperties properties;
    private final Roles roles;

    public FreeSpaceCleanupJob(JdbcTemplate jdbc, TransactionTemplate tx, StorageService storage, SignupProperties properties, Roles roles) {
        this.jdbc = jdbc;
        this.tx = tx;
        this.storage = storage;
        this.properties = properties;
        this.roles = roles;
    }

    @Scheduled(cron = "0 45 3 * * *", zone = "Europe/Istanbul")
    public void scheduledCleanup() {
        if (!roles.runs(Roles.Job.FREE_SPACE_CLEANUP)) return;
        try {
            cleanup(Instant.now());
        } catch (RuntimeException e) {
            log.error("Free space cleanup failed, it will run again tomorrow", e);
        }
    }

    /** Removes every FREE space that is older than the TTL and still empty; returns how many went. */
    public int cleanup(Instant now) {
        Timestamp cutoff = Timestamp.from(now.minus(properties.freeEmptyTtl()));
        int removed = 0;
        for (UUID spaceId : jdbc.queryForList(EMPTY_FREE_SPACES, UUID.class, cutoff, cutoff)) {
            try {
                if (remove(spaceId, cutoff)) removed++;
            } catch (RuntimeException e) {
                // one space must not keep the others waiting until tomorrow
                log.warn("Could not remove empty free space {}: {}", spaceId, e.toString());
            }
        }
        if (removed > 0) log.info("Free space cleanup removed {} empty free space(s)", removed);
        return removed;
    }

    private boolean remove(UUID spaceId, Timestamp cutoff) {
        Boolean done = tx.execute(status -> {
            // re-checked under the space lock: an upload or note that arrived meanwhile keeps the space
            // (the space may be gone already, e.g. its owner deleted the account meanwhile)
            if (jdbc.queryForList("SELECT id FROM space WHERE id = ? FOR UPDATE", UUID.class, spaceId).isEmpty()) return false;
            List<UUID> still = jdbc.queryForList(EMPTY_FREE_SPACES + " AND s.id = ?", UUID.class, cutoff, cutoff, spaceId);
            if (still.isEmpty()) return false;
            List<UUID> members = jdbc.queryForList("SELECT user_id FROM space_member WHERE space_id = ?", UUID.class, spaceId);
            jdbc.update("DELETE FROM page_item WHERE space_id = ?", spaceId);
            jdbc.update("DELETE FROM page WHERE space_id = ?", spaceId);
            jdbc.update("DELETE FROM export_job WHERE space_id = ?", spaceId);
            jdbc.update("DELETE FROM album WHERE space_id = ?", spaceId);
            jdbc.update("DELETE FROM invitation WHERE space_id = ?", spaceId);
            jdbc.update("DELETE FROM space_member WHERE space_id = ?", spaceId);
            jdbc.update("DELETE FROM space WHERE id = ?", spaceId);
            for (UUID user : members) {
                jdbc.update("UPDATE invitation SET used_by = NULL WHERE used_by = ?", user);
                jdbc.update("DELETE FROM spring_session WHERE lower(principal_name) = "
                        + "(SELECT lower(email) FROM app_user WHERE id = ?)", user);
                jdbc.update("DELETE FROM app_user WHERE id = ? AND NOT is_admin", user);
            }
            return true;
        });
        if (!Boolean.TRUE.equals(done)) return false;
        // nothing should be stored for an empty space; anything left under its prefix (e.g. an abandoned song upload) goes too
        try {
            for (String key : storage.list("spaces/" + spaceId + "/")) storage.delete(key);
        } catch (RuntimeException e) {
            log.warn("Could not list or delete leftovers of removed free space {}: {}", spaceId, e.toString());
        }
        log.info("Removed empty free space {} and its accounts", spaceId);
        return true;
    }
}
