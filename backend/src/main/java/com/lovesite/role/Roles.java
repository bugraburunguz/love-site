package com.lovesite.role;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import java.util.EnumSet;
import java.util.Set;

import static com.lovesite.role.AppRole.ALL;
import static com.lovesite.role.AppRole.WEB;
import static com.lovesite.role.AppRole.WORKER;

/**
 * THE one place that says what runs where. Every scheduled job, poller and startup task asks `runs(Job.X)` before doing
 * anything; nothing else in the code looks at the role.
 *
 * | job                     | ALL | WEB | WORKER |
 * |-------------------------|-----|-----|--------|
 * | PUBLIC_API              |  x  |  x  |        |  API + SPA on the public port (worker answers only the health check there)
 * | MEDIA_QUEUE             |  x  |     |   x    |  media processing poller (every 3 s) and the post-upload kick
 * | EXPORT_QUEUE            |  x  |     |   x    |  export poller (every 3 s), lower priority than media
 * | RENDER_ENDPOINT         |  x  |     |   x    |  127.0.0.1-only connector: SPA for Chromium + render data (HMAC token)
 * | EXPORT_CLEANUP          |  x  |     |   x    |  every 10 min: export files older than 24 h are deleted
 * | TRASH_PURGE             |  x  |     |   x    |  daily 03:30: deleted media / albums older than 30 days go for good
 * | PENDING_UPLOAD_CLEANUP  |  x  |     |   x    |  hourly: uploads that never completed
 * | BACKUP                  |  x  |     |   x    |  daily 04:00 + runs requested from the admin screen (ops_request)
 * | BACKUP_RECOVERY         |  x  |     |   x    |  at startup: a RUNNING backup record of a dead worker becomes FAILED
 * | BUCKET_CORS             |  x  |  x  |        |  at startup: PutBucketCors for the browser origins
 * | USER_SEED               |  x  |  x  |        |  at startup: USER1/USER2 and the initial space
 *
 * Database migrations (Flyway) run in both roles; Flyway serialises concurrent starts with a database lock.
 */
@Component
public class Roles {

    private static final Logger log = LoggerFactory.getLogger(Roles.class);

    public enum Job {
        PUBLIC_API(ALL, WEB),
        MEDIA_QUEUE(ALL, WORKER),
        EXPORT_QUEUE(ALL, WORKER),
        RENDER_ENDPOINT(ALL, WORKER),
        EXPORT_CLEANUP(ALL, WORKER),
        TRASH_PURGE(ALL, WORKER),
        PENDING_UPLOAD_CLEANUP(ALL, WORKER),
        BACKUP(ALL, WORKER),
        BACKUP_RECOVERY(ALL, WORKER),
        BUCKET_CORS(ALL, WEB),
        USER_SEED(ALL, WEB);

        private final Set<AppRole> roles;

        Job(AppRole first, AppRole... rest) {
            this.roles = EnumSet.of(first, rest);
        }

        public boolean runsIn(AppRole role) {
            return roles.contains(role);
        }
    }

    private final AppRole role;

    public Roles(@Value("${app.role:}") String role) {
        this.role = AppRole.parse(role);
        log.info("APP_ROLE={} ({})", this.role, switch (this.role) {
            case ALL -> "API, SPA, queues and scheduled jobs in this one process";
            case WEB -> "API and SPA only; queues and scheduled jobs run in the worker";
            case WORKER -> "queues, scheduled jobs and exports; the public port only answers the health check";
        });
    }

    public AppRole role() {
        return role;
    }

    public boolean runs(Job job) {
        return job.runsIn(role);
    }
}
