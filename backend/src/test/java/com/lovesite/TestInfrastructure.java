package com.lovesite;

import org.springframework.test.context.DynamicPropertyRegistry;
import org.testcontainers.containers.GenericContainer;
import org.testcontainers.containers.wait.strategy.Wait;
import org.testcontainers.postgresql.PostgreSQLContainer;
import software.amazon.awssdk.auth.credentials.AwsBasicCredentials;
import software.amazon.awssdk.auth.credentials.StaticCredentialsProvider;
import software.amazon.awssdk.core.checksums.RequestChecksumCalculation;
import software.amazon.awssdk.regions.Region;
import software.amazon.awssdk.services.s3.S3Client;
import software.amazon.awssdk.services.s3.S3Configuration;
import software.amazon.awssdk.services.s3.model.CreateBucketRequest;

import java.net.URI;

/** One Postgres and one S3-compatible server for the whole test JVM, shared by every Spring test class. */
public final class TestInfrastructure {

    public static final String BUCKET = "test-bucket";
    // MinIO's community images are no longer published; CloudServer verifies SigV4 signatures like S3 does.
    public static final String S3_USER = "testaccesskey";
    public static final String S3_SECRET = "testsecretkey12345";

    public static final PostgreSQLContainer POSTGRES = new PostgreSQLContainer("postgres:17");
    public static final GenericContainer<?> S3 = new GenericContainer<>("zenko/cloudserver:latest")
            .withEnv("S3BACKEND", "mem")
            // CloudServer only accepts hosts it knows as REST endpoints.
            .withEnv("ENDPOINT", org.testcontainers.DockerClientFactory.instance().dockerHostIpAddress())
            .withEnv("SCALITY_ACCESS_KEY_ID", S3_USER)
            .withEnv("SCALITY_SECRET_ACCESS_KEY", S3_SECRET)
            .withExposedPorts(8000)
            .waitingFor(Wait.forListeningPort());

    public static final S3Client ADMIN;

    static {
        POSTGRES.start();
        S3.start();
        ADMIN = S3Client.builder()
                .endpointOverride(URI.create(s3Url()))
                .region(Region.US_EAST_1)
                .credentialsProvider(StaticCredentialsProvider.create(AwsBasicCredentials.create(S3_USER, S3_SECRET)))
                .serviceConfiguration(S3Configuration.builder().pathStyleAccessEnabled(true).build())
                .requestChecksumCalculation(RequestChecksumCalculation.WHEN_REQUIRED)
                .build();
        ADMIN.createBucket(CreateBucketRequest.builder().bucket(BUCKET).build());
    }

    private TestInfrastructure() {
    }

    public static String s3Url() {
        return "http://" + S3.getHost() + ":" + S3.getMappedPort(8000);
    }

    public static void register(DynamicPropertyRegistry r) {
        r.add("spring.datasource.url", POSTGRES::getJdbcUrl);
        r.add("spring.datasource.username", POSTGRES::getUsername);
        r.add("spring.datasource.password", POSTGRES::getPassword);
        r.add("app.seed.user1.email", () -> "a@test.io");
        r.add("app.seed.user1.name", () -> "A");
        r.add("app.seed.user1.password", () -> "pw1");
        r.add("app.seed.user2.email", () -> "b@test.io");
        r.add("app.seed.user2.name", () -> "B");
        r.add("app.seed.user2.password", () -> "pw2");
        r.add("app.storage.endpoint", TestInfrastructure::s3Url);
        r.add("app.storage.bucket", () -> BUCKET);
        r.add("app.storage.access-key-id", () -> S3_USER);
        r.add("app.storage.secret-access-key", () -> S3_SECRET);
        r.add("app.storage.region", () -> "us-east-1");
        r.add("app.storage.path-style", () -> "true");
        r.add("app.storage.allowed-origins", () -> "http://localhost:5173");
        // tests drive the processing queue by hand
        r.add("app.processing.auto-poll", () -> "false");
    }
}
