package com.lovesite;

import com.jayway.jsonpath.JsonPath;
import com.lovesite.media.PendingUploadCleanup;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.RequestPostProcessor;
import org.testcontainers.containers.GenericContainer;
import org.testcontainers.containers.wait.strategy.Wait;
import org.testcontainers.postgresql.PostgreSQLContainer;
import software.amazon.awssdk.auth.credentials.AwsBasicCredentials;
import software.amazon.awssdk.auth.credentials.StaticCredentialsProvider;
import software.amazon.awssdk.regions.Region;
import software.amazon.awssdk.services.s3.S3Client;
import software.amazon.awssdk.services.s3.S3Configuration;
import software.amazon.awssdk.services.s3.model.CreateBucketRequest;
import software.amazon.awssdk.services.s3.model.GetBucketCorsRequest;
import software.amazon.awssdk.services.s3.model.HeadObjectRequest;
import software.amazon.awssdk.services.s3.model.NoSuchKeyException;
import software.amazon.awssdk.services.s3.model.PutObjectRequest;
import software.amazon.awssdk.core.sync.RequestBody;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Instant;
import java.time.temporal.ChronoUnit;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@AutoConfigureMockMvc
class MediaUploadIntegrationTest {

    static final String BUCKET = "test-bucket";
    static final long MAX_IMAGE_BYTES = 1000;

    static final PostgreSQLContainer POSTGRES = new PostgreSQLContainer("postgres:17");
    // S3-compatible server (MinIO's community images are no longer published). Verifies SigV4 signatures.
    static final String S3_USER = "testaccesskey";
    static final String S3_SECRET = "testsecretkey12345";
    static final GenericContainer<?> S3 = new GenericContainer<>("zenko/cloudserver:latest")
            .withEnv("S3BACKEND", "mem")
            // CloudServer only accepts hosts it knows as REST endpoints.
            .withEnv("ENDPOINT", org.testcontainers.DockerClientFactory.instance().dockerHostIpAddress())
            .withEnv("SCALITY_ACCESS_KEY_ID", S3_USER)
            .withEnv("SCALITY_SECRET_ACCESS_KEY", S3_SECRET)
            .withExposedPorts(8000)
            .waitingFor(Wait.forListeningPort());

    static String s3Url() {
        return "http://" + S3.getHost() + ":" + S3.getMappedPort(8000);
    }
    static S3Client admin;

    static {
        POSTGRES.start();
        S3.start();
        admin = S3Client.builder()
                .endpointOverride(URI.create(s3Url()))
                .region(Region.US_EAST_1)
                .credentialsProvider(StaticCredentialsProvider.create(
                        AwsBasicCredentials.create(S3_USER, S3_SECRET)))
                .serviceConfiguration(S3Configuration.builder().pathStyleAccessEnabled(true).build())
                .requestChecksumCalculation(software.amazon.awssdk.core.checksums.RequestChecksumCalculation.WHEN_REQUIRED)
                .build();
        admin.createBucket(CreateBucketRequest.builder().bucket(BUCKET).build());
    }

    @DynamicPropertySource
    static void properties(DynamicPropertyRegistry r) {
        r.add("spring.datasource.url", POSTGRES::getJdbcUrl);
        r.add("spring.datasource.username", POSTGRES::getUsername);
        r.add("spring.datasource.password", POSTGRES::getPassword);
        r.add("app.seed.user1.email", () -> "a@test.io");
        r.add("app.seed.user1.name", () -> "A");
        r.add("app.seed.user1.password", () -> "pw1");
        r.add("app.seed.user2.email", () -> "b@test.io");
        r.add("app.seed.user2.name", () -> "B");
        r.add("app.seed.user2.password", () -> "pw2");
        r.add("app.storage.endpoint", MediaUploadIntegrationTest::s3Url);
        r.add("app.storage.bucket", () -> BUCKET);
        r.add("app.storage.access-key-id", () -> S3_USER);
        r.add("app.storage.secret-access-key", () -> S3_SECRET);
        r.add("app.storage.region", () -> "us-east-1");
        r.add("app.storage.path-style", () -> "true");
        r.add("app.storage.allowed-origins", () -> "http://localhost:5173");
        r.add("app.media.max-image-size", () -> MAX_IMAGE_BYTES + "B");
    }

