package com.lovesite.storage;

import com.github.benmanes.caffeine.cache.Cache;
import com.github.benmanes.caffeine.cache.Caffeine;
import org.springframework.stereotype.Service;
import software.amazon.awssdk.auth.credentials.AwsBasicCredentials;
import software.amazon.awssdk.auth.credentials.StaticCredentialsProvider;
import software.amazon.awssdk.core.checksums.RequestChecksumCalculation;
import software.amazon.awssdk.core.checksums.ResponseChecksumValidation;
import software.amazon.awssdk.regions.Region;
import software.amazon.awssdk.services.s3.S3Client;
import software.amazon.awssdk.services.s3.S3Configuration;
import software.amazon.awssdk.services.s3.model.CORSConfiguration;
import software.amazon.awssdk.services.s3.model.CORSRule;
import software.amazon.awssdk.services.s3.model.DeleteObjectRequest;
import software.amazon.awssdk.services.s3.model.GetObjectRequest;
import software.amazon.awssdk.services.s3.model.HeadObjectRequest;
import software.amazon.awssdk.services.s3.model.HeadObjectResponse;
import software.amazon.awssdk.services.s3.model.NoSuchKeyException;
import software.amazon.awssdk.services.s3.model.PutBucketCorsRequest;
import software.amazon.awssdk.services.s3.model.PutObjectRequest;
import software.amazon.awssdk.services.s3.presigner.S3Presigner;
import software.amazon.awssdk.services.s3.presigner.model.GetObjectPresignRequest;
import software.amazon.awssdk.services.s3.presigner.model.PutObjectPresignRequest;

import software.amazon.awssdk.core.interceptor.Context;
import software.amazon.awssdk.core.interceptor.ExecutionAttributes;
import software.amazon.awssdk.core.interceptor.ExecutionInterceptor;
import software.amazon.awssdk.http.SdkHttpRequest;

import java.net.URI;
import java.security.MessageDigest;
import java.util.Base64;
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;

/** All bucket access goes through here. Objects are private; clients only ever see presigned URLs. */
@Service
public class StorageService {

    private static final Duration GET_URL_TTL = Duration.ofMinutes(60);
    private static final Duration GET_URL_CACHE_TTL = Duration.ofMinutes(50);
    private static final String GET_CACHE_CONTROL = "private, max-age=3000";

    private final StorageProperties properties;
    private final S3Client client;
    private final S3Presigner presigner;

    /** Same key returns the same URL for 50 min so the browser HTTP cache keeps working. */
    private final Cache<String, String> getUrlCache = Caffeine.newBuilder()
            .expireAfterWrite(GET_URL_CACHE_TTL)
            .maximumSize(50_000)
            .build();

    public StorageService(StorageProperties properties) {
        this.properties = properties;
        requireConfigured(properties);

        var credentials = StaticCredentialsProvider.create(
                AwsBasicCredentials.create(properties.accessKeyId(), properties.secretAccessKey()));
        var region = Region.of(properties.region());
        var endpoint = URI.create(properties.endpoint());
        // Virtual-hosted style unless explicitly forced (local MinIO needs path style).
        var s3Config = S3Configuration.builder().pathStyleAccessEnabled(properties.pathStyle()).build();

        this.client = S3Client.builder()
                .endpointOverride(endpoint)
                .region(region)
                .credentialsProvider(credentials)
                .serviceConfiguration(s3Config)
                // Non-AWS S3 implementations do not understand the SDK's default CRC checksums.
                .requestChecksumCalculation(RequestChecksumCalculation.WHEN_REQUIRED)
                .responseChecksumValidation(ResponseChecksumValidation.WHEN_REQUIRED)
                .overrideConfiguration(c -> c.addExecutionInterceptor(CONTENT_MD5))
                .build();
        this.presigner = S3Presigner.builder()
                .endpointOverride(endpoint)
                .region(region)
                .credentialsProvider(credentials)
                .serviceConfiguration(s3Config)
                .build();
    }

