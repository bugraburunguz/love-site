package com.lovesite.storage;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.stereotype.Component;

/**
 * Applies the bucket CORS rules at startup. A failure is logged loudly but does not stop the app:
 * everything except direct browser uploads still works.
 */
@Component
public class BucketCorsInitializer implements ApplicationRunner {

    private static final Logger log = LoggerFactory.getLogger(BucketCorsInitializer.class);

    private final StorageProperties properties;
    private final StorageService storage;
    private final com.lovesite.role.Roles roles;

    public BucketCorsInitializer(StorageProperties properties, StorageService storage, com.lovesite.role.Roles roles) {
        this.properties = properties;
        this.storage = storage;
        this.roles = roles;
    }

    @Override
    public void run(ApplicationArguments args) {
        if (!roles.runs(com.lovesite.role.Roles.Job.BUCKET_CORS)) return;
        if (!properties.configureCors()) {
            log.info("Bucket CORS configuration disabled");
            return;
        }
        if (properties.allowedOrigins().isEmpty()) {
            log.warn("APP_ALLOWED_ORIGINS is empty: bucket CORS not configured, browser uploads will fail");
            return;
        }
        try {
            storage.headBucket();
            log.info("Bucket reachable with the configured credentials");
        } catch (Exception e) {
            log.error("Bucket is NOT reachable (HeadBucket failed), check S3_* variables: {}", e.toString());
        }
        try {
            storage.putBucketCors(properties.allowedOrigins());
            log.info("Bucket CORS configured for origins {}", properties.allowedOrigins());
        } catch (Exception e) {
            log.error("Could not configure bucket CORS (PutBucketCors failed): {}", e.toString());
        }
    }
}