    @Autowired MockMvc mvc;
    @Autowired JdbcTemplate jdbc;
    @Autowired PendingUploadCleanup cleanup;

    final HttpClient http = HttpClient.newHttpClient();
    static final RequestPostProcessor USER = user("a@test.io");

    // ---- helpers

    String json(org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder req, String body, int expected)
            throws Exception {
        return mvc.perform(req.with(USER).with(csrf()).contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().is(expected)).andReturn().getResponse().getContentAsString();
    }

    String createAlbum() throws Exception {
        String body = json(post("/api/albums"), "{\"title\":\"Test\"}", 201);
        return JsonPath.read(body, "$.id");
    }

    String uploads(String albumId, String filesJson) throws Exception {
        return json(post("/api/albums/" + albumId + "/uploads"), "{\"files\":" + filesJson + "}", 200);
    }

    static String file(String clientId, String name, String type, long size, String sha) {
        return "{\"clientId\":\"" + clientId + "\",\"filename\":\"" + name + "\",\"contentType\":\"" + type
                + "\",\"sizeBytes\":" + size + (sha == null ? "" : ",\"sha256\":\"" + sha + "\"") + "}";
    }

    static String sha(char c) {
        return String.valueOf(c).repeat(64);
    }

    int put(String url, String contentType, byte[] data) throws Exception {
        var request = HttpRequest.newBuilder(URI.create(url)).header("Content-Type", contentType)
                .PUT(HttpRequest.BodyPublishers.ofByteArray(data)).build();
        return http.send(request, HttpResponse.BodyHandlers.discarding()).statusCode();
    }

    String complete(String mediaId, int expected) throws Exception {
        return mvc.perform(post("/api/media/" + mediaId + "/complete").with(USER).with(csrf()))
                .andExpect(status().is(expected)).andReturn().getResponse().getContentAsString();
    }

    boolean objectExists(String key) {
        try {
            admin.headObject(HeadObjectRequest.builder().bucket(BUCKET).key(key).build());
            return true;
        } catch (NoSuchKeyException e) {
            return false;
        }
    }

    // ---- tests

    @Test
    void requiresAuthentication() throws Exception {
        mvc.perform(get("/api/albums")).andExpect(status().isUnauthorized());
    }

    @Test
    void albumCrud() throws Exception {
        String id = createAlbum();
        String renamed = json(patch("/api/albums/" + id), "{\"title\":\"New\"}", 200);
        assertThat(JsonPath.<String>read(renamed, "$.title")).isEqualTo("New");
        mvc.perform(delete("/api/albums/" + id).with(USER).with(csrf())).andExpect(status().isNoContent());
        String list = mvc.perform(get("/api/albums").with(USER)).andReturn().getResponse().getContentAsString();
        assertThat(list).doesNotContain(id);
        mvc.perform(get("/api/albums/" + id + "/media").with(USER)).andExpect(status().isNotFound());
    }

    @Test
    void uploadFlowPresignPutComplete() throws Exception {
        String album = createAlbum();
        byte[] data = "fake-jpeg-bytes".getBytes();
        String res = uploads(album, "[" + file("c1", "IMG_0001.JPG", "image/jpeg", data.length, sha('1')) + "]");
        assertThat(JsonPath.<String>read(res, "$.items[0].result")).isEqualTo("PRESIGNED");
        String url = JsonPath.read(res, "$.items[0].uploadUrl");
        String mediaId = JsonPath.read(res, "$.items[0].mediaId");
        assertThat(url).doesNotContain("checksum");

        // Not uploaded yet: complete must not succeed.
        complete(mediaId, 409);

        assertThat(put(url, "image/jpeg", data)).isEqualTo(200);
        String done = complete(mediaId, 200);
        assertThat(JsonPath.<String>read(done, "$.status")).isEqualTo("UPLOADED");
        // Idempotent.
        complete(mediaId, 200);

        // The key never contains the filename.
        String key = jdbc.queryForObject("select original_key from media where id = ?::uuid", String.class, mediaId);
        assertThat(key).isEqualTo("albums/" + album + "/media/" + mediaId + "/original");

        // Listing returns a presigned GET url that serves the bytes, and is stable across requests.
        String list1 = mvc.perform(get("/api/albums/" + album + "/media").with(USER)).andReturn().getResponse().getContentAsString();
        String list2 = mvc.perform(get("/api/albums/" + album + "/media").with(USER)).andReturn().getResponse().getContentAsString();
        String getUrl = JsonPath.read(list1, "$[0].url");
        assertThat(JsonPath.<String>read(list2, "$[0].url")).isEqualTo(getUrl);
        assertThat(JsonPath.<String>read(list1, "$[0].originalFilename")).isEqualTo("IMG_0001.JPG");
        var got = http.send(HttpRequest.newBuilder(URI.create(getUrl)).GET().build(), HttpResponse.BodyHandlers.ofByteArray());
        assertThat(got.statusCode()).isEqualTo(200);
        assertThat(got.body()).isEqualTo(data);

        // Soft delete hides it but keeps the object.
        mvc.perform(delete("/api/media/" + mediaId).with(USER).with(csrf())).andExpect(status().isNoContent());
        String list3 = mvc.perform(get("/api/albums/" + album + "/media").with(USER)).andReturn().getResponse().getContentAsString();
        assertThat(list3).isEqualTo("[]");
        assertThat(objectExists(key)).isTrue();
    }

