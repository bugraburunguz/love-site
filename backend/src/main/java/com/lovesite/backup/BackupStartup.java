package com.lovesite.backup;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.stereotype.Component;

/** One line at startup that says whether the nightly backup will run. */
@Component
public class BackupStartup implements ApplicationRunner {

    private static final Logger log = LoggerFactory.getLogger(BackupStartup.class);

    private final BackupProperties properties;
    private final BackupService backup;

    public BackupStartup(BackupProperties properties, BackupService backup) {
        this.properties = properties;
        this.backup = backup;
    }

    @Override
    public void run(ApplicationArguments args) {
        backup.markInterruptedRuns();
        if (properties.enabled()) {
            log.info("Backup is ON: nightly at 04:00 (Europe/Istanbul) to bucket '{}'", properties.bucket());
        } else if (properties.partiallyConfigured()) {
            log.warn("Backup is OFF: these variables are missing: {}", String.join(", ", properties.missing()));
        } else {
            log.warn("Backup is OFF: BACKUP_S3_* variables are not set, nothing is copied to a second bucket");
        }
    }
}
