package com.lovesite.media.processing;

import com.jayway.jsonpath.JsonPath;
import com.lovesite.TestInfrastructure;
import com.lovesite.album.Album;
import com.lovesite.album.AlbumRepository;
import com.lovesite.media.Media;
import com.lovesite.media.MediaKind;
import com.lovesite.media.MediaRepository;
import com.lovesite.storage.StorageService;
import com.lovesite.user.AppUserRepository;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.RequestPostProcessor;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.Callable;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;

import static org.assertj.core.api.Assertions.assertThat;
import static org.junit.jupiter.api.Assumptions.assumeTrue;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@AutoConfigureMockMvc
class MediaProcessingQueueTest {

    static final RequestPostProcessor USER = user("a@test.io");

    @DynamicPropertySource
    static void properties(DynamicPropertyRegistry r) {
        TestInfrastructure.register(r); // auto-poll is off: the tests call the queue themselves
    }

    @BeforeAll
    static void needTools() {
        assumeTrue(ToolFixtures.toolsAvailable(), "ffmpeg/vips not installed: run the tests in the Docker test image (see backend/test.Dockerfile)");
    }

    @Autowired MockMvc mvc;
    @Autowired JdbcTemplate jdbc;
    @Autowired MediaRepository mediaRepository;
    @Autowired AlbumRepository albums;
    @Autowired AppUserRepository users;
    @Autowired StorageService storage;
    @Autowired MediaProcessingQueue queue;
    @Autowired MediaProcessingService service;

    @TempDir Path dir;
    final HttpClient http = HttpClient.newHttpClient();
    UUID userId;
    UUID spaceId;
    UUID albumId;

    @BeforeEach
    void isolate() {
        // other test classes share the database: park their queued rows so only this test's jobs are claimable
        jdbc.update("UPDATE media SET deleted_at = now() WHERE status IN ('UPLOADED', 'PROCESSING') AND deleted_at IS NULL");
        userId = users.findByEmailIgnoreCase("a@test.io").orElseThrow().getId();
        spaceId = jdbc.queryForObject("select space_id from space_member where user_id = ?", UUID.class, userId);
        albumId = albums.save(new Album(spaceId, "Queue test", userId)).getId();
    }

    // ---------------------------------------------------------------- helpers

    /** A verified upload: the original is in the bucket and the row is UPLOADED, waiting for the queue. */
    Media upload(MediaKind kind, Path file, String contentType) throws Exception {
        UUID id = UUID.randomUUID();
        byte[] bytes = Files.readAllBytes(file);
        Media m = new Media(id, spaceId, albumId, userId, kind, file.getFileName().toString(), contentType, bytes.length, null, null);
        storage.putObject(m.getOriginalKey(), contentType, bytes);
        m.markUploaded(bytes.length);
        return mediaRepository.save(m);
    }

    Map<String, Object> row(UUID id) {
        return jdbc.queryForMap("select * from media where id = ?", id);
    }

    String statusOf(UUID id) {
        return (String) row(id).get("status");
    }

    boolean exists(String key) {
        return storage.head(key).isPresent();
    }

    String list() throws Exception {
        return mvc.perform(get("/api/albums/" + albumId + "/media").with(USER)).andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
    }

    HttpResponse<byte[]> fetch(String url) throws Exception {
        return http.send(HttpRequest.newBuilder(URI.create(url)).GET().build(), HttpResponse.BodyHandlers.ofByteArray());
    }

    // ---------------------------------------------------------------- queue behaviour

    @Test
    void twoWorkersNeverClaimTheSameJob() throws Exception {
        Path garbage = Files.writeString(dir.resolve("g.jpg"), "x");
        for (int i = 0; i < 5; i++) upload(MediaKind.IMAGE, garbage, "image/jpeg");

        ExecutorService pool = Executors.newFixedThreadPool(6);
        try {
            CountDownLatch start = new CountDownLatch(1);
            Set<UUID> claimed = ConcurrentHashMap.newKeySet();
            List<UUID> all = java.util.Collections.synchronizedList(new ArrayList<>());
            List<Future<?>> futures = new ArrayList<>();
            for (int t = 0; t < 6; t++) {
                Callable<Object> worker = () -> {
                    start.await();
                    for (var id = service.claimNext(); id.isPresent(); id = service.claimNext()) {
                        all.add(id.get());
                        claimed.add(id.get());
                    }
                    return null;
                };
                futures.add(pool.submit(worker));
            }
            start.countDown();
            for (Future<?> f : futures) f.get();

            assertThat(all).hasSize(5);
            assertThat(claimed).hasSize(5); // no duplicates
            assertThat(all).allSatisfy(id -> assertThat(statusOf(id)).isEqualTo("PROCESSING"));
            assertThat(row(all.get(0)).get("processing_started_at")).isNotNull();
        } finally {
            pool.shutdownNow();
        }
    }