    @Test
    void completeRejectsOversizedObjectAndDeletesIt() throws Exception {
        String album = createAlbum();
        byte[] big = new byte[(int) MAX_IMAGE_BYTES + 500];
        // Declared size is within the limit, the actual upload is not.
        String res = uploads(album, "[" + file("c1", "big.png", "image/png", 10, sha('2')) + "]");
        String url = JsonPath.read(res, "$.items[0].uploadUrl");
        String mediaId = JsonPath.read(res, "$.items[0].mediaId");
        assertThat(put(url, "image/png", big)).isEqualTo(200);

        String key = jdbc.queryForObject("select original_key from media where id = ?::uuid", String.class, mediaId);
        assertThat(objectExists(key)).isTrue();

        complete(mediaId, 422);

        assertThat(objectExists(key)).isFalse();
        assertThat(jdbc.queryForObject("select status from media where id = ?::uuid", String.class, mediaId))
                .isEqualTo("REJECTED");
        // Rejected media no longer blocks the same hash.
        String again = uploads(album, "[" + file("c1", "big.png", "image/png", 10, sha('2')) + "]");
        assertThat(JsonPath.<String>read(again, "$.items[0].result")).isEqualTo("PRESIGNED");
    }

    @Test
    void duplicateSha256IsReportedAndNoSecondRowIsCreated() throws Exception {
        String album = createAlbum();
        byte[] data = "same-photo".getBytes();
        String res = uploads(album, "[" + file("c1", "a.jpg", "image/jpeg", data.length, sha('3')) + "]");
        String mediaId = JsonPath.read(res, "$.items[0].mediaId");
        put(JsonPath.read(res, "$.items[0].uploadUrl"), "image/jpeg", data);
        complete(mediaId, 200);

        String dup = uploads(album, "[" + file("c2", "copy.jpg", "image/jpeg", data.length, sha('3')) + "]");
        assertThat(JsonPath.<String>read(dup, "$.items[0].result")).isEqualTo("DUPLICATE");
        assertThat(JsonPath.<String>read(dup, "$.items[0].mediaId")).isEqualTo(mediaId);
        assertThat(JsonPath.<Object>read(dup, "$.items[0].uploadUrl")).isNull();
        assertThat(jdbc.queryForObject("select count(*) from media where album_id = ?::uuid", Integer.class, album)).isEqualTo(1);

        // The same photo in another album is fine.
        String other = createAlbum();
        String ok = uploads(other, "[" + file("c3", "a.jpg", "image/jpeg", data.length, sha('3')) + "]");
        assertThat(JsonPath.<String>read(ok, "$.items[0].result")).isEqualTo("PRESIGNED");
    }

