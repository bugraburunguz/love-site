package com.lovesite.space;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

import java.util.UUID;

/**
 * Storage accounting per space. Usage counts the original plus the generated variants of every media row that still
 * exists, and the songs of albums, (soft-deleted rows included until they are purged), and the declared size of uploads that are only reserved
 * (PENDING_UPLOAD). Rejected uploads no longer hold a file and count for nothing.
 *
 * Checks must run inside a transaction that first called lockLimit(): the row lock on the space serialises concurrent
 * reservations so two requests can never both fit into the last free bytes.
 */
@Service
public class QuotaService {

    private final JdbcTemplate jdbc;

    public QuotaService(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    /** SELECT ... FOR UPDATE on the space row; returns its storage limit. */
    public long lockLimit(UUID spaceId) {
        return jdbc.queryForObject("SELECT storage_limit_bytes FROM space WHERE id = ? FOR UPDATE", Long.class, spaceId);
    }

    public long usage(UUID spaceId) {
        return usageExcluding(spaceId, null);
    }

    /** Usage without one media row (its own reservation is about to be replaced by another size). */
    public long usageExcluding(UUID spaceId, UUID excludedMediaId) {
        return mediaUsage(spaceId, excludedMediaId) + musicUsage(spaceId, null);
    }

    /** Usage without the pending (not yet confirmed) song of one album: that reservation is about to be replaced. */
    public long usageWithoutPendingMusic(UUID spaceId, UUID albumId) {
        return mediaUsage(spaceId, null) + musicUsage(spaceId, albumId);
    }

    private long mediaUsage(UUID spaceId, UUID excludedMediaId) {
        return jdbc.queryForObject(
                "SELECT coalesce(sum(size_bytes + coalesce(variants_bytes, 0)), 0) FROM media "
                        + "WHERE space_id = ? AND status <> 'REJECTED' AND (?::uuid IS NULL OR id <> ?::uuid)",
                Long.class, spaceId, excludedMediaId, excludedMediaId);
    }

    /** Album songs: the stored ones plus requested uploads that are waiting for their confirmation. */
    private long musicUsage(UUID spaceId, UUID albumWithoutPending) {
        return jdbc.queryForObject(
                "SELECT coalesce(sum(coalesce(music_size_bytes, 0) + CASE WHEN ?::uuid IS NOT NULL AND id = ?::uuid THEN 0 "
                        + "ELSE coalesce(music_pending_size_bytes, 0) END), 0) FROM album WHERE space_id = ?",
                Long.class, albumWithoutPending, albumWithoutPending, spaceId);
    }
}