    @Test
    void deletedAndNotYetDueItemsAreNotClaimed() throws Exception {
        Path garbage = Files.writeString(dir.resolve("g.jpg"), "x");
        Media deleted = upload(MediaKind.IMAGE, garbage, "image/jpeg");
        jdbc.update("update media set deleted_at = now() where id = ?", deleted.getId());
        Media later = upload(MediaKind.IMAGE, garbage, "image/jpeg");
        jdbc.update("update media set next_attempt_at = now() + interval '10 minutes' where id = ?", later.getId());

        assertThat(service.claimNext()).isEmpty();
    }

    @Test
    void anItemStuckInProcessingIsPutBackAndTooManyStallsFailIt() {
        Media first = new Media(UUID.randomUUID(), spaceId, albumId, userId, MediaKind.IMAGE, "s1.jpg", "image/jpeg", 1, null, null);
        Media second = new Media(UUID.randomUUID(), spaceId, albumId, userId, MediaKind.IMAGE, "s2.jpg", "image/jpeg", 1, null, null);
        Media fresh = new Media(UUID.randomUUID(), spaceId, albumId, userId, MediaKind.IMAGE, "s3.jpg", "image/jpeg", 1, null, null);
        for (Media m : List.of(first, second, fresh)) {
            m.markUploaded(1);
            mediaRepository.save(m);
        }
        Timestamp old = Timestamp.from(Instant.now().minusSeconds(20 * 60));
        jdbc.update("update media set status = 'PROCESSING', processing_started_at = ?, attempts = 0 where id = ?", old, first.getId());
        jdbc.update("update media set status = 'PROCESSING', processing_started_at = ?, attempts = 2 where id = ?", old, second.getId());
        jdbc.update("update media set status = 'PROCESSING', processing_started_at = now() where id = ?", fresh.getId());

        assertThat(service.reclaimStale()).isEqualTo(2);

        assertThat(statusOf(first.getId())).isEqualTo("UPLOADED");
        assertThat(row(first.getId()).get("attempts")).isEqualTo(1);
        assertThat(statusOf(second.getId())).isEqualTo("FAILED"); // 3rd stall = 3rd failed attempt
        assertThat(statusOf(fresh.getId())).isEqualTo("PROCESSING"); // still within the 15 minutes
    }

    @Test
    void threeFailuresEndInFailedWithGrowingWaits() throws Exception {
        Path notAnImage = Files.writeString(dir.resolve("broken.jpg"), "this is not a jpeg");
        Media m = upload(MediaKind.IMAGE, notAnImage, "image/jpeg");
        UUID id = m.getId();

        assertThat(queue.drain(30_000)).isTrue();
        assertThat(statusOf(id)).isEqualTo("UPLOADED"); // back in the queue, not before next_attempt_at
        assertThat(row(id).get("attempts")).isEqualTo(1);
        long wait1 = secondsUntilNextAttempt(id);
        assertThat(wait1).isBetween(50L, 70L); // 1 minute
        assertThat(queue.pollOnce()).isZero(); // not due yet

        jdbc.update("update media set next_attempt_at = null where id = ?", id);
        assertThat(queue.drain(30_000)).isTrue();
        assertThat(row(id).get("attempts")).isEqualTo(2);
        assertThat(secondsUntilNextAttempt(id)).isBetween(290L, 310L); // 5 minutes

        jdbc.update("update media set next_attempt_at = null where id = ?", id);
        assertThat(queue.drain(30_000)).isTrue();
        assertThat(statusOf(id)).isEqualTo("FAILED");
        assertThat(row(id).get("attempts")).isEqualTo(3);
        assertThat(row(id).get("last_error")).asString().isNotBlank();
        assertThat(row(id).get("next_attempt_at")).isNull();

        // the client only learns the status, never the reason
        String json = list();
        assertThat(JsonPath.<String>read(json, "$[0].status")).isEqualTo("FAILED");
        assertThat(JsonPath.<Object>read(json, "$[0].thumbUrl")).isNull();
        assertThat(json).doesNotContain("lastError").doesNotContain("last_error").doesNotContain("not a supported image");

        // nothing else to do afterwards
        assertThat(queue.pollOnce()).isZero();
    }

