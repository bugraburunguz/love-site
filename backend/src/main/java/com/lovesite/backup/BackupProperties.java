package com.lovesite.backup;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.boot.context.properties.bind.DefaultValue;

import java.time.Duration;
import java.util.ArrayList;
import java.util.List;

/**
 * Second S3-compatible bucket (any provider; Cloudflare R2 is what the README recommends) the nightly backup writes to.
 * Not configured = backup is off.
 */
@ConfigurationProperties(prefix = "app.backup")
public record BackupProperties(
        String endpoint,
        String bucket,
        String accessKeyId,
        String secretAccessKey,
        @DefaultValue("auto") String region,
        @DefaultValue("false") boolean pathStyle,
        /** how long a purged original stays at the target */
        @DefaultValue("30d") Duration purgedRetention,
        /** database dumps kept (one per day) */
        @DefaultValue("14") int dbKeepDays,
        @DefaultValue("10m") Duration dumpTimeout) {

    public boolean enabled() {
        return missing().isEmpty();
    }

    /** Names of the BACKUP_S3_* variables that are not set. */
    public List<String> missing() {
        List<String> missing = new ArrayList<>();
        if (blank(endpoint)) missing.add("BACKUP_S3_ENDPOINT");
        if (blank(bucket)) missing.add("BACKUP_S3_BUCKET");
        if (blank(accessKeyId)) missing.add("BACKUP_S3_ACCESS_KEY_ID");
        if (blank(secretAccessKey)) missing.add("BACKUP_S3_SECRET_ACCESS_KEY");
        return missing;
    }

    public boolean partiallyConfigured() {
        return !enabled() && missing().size() < 4;
    }

    private static boolean blank(String s) {
        return s == null || s.isBlank();
    }
}
