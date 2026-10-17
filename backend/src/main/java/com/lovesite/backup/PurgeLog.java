package com.lovesite.backup;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

import java.sql.Timestamp;
import java.time.Instant;

/**
 * Remembers that an original / song was removed for good, so its backup copy can be deleted 30 days later instead of at
 * once. Only written when backup is configured (otherwise nothing would ever read it).
 */
@Component
public class PurgeLog {

    private final JdbcTemplate jdbc;
    private final BackupProperties properties;

    public PurgeLog(JdbcTemplate jdbc, BackupProperties properties) {
        this.jdbc = jdbc;
        this.properties = properties;
    }

    public void record(String key, Instant at) {
        if (key == null || !properties.enabled()) return;
        jdbc.update("INSERT INTO purged_object (object_key, purged_at) VALUES (?, ?) ON CONFLICT (object_key) DO NOTHING",
                key, Timestamp.from(at));
    }

    public void record(String key) {
        record(key, Instant.now());
    }
}
