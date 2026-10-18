package com.lovesite.backup;

import com.lovesite.role.Roles;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/** Worker side of the requests the web service writes to `ops_request` (it runs no jobs itself). */
@Component
public class OpsRequestPoller {

    private static final Logger log = LoggerFactory.getLogger(OpsRequestPoller.class);

    private final BackupService backup;
    private final Roles roles;

    public OpsRequestPoller(BackupService backup, Roles roles) {
        this.backup = backup;
        this.roles = roles;
    }

    @Scheduled(initialDelay = 5_000, fixedDelayString = "${app.ops-poll-interval:5s}")
    void poll() {
        if (!roles.runs(Roles.Job.BACKUP)) return;
        try {
            if (backup.takeRequests() && backup.enabled()) {
                log.info("Backup requested from the admin screen, starting");
                Thread.ofVirtual().name("backup-manual").start(backup::runAll);
            }
        } catch (RuntimeException e) {
            log.warn("Ops request poll failed: {}", e.toString());
        }
    }
}
