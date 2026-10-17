package com.lovesite.storage;

import org.springframework.boot.context.properties.ConfigurationProperties;

import java.util.List;

/**
 * S3-compatible bucket settings. On Railway map the bucket variables with
 * S3_ENDPOINT=${{Bucket.ENDPOINT}}, S3_BUCKET=${{Bucket.BUCKET}}, and so on (see README).
 */
@ConfigurationProperties(prefix = "app.storage")
public record StorageProperties(
        String endpoint,
        String bucket,
        String accessKeyId,
        String secretAccessKey,
        String region,
        boolean pathStyle,
        boolean configureCors,
        List<String> allowedOrigins) {

    public StorageProperties {
        if (region == null || region.isBlank()) region = "auto";
        if (allowedOrigins == null) allowedOrigins = List.of();
    }
}