    @Test
    void oneInvalidFileDoesNotFailTheBatch() throws Exception {
        String album = createAlbum();
        String files = "[" + file("ok", "a.jpg", "image/jpeg", 100, sha('4')) + ","
                + file("bad-type", "doc.pdf", "application/pdf", 100, null) + ","
                + file("too-big", "huge.jpg", "image/jpeg", MAX_IMAGE_BYTES + 1, null) + ","
                + file("empty", "e.jpg", "image/jpeg", 0, null) + ","
                + file("heic", "IMG_1.HEIC", "", 100, sha('5')) + ","
                + file("octet", "IMG_2.heic", "application/octet-stream", 100, null) + "]";
        String res = uploads(album, files);

        assertThat(JsonPath.<String>read(res, "$.items[0].result")).isEqualTo("PRESIGNED");
        assertThat(JsonPath.<String>read(res, "$.items[1].result")).isEqualTo("ERROR");
        assertThat(JsonPath.<String>read(res, "$.items[1].clientId")).isEqualTo("bad-type");
        assertThat(JsonPath.<String>read(res, "$.items[2].result")).isEqualTo("ERROR");
        assertThat(JsonPath.<String>read(res, "$.items[3].result")).isEqualTo("ERROR");
        // iOS HEIC with an empty or generic MIME is resolved from the extension.
        assertThat(JsonPath.<String>read(res, "$.items[4].contentType")).isEqualTo("image/heic");
        assertThat(JsonPath.<String>read(res, "$.items[5].contentType")).isEqualTo("image/heic");
    }

    @Test
    void batchLimitAndEmptyBatchAreRejected() throws Exception {
        String album = createAlbum();
        StringBuilder many = new StringBuilder("[");
        for (int i = 0; i < 51; i++) {
            if (i > 0) many.append(',');
            many.append(file("f" + i, "a.jpg", "image/jpeg", 10, null));
        }
        many.append(']');
        json(post("/api/albums/" + album + "/uploads"), "{\"files\":" + many + "}", 400);
        json(post("/api/albums/" + album + "/uploads"), "{\"files\":[]}", 400);
    }

    @Test
    void retryOfAbandonedPendingUploadReusesTheRow() throws Exception {
        String album = createAlbum();
        String f = "[" + file("c1", "a.jpg", "image/jpeg", 10, sha('6')) + "]";
        String first = uploads(album, f);
        String second = uploads(album, f);
        assertThat(JsonPath.<String>read(second, "$.items[0].result")).isEqualTo("PRESIGNED");
        assertThat(JsonPath.<String>read(second, "$.items[0].mediaId")).isEqualTo(JsonPath.<String>read(first, "$.items[0].mediaId"));
    }

    @Test
    void cleanupRemovesStalePendingUploads() throws Exception {
        String album = createAlbum();
        String res = uploads(album, "[" + file("old", "old.jpg", "image/jpeg", 10, sha('7')) + ","
                + file("fresh", "fresh.jpg", "image/jpeg", 10, sha('8')) + "]");
        String oldId = JsonPath.read(res, "$.items[0].mediaId");
        String freshId = JsonPath.read(res, "$.items[1].mediaId");
        String oldKey = jdbc.queryForObject("select original_key from media where id = ?::uuid", String.class, oldId);
        admin.putObject(PutObjectRequest.builder().bucket(BUCKET).key(oldKey).build(), RequestBody.fromString("partial"));
        jdbc.update("update media set created_at = ? where id = ?::uuid",
                java.sql.Timestamp.from(Instant.now().minus(25, ChronoUnit.HOURS)), oldId);

        int removed = cleanup.cleanup(Instant.now());

        assertThat(removed).isGreaterThanOrEqualTo(1);
        assertThat(jdbc.queryForObject("select count(*) from media where id = ?::uuid", Integer.class, oldId)).isZero();
        assertThat(objectExists(oldKey)).isFalse();
        assertThat(jdbc.queryForObject("select count(*) from media where id = ?::uuid", Integer.class, freshId)).isEqualTo(1);
    }

    @Test
    void bucketCorsIsConfiguredAtStartup() {
        var cors = admin.getBucketCors(GetBucketCorsRequest.builder().bucket(BUCKET).build());
        assertThat(cors.corsRules()).hasSize(1);
        assertThat(cors.corsRules().get(0).allowedOrigins()).containsExactly("http://localhost:5173");
        assertThat(cors.corsRules().get(0).allowedMethods()).contains("PUT", "GET", "HEAD");
        assertThat(cors.corsRules().get(0).exposeHeaders()).contains("ETag");
    }
}