    private long secondsUntilNextAttempt(UUID id) {
        Timestamp next = (Timestamp) row(id).get("next_attempt_at");
        return (next.getTime() - System.currentTimeMillis()) / 1000;
    }

    // ---------------------------------------------------------------- real processing

    @Test
    void aPhotoGoesFromUploadedToReadyAndTheApiServesItsVariants() throws Exception {
        Path photo = ToolFixtures.jpegWithExif(dir, "IMG_0001.jpg", 4000, 3000, 6, "2023:07:14 10:15:30", "+02:00", true);
        Media m = upload(MediaKind.IMAGE, photo, "image/jpeg");
        byte[] originalBytes = Files.readAllBytes(photo);

        String before = list();
        assertThat(JsonPath.<String>read(before, "$[0].status")).isEqualTo("UPLOADED");
        assertThat(JsonPath.<Object>read(before, "$[0].thumbUrl")).isNull();
        assertThat(JsonPath.<Object>read(before, "$[0].width")).isNull();

        assertThat(queue.drain(60_000)).isTrue();

        Map<String, Object> r = row(m.getId());
        assertThat(r.get("status")).isEqualTo("READY");
        assertThat(r.get("processing_version")).isEqualTo(1);
        assertThat(r.get("attempts")).isEqualTo(0);
        assertThat(r.get("last_error")).isNull();
        // portrait after EXIF rotation; display is capped at 1600 on the long edge
        assertThat(r.get("width")).isEqualTo(1200);
        assertThat(r.get("height")).isEqualTo(1600);
        assertThat(((Timestamp) r.get("taken_at")).toInstant()).isEqualTo(Instant.parse("2023-07-14T08:15:30Z"));
        String prefix = "spaces/" + spaceId + "/albums/" + albumId + "/media/" + m.getId() + "/v1/";
        assertThat(r.get("thumb_key")).isEqualTo(prefix + "thumb.webp");
        assertThat(r.get("display_key")).isEqualTo(prefix + "display.webp");
        assertThat(r.get("loop_key")).isNull();

        // variants are immutable (the key is versioned) and typed
        for (String key : List.of(prefix + "thumb.webp", prefix + "display.webp")) {
            var head = storage.head(key).orElseThrow();
            assertThat(head.contentType()).isEqualTo("image/webp");
            assertThat(head.cacheControl()).isEqualTo("private, max-age=31536000, immutable");
        }
        // the original is untouched
        assertThat(storage.getObject(m.getOriginalKey())).isEqualTo(originalBytes);

        // the API: URLs for the variants, display size, capture date as display date, no original URL
        String json = list();
        assertThat(JsonPath.<String>read(json, "$[0].status")).isEqualTo("READY");
        assertThat(JsonPath.<Integer>read(json, "$[0].width")).isEqualTo(1200);
        assertThat(JsonPath.<Integer>read(json, "$[0].height")).isEqualTo(1600);
        assertThat(JsonPath.<String>read(json, "$[0].displayDate")).isEqualTo("2023-07-14T08:15:30Z");
        assertThat(JsonPath.<Object>read(json, "$[0].loopUrl")).isNull();
        assertThat(JsonPath.<Map<String, Object>>read(json, "$[0]")).doesNotContainKey("url");
        byte[] thumb = fetch(JsonPath.read(json, "$[0].thumbUrl")).body();
        byte[] display = fetch(JsonPath.read(json, "$[0].displayUrl")).body();
        assertThat(new String(thumb, 0, 4, StandardCharsets.US_ASCII)).isEqualTo("RIFF");
        assertThat(new String(thumb, 8, 4, StandardCharsets.US_ASCII)).isEqualTo("WEBP");
        assertThat(thumb.length).isLessThan(display.length);
        assertThat(display.length).isLessThan(originalBytes.length);
        // same key -> same URL (browser cache)
        assertThat(JsonPath.<String>read(list(), "$[0].thumbUrl")).isEqualTo(JsonPath.<String>read(json, "$[0].thumbUrl"));
    }

