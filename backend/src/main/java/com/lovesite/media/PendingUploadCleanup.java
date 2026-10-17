package com.lovesite.media;

import com.lovesite.storage.StorageService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.time.Instant;

/** Removes uploads that were requested but never completed (abandoned tabs, failed networks). */
@Component
public class PendingUploadCleanup {

    private static final Logger log = LoggerFactory.getLogger(PendingUploadCleanup.class);

    private final MediaRepository media;
    private final StorageService storage;
    private final MediaProperties properties;

    public PendingUploadCleanup(MediaRepository media, StorageService storage, MediaProperties properties) {
        this.media = media;
        this.storage = storage;
        this.properties = properties;
    }

    @Scheduled(initialDelayString = "PT5M", fixedDelayString = "PT1H")
    public void scheduledCleanup() {
        cleanup(Instant.now());
    }

    /** Deletes the object (if any) and the row of every PENDING_UPLOAD older than the pending TTL. */
    public int cleanup(Instant now) {
        int removed = 0;
        for (Media m : media.findByStatusAndCreatedAtBefore(MediaStatus.PENDING_UPLOAD, now.minus(properties.pendingTtl()))) {
            try {
                storage.delete(m.getOriginalKey());
                media.delete(m);
                removed++;
            } catch (RuntimeException e) {
                log.warn("Could not clean up stale upload {}: {}", m.getId(), e.toString());
            }
        }
        if (removed > 0) log.info("Removed {} stale pending uploads", removed);
        return removed;
    }
}
