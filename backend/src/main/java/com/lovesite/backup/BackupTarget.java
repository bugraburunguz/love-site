package com.lovesite.backup;

import org.springframework.stereotype.Component;
import software.amazon.awssdk.auth.credentials.AwsBasicCredentials;
import software.amazon.awssdk.auth.credentials.StaticCredentialsProvider;
import software.amazon.awssdk.core.checksums.RequestChecksumCalculation;
import software.amazon.awssdk.core.checksums.ResponseChecksumValidation;
import software.amazon.awssdk.core.sync.RequestBody;
import software.amazon.awssdk.http.apache.ApacheHttpClient;
import software.amazon.awssdk.regions.Region;
import software.amazon.awssdk.services.s3.S3Client;
import software.amazon.awssdk.services.s3.S3Configuration;
import software.amazon.awssdk.services.s3.model.DeleteObjectRequest;
import software.amazon.awssdk.services.s3.model.ListObjectsV2Request;
import software.amazon.awssdk.services.s3.model.ListObjectsV2Response;
import software.amazon.awssdk.services.s3.model.PutObjectRequest;
import software.amazon.awssdk.services.s3.model.S3Object;

import java.io.InputStream;
import java.net.URI;
import java.nio.file.Path;
import java.time.Duration;
import java.util.HashMap;
import java.util.Map;

/** The backup bucket. Plain S3 API only, so it works with any provider. Created lazily; unusable when backup is off. */
@Component
public class BackupTarget {

    private final BackupProperties properties;
    private volatile S3Client client;

    public BackupTarget(BackupProperties properties) {
        this.properties = properties;
    }

    public boolean enabled() {
        return properties.enabled();
    }

    private S3Client client() {
        S3Client c = client;
        if (c == null) {
            synchronized (this) {
                if (client == null) {
                    client = S3Client.builder()
                            .endpointOverride(URI.create(properties.endpoint()))
                            .region(Region.of(properties.region()))
                            .credentialsProvider(StaticCredentialsProvider.create(
                                    AwsBasicCredentials.create(properties.accessKeyId(), properties.secretAccessKey())))
                            .serviceConfiguration(S3Configuration.builder().pathStyleAccessEnabled(properties.pathStyle()).build())
                            .requestChecksumCalculation(RequestChecksumCalculation.WHEN_REQUIRED)
                            .responseChecksumValidation(ResponseChecksumValidation.WHEN_REQUIRED)
                            .httpClientBuilder(ApacheHttpClient.builder()
                                    .connectionTimeout(Duration.ofSeconds(5))
                                    .socketTimeout(Duration.ofSeconds(60))
                                    .connectionAcquisitionTimeout(Duration.ofSeconds(10)))
                            .build();
                }
                c = client;
            }
        }
        return c;
    }

    /** key -> size for everything under the prefix (paged). */
    public Map<String, Long> list(String prefix) {
        Map<String, Long> result = new HashMap<>();
        String token = null;
        do {
            ListObjectsV2Response page = client().listObjectsV2(ListObjectsV2Request.builder()
                    .bucket(properties.bucket()).prefix(prefix).continuationToken(token).build());
            for (S3Object o : page.contents()) result.put(o.key(), o.size());
            token = Boolean.TRUE.equals(page.isTruncated()) ? page.nextContinuationToken() : null;
        } while (token != null);
        return result;
    }

    /** Streams `size` bytes from the stream; nothing is held in memory beyond the SDK's chunk buffer. */
    public void put(String key, InputStream in, long size, String contentType) {
        client().putObject(PutObjectRequest.builder().bucket(properties.bucket()).key(key)
                .contentType(contentType == null ? "application/octet-stream" : contentType).build(),
                RequestBody.fromInputStream(in, size));
    }

    public void putFile(String key, Path file, String contentType) {
        client().putObject(PutObjectRequest.builder().bucket(properties.bucket()).key(key).contentType(contentType).build(),
                RequestBody.fromFile(file));
    }

    public void delete(String key) {
        client().deleteObject(DeleteObjectRequest.builder().bucket(properties.bucket()).key(key).build());
    }
}