    private static void requireConfigured(StorageProperties p) {
        List<String> missing = new ArrayList<>();
        if (isBlank(p.endpoint())) missing.add("S3_ENDPOINT");
        if (isBlank(p.bucket())) missing.add("S3_BUCKET");
        if (isBlank(p.accessKeyId())) missing.add("S3_ACCESS_KEY_ID");
        if (isBlank(p.secretAccessKey())) missing.add("S3_SECRET_ACCESS_KEY");
        if (!missing.isEmpty()) {
            throw new IllegalStateException("Missing required storage environment variables: " + String.join(", ", missing));
        }
    }

    private static boolean isBlank(String s) {
        return s == null || s.isBlank();
    }

    /** Presigned PUT; Content-Type is part of the signature, so the upload must send exactly this type. */
    public String presignPut(String key, String contentType, Duration ttl) {
        var request = PutObjectRequest.builder().bucket(properties.bucket()).key(key).contentType(contentType).build();
        return presigner.presignPutObject(PutObjectPresignRequest.builder()
                .signatureDuration(ttl).putObjectRequest(request).build()).url().toString();
    }

    public String presignGet(String key) {
        return getUrlCache.get(key, k -> {
            var request = GetObjectRequest.builder().bucket(properties.bucket()).key(k)
                    .responseCacheControl(GET_CACHE_CONTROL).build();
            return presigner.presignGetObject(GetObjectPresignRequest.builder()
                    .signatureDuration(GET_URL_TTL).getObjectRequest(request).build()).url().toString();
        });
    }

    /** Empty when the object does not exist. */
    public Optional<HeadObjectResponse> head(String key) {
        try {
            return Optional.of(client.headObject(HeadObjectRequest.builder().bucket(properties.bucket()).key(key).build()));
        } catch (NoSuchKeyException e) {
            return Optional.empty();
        } catch (software.amazon.awssdk.services.s3.model.S3Exception e) {
            if (e.statusCode() == 404) return Optional.empty();
            throw e;
        }
    }

    /** Deleting a missing object is not an error in S3. */
    public void delete(String key) {
        client.deleteObject(DeleteObjectRequest.builder().bucket(properties.bucket()).key(key).build());
        getUrlCache.invalidate(key);
    }

    /** Replaces the bucket CORS configuration so browsers can PUT/GET directly from the given origins. */
    public void putBucketCors(List<String> origins) {
        var rule = CORSRule.builder()
                .allowedOrigins(origins)
                .allowedMethods("PUT", "GET", "HEAD")
                .allowedHeaders("Content-Type")
                .exposeHeaders("ETag")
                .maxAgeSeconds(3000)
                .build();
        client.putBucketCors(PutBucketCorsRequest.builder()
                .bucket(properties.bucket())
                .corsConfiguration(CORSConfiguration.builder().corsRules(rule).build())
                .build());
    }

    /**
     * PutBucketCors requires an integrity header. Recent SDKs send a CRC32 checksum, but several S3-compatible
     * servers only accept the classic Content-MD5 (which is what the AWS CLI sent when this was documented).
     */
    private static final ExecutionInterceptor CONTENT_MD5 = new ExecutionInterceptor() {
        @Override
        public SdkHttpRequest modifyHttpRequest(Context.ModifyHttpRequest context, ExecutionAttributes attributes) {
            if (!(context.request() instanceof PutBucketCorsRequest)) {
                return context.httpRequest();
            }
            try {
                byte[] body = context.requestBody().orElseThrow().contentStreamProvider().newStream().readAllBytes();
                String md5 = Base64.getEncoder().encodeToString(MessageDigest.getInstance("MD5").digest(body));
                return context.httpRequest().toBuilder().putHeader("Content-MD5", md5).build();
            } catch (Exception e) {
                throw new IllegalStateException("Could not compute Content-MD5", e);
            }
        }
    };
}
