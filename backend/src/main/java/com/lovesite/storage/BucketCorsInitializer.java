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
    private final com.lovesite.mobile.MobileProperties mobile;

    public BucketCorsInitializer(StorageProperties properties, StorageService storage, com.lovesite.role.Roles roles,
                                 com.lovesite.mobile.MobileProperties mobile) {
        this.mobile = mobile;
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
        // the store apps upload straight to the bucket from their own origins too
        java.util.List<String> origins = new java.util.ArrayList<>(properties.allowedOrigins());
        mobile.origins().stream().filter(o -> !origins.contains(o)).forEach(origins::add);
        try {
            storage.putBucketCors(origins);
            log.info("Bucket CORS configured for origins {}", origins);
        } catch (Exception e) {
            // a provider that refuses a non-http origin (capacitor://) must not break the website's uploads
            log.warn("PutBucketCors with the app origins failed ({}), retrying with the website origins only", e.toString());
            try {
                storage.putBucketCors(properties.allowedOrigins());
                log.warn("Bucket CORS configured for {} only: uploads from the store apps will fail", properties.allowedOrigins());
            } catch (Exception again) {
                log.error("Could not configure bucket CORS (PutBucketCors failed): {}", again.toString());
            }
        }
    }
}