    @Test
    void aVideoGoesToReadyWithLoopAndPoster() throws Exception {
        Path video = ToolFixtures.rotated(dir, "IMG_0002.mp4", ToolFixtures.video(dir, "land.mp4", 640, 360, 4,
                "-metadata", "creation_time=2022-03-05T14:20:00Z"), 90);
        Media m = upload(MediaKind.VIDEO, video, "video/mp4");

        assertThat(queue.drain(90_000)).isTrue();

        Map<String, Object> r = row(m.getId());
        assertThat(r.get("status")).isEqualTo("READY");
        assertThat(r.get("width")).isEqualTo(360);
        assertThat(r.get("height")).isEqualTo(640);
        assertThat((Long) r.get("duration_ms")).isBetween(3900L, 4100L);
        assertThat(r.get("thumb_key")).isNull();
        String prefix = "spaces/" + spaceId + "/albums/" + albumId + "/media/" + m.getId() + "/v1/";
        assertThat(storage.head(prefix + "loop.mp4").orElseThrow().contentType()).isEqualTo("video/mp4");
        assertThat(storage.head(prefix + "poster.webp").orElseThrow().contentType()).isEqualTo("image/webp");

        String json = list();
        assertThat(JsonPath.<String>read(json, "$[0].displayDate")).isEqualTo("2022-03-05T14:20:00Z");
        assertThat(JsonPath.<Integer>read(json, "$[0].durationMs")).isBetween(3900, 4100);
        assertThat(JsonPath.<Object>read(json, "$[0].thumbUrl")).isNull();
        var loop = fetch(JsonPath.read(json, "$[0].loopUrl"));
        assertThat(loop.statusCode()).isEqualTo(200);
        assertThat(loop.body().length).isPositive();
    }

    @Test
    void displayDateFallsBackToTheDeviceModifiedTimeThenTheUploadTime() throws Exception {
        Path plain = ToolFixtures.jpeg(dir, "nodate.jpg", 400, 300);
        Media withDevice = upload(MediaKind.IMAGE, plain, "image/jpeg");
        jdbc.update("update media set client_modified_at = ? where id = ?", Timestamp.from(Instant.parse("2021-05-06T07:08:09Z")), withDevice.getId());
        assertThat(queue.drain(60_000)).isTrue();
        assertThat(JsonPath.<String>read(list(), "$[0].displayDate")).isEqualTo("2021-05-06T07:08:09Z");

        jdbc.update("update media set client_modified_at = null where id = ?", withDevice.getId());
        String createdAt = JsonPath.read(list(), "$[0].createdAt");
        assertThat(JsonPath.<String>read(list(), "$[0].displayDate")).isEqualTo(createdAt);
    }

    @Test
    void reprocessingCreatesANewVersionAndRemovesTheOldOne() throws Exception {
        Path photo = ToolFixtures.jpeg(dir, "again.jpg", 1000, 800);
        Media m = upload(MediaKind.IMAGE, photo, "image/jpeg");
        assertThat(queue.drain(60_000)).isTrue();
        String v1Thumb = (String) row(m.getId()).get("thumb_key");
        String v1Display = (String) row(m.getId()).get("display_key");
        assertThat(v1Thumb).contains("/v1/");
        assertThat(exists(v1Thumb)).isTrue();

        String response = mvc.perform(post("/api/media/" + m.getId() + "/reprocess").with(USER).with(csrf()))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        assertThat(JsonPath.<String>read(response, "$.status")).isEqualTo("UPLOADED");
        assertThat(JsonPath.<Object>read(response, "$.thumbUrl")).isNull();
        assertThat(row(m.getId()).get("attempts")).isEqualTo(0);

        assertThat(queue.drain(60_000)).isTrue();

        Map<String, Object> r = row(m.getId());
        assertThat(r.get("status")).isEqualTo("READY");
        assertThat(r.get("processing_version")).isEqualTo(2);
        assertThat((String) r.get("thumb_key")).contains("/v2/");
        assertThat(exists((String) r.get("thumb_key"))).isTrue();
        assertThat(exists((String) r.get("display_key"))).isTrue();
        assertThat(exists(v1Thumb)).as("old thumb").isFalse();
        assertThat(exists(v1Display)).as("old display").isFalse();
        assertThat(exists(m.getOriginalKey())).isTrue();
    }

    @Test
    void reprocessResetsAFailedItemAndRefusesItemsThatAreStillInTheQueue() throws Exception {
        Path photo = ToolFixtures.jpeg(dir, "retry.jpg", 300, 200);
        Media failed = upload(MediaKind.IMAGE, photo, "image/jpeg");
        jdbc.update("update media set status = 'FAILED', attempts = 3, last_error = 'boom' where id = ?", failed.getId());

        mvc.perform(post("/api/media/" + failed.getId() + "/reprocess").with(USER).with(csrf())).andExpect(status().isOk());
        assertThat(statusOf(failed.getId())).isEqualTo("UPLOADED");
        assertThat(row(failed.getId()).get("attempts")).isEqualTo(0);
        assertThat(row(failed.getId()).get("last_error")).isNull();

        // already queued -> 409; being processed -> 409; unknown -> 404
        mvc.perform(post("/api/media/" + failed.getId() + "/reprocess").with(USER).with(csrf())).andExpect(status().isConflict());
        jdbc.update("update media set status = 'PROCESSING' where id = ?", failed.getId());
        mvc.perform(post("/api/media/" + failed.getId() + "/reprocess").with(USER).with(csrf())).andExpect(status().isConflict());
        mvc.perform(post("/api/media/" + UUID.randomUUID() + "/reprocess").with(USER).with(csrf())).andExpect(status().isNotFound());
        mvc.perform(post("/api/media/" + failed.getId() + "/reprocess")).andExpect(status().isForbidden()); // CSRF, not logged in
    }

    @Test
    void theStatusEndpointReturnsOnlyTheRequestedItems() throws Exception {
        Path photo = ToolFixtures.jpeg(dir, "poll.jpg", 300, 200);
        Media a = upload(MediaKind.IMAGE, photo, "image/jpeg");
        Media b = upload(MediaKind.IMAGE, Files.writeString(dir.resolve("b.jpg"), "bbb"), "image/jpeg");

        String json = mvc.perform(get("/api/media").param("ids", a.getId() + "," + UUID.randomUUID()).with(USER))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        assertThat(JsonPath.<List<String>>read(json, "$[*].id")).containsExactly(a.getId().toString());
        assertThat(JsonPath.<String>read(json, "$[0].status")).isEqualTo("UPLOADED");

        mvc.perform(get("/api/media").param("ids", a.getId() + "," + b.getId()).with(USER)).andExpect(status().isOk());
        mvc.perform(get("/api/media").with(USER)).andExpect(status().isBadRequest());
        mvc.perform(get("/api/media").param("ids", a.getId().toString())).andExpect(status().isUnauthorized());
    }

    @Test
    void completingAnUploadStartsProcessingWithoutWaitingForThePoller() throws Exception {
        // with auto-poll off the kick is a no-op: the item just waits as UPLOADED, and the next poll takes it
        Path photo = ToolFixtures.jpeg(dir, "kick.jpg", 300, 200);
        Media m = upload(MediaKind.IMAGE, photo, "image/jpeg");
        assertThat(statusOf(m.getId())).isEqualTo("UPLOADED");
        assertThat(queue.pollOnce()).isEqualTo(1);
        assertThat(queue.drain(60_000)).isTrue();
        assertThat(statusOf(m.getId())).isEqualTo("READY");
    }

    @Test
    void mediaUploadedBeforeTenancyKeepsItsOldKeyLayoutAndVariantsStayNextToIt() throws Exception {
        Path photo = ToolFixtures.jpeg(dir, "old.jpg", 800, 600);
        Media m = upload(MediaKind.IMAGE, photo, "image/jpeg");
        // move the original to the pre-tenancy location, as it is for everything uploaded before spaces existed
        String legacyKey = "albums/" + albumId + "/media/" + m.getId() + "/original";
        storage.putObject(legacyKey, "image/jpeg", Files.readAllBytes(photo));
        jdbc.update("update media set original_key = ? where id = ?", legacyKey, m.getId());

        assertThat(queue.drain(60_000)).isTrue();

        Map<String, Object> r = row(m.getId());
        assertThat(r.get("status")).isEqualTo("READY");
        String prefix = "albums/" + albumId + "/media/" + m.getId() + "/v1/";
        assertThat(r.get("thumb_key")).isEqualTo(prefix + "thumb.webp");
        assertThat(r.get("display_key")).isEqualTo(prefix + "display.webp");
        assertThat(exists(prefix + "thumb.webp")).isTrue();
        // the size of the variants is recorded and counts against the space quota
        long thumb = storage.head(prefix + "thumb.webp").orElseThrow().contentLength();
        long display = storage.head(prefix + "display.webp").orElseThrow().contentLength();
        assertThat(((Number) r.get("variants_bytes")).longValue()).isEqualTo(thumb + display);
        assertThat(jdbc.queryForObject("select sum(size_bytes + coalesce(variants_bytes, 0)) from media where id = ?", Long.class, m.getId()))
                .isEqualTo(Files.size(photo) + thumb + display);
    }
}
