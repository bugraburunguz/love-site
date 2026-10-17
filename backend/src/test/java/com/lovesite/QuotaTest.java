package com.lovesite;

import com.jayway.jsonpath.JsonPath;
import com.lovesite.space.TrashPurgeJob;
import com.lovesite.storage.StorageService;
import org.junit.jupiter.api.BeforeEach;
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

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.sql.Timestamp;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;

/** Per-space storage allowance and the trash purge that finally gives space back. */
@SpringBootTest
@AutoConfigureMockMvc
class QuotaTest {

    static final long LIMIT = 1000;

    @DynamicPropertySource
    static void properties(DynamicPropertyRegistry r) {
        TestInfrastructure.register(r);
    }

    @Autowired MockMvc mvc;
    @Autowired JdbcTemplate jdbc;
    @Autowired StorageService storage;
    @Autowired TrashPurgeJob purge;

    final HttpClient http = HttpClient.newHttpClient();
    RequestPostProcessor me;
    UUID space;
    String album;

    @BeforeEach
    void setUp() throws Exception {
        String email = "quota-" + UUID.randomUUID().toString().substring(0, 8) + "@x.io";
        space = TenantFixtures.spaceWithOwner(jdbc, "Small space", LIMIT, email);
        me = user(email);
        album = JsonPath.read(mvc.perform(post("/api/albums").with(me).with(csrf()).contentType(MediaType.APPLICATION_JSON)
                .content("{\"title\":\"Q\"}")).andReturn().getResponse().getContentAsString(), "$.id");
    }

    String file(String id, long size) {
        return "{\"clientId\":\"" + id + "\",\"filename\":\"" + id + ".jpg\",\"contentType\":\"image/jpeg\",\"sizeBytes\":" + size
                + ",\"sha256\":\"" + (java.util.HexFormat.of().formatHex(id.getBytes()) + "0".repeat(64)).substring(0, 64) + "\"}";
    }

    String uploads(String... files) throws Exception {
        return mvc.perform(post("/api/albums/" + album + "/uploads").with(me).with(csrf()).contentType(MediaType.APPLICATION_JSON)
                .content("{\"files\":[" + String.join(",", files) + "]}")).andReturn().getResponse().getContentAsString();
    }

    long usage() throws Exception {
        return JsonPath.<Number>read(mvc.perform(get("/api/space").with(me)).andReturn().getResponse().getContentAsString(), "$.usedBytes").longValue();
    }

    @Test
    void filesBeyondTheLimitAreRefusedIndividuallyAndTheRestOfTheBatchGoesThrough() throws Exception {
        String res = uploads(file("a1", 400), file("b2", 400), file("c3", 400), file("d4", 150));

        assertThat(JsonPath.<String>read(res, "$.items[0].result")).isEqualTo("PRESIGNED");
        assertThat(JsonPath.<String>read(res, "$.items[1].result")).isEqualTo("PRESIGNED");
        assertThat(JsonPath.<String>read(res, "$.items[2].result")).isEqualTo("QUOTA_EXCEEDED");
        assertThat(JsonPath.<String>read(res, "$.items[2].error")).contains("Depolama alanınız dolu");
        assertThat(JsonPath.<String>read(res, "$.items[3].result")).isEqualTo("PRESIGNED"); // 950 <= 1000: later, smaller files still fit
        assertThat(usage()).isEqualTo(950);
        assertThat(jdbc.queryForObject("SELECT count(*) FROM media WHERE space_id = ?", Integer.class, space)).isEqualTo(3);
    }

    @Test
    void usageCountsSoftDeletedItemsAndVariantsButNotRejectedOnes() throws Exception {
        String res = uploads(file("a1", 300), file("b2", 300));
        String first = JsonPath.read(res, "$.items[0].mediaId");
        String second = JsonPath.read(res, "$.items[1].mediaId");
        assertThat(usage()).isEqualTo(600);

        // processed variants count on top of the original (the worker stores their total)
        jdbc.update("UPDATE media SET variants_bytes = 100 WHERE id = ?::uuid", first);
        assertThat(usage()).isEqualTo(700);

        // deleting only moves an item to the trash: it keeps its space until the purge
        mvc.perform(delete("/api/media/" + first).with(me).with(csrf())).andExpect(r -> assertThat(r.getResponse().getStatus()).isEqualTo(204));
        assertThat(usage()).isEqualTo(700);
        assertThat(JsonPath.<String>read(uploads(file("c3", 400)), "$.items[0].result")).isEqualTo("QUOTA_EXCEEDED");

        // a rejected upload holds no file and counts for nothing
        jdbc.update("UPDATE media SET status = 'REJECTED' WHERE id = ?::uuid", second);
        assertThat(usage()).isEqualTo(400); // only the soft-deleted first item (300 + 100) remains
        assertThat(JsonPath.<String>read(uploads(file("c3", 400)), "$.items[0].result")).isEqualTo("PRESIGNED");
    }

    @Test
    void purgingTheTrashFreesTheSpace() throws Exception {
        String res = uploads(file("a1", 900));
        String id = JsonPath.read(res, "$.items[0].mediaId");
        String key = jdbc.queryForObject("SELECT original_key FROM media WHERE id = ?::uuid", String.class, id);
        storage.putObject(key, "image/jpeg", new byte[900]);
        mvc.perform(delete("/api/media/" + id).with(me).with(csrf()));
        assertThat(JsonPath.<String>read(uploads(file("b2", 500)), "$.items[0].result")).isEqualTo("QUOTA_EXCEEDED");

        // 29 days in the trash: still there; 31 days: gone with its file
        jdbc.update("UPDATE media SET deleted_at = ? WHERE id = ?::uuid", Timestamp.from(Instant.now().minus(29, ChronoUnit.DAYS)), id);
        purge.purge(Instant.now());
        assertThat(jdbc.queryForObject("SELECT count(*) FROM media WHERE id = ?::uuid", Integer.class, id)).isEqualTo(1);
        assertThat(storage.head(key)).isPresent();

        jdbc.update("UPDATE media SET deleted_at = ? WHERE id = ?::uuid", Timestamp.from(Instant.now().minus(31, ChronoUnit.DAYS)), id);
        TrashPurgeJob.Result result = purge.purge(Instant.now());
        assertThat(result.media()).isGreaterThanOrEqualTo(1);
        assertThat(jdbc.queryForObject("SELECT count(*) FROM media WHERE id = ?::uuid", Integer.class, id)).isZero();
        assertThat(storage.head(key)).isEmpty();
        assertThat(usage()).isZero();
        assertThat(JsonPath.<String>read(uploads(file("b2", 500)), "$.items[0].result")).isEqualTo("PRESIGNED");
    }

    @Test
    void completeChecksTheRealSizeAgainstTheQuotaAgain() throws Exception {
        // 10 bytes were declared, a lot more is actually uploaded: the reservation made at request time was too small
        String res = uploads(file("a1", 10), file("b2", 900));
        String id = JsonPath.read(res, "$.items[0].mediaId");
        String url = JsonPath.read(res, "$.items[0].uploadUrl");
        var put = http.send(HttpRequest.newBuilder(URI.create(url)).header("Content-Type", "image/jpeg")
                .PUT(HttpRequest.BodyPublishers.ofByteArray(new byte[200])).build(), HttpResponse.BodyHandlers.discarding());
        assertThat(put.statusCode()).isEqualTo(200);

        var complete = mvc.perform(post("/api/media/" + id + "/complete").with(me).with(csrf())).andReturn().getResponse();

        assertThat(complete.getStatus()).isEqualTo(413);
        assertThat(JsonPath.<String>read(complete.getContentAsString(), "$.code")).isEqualTo("QUOTA_EXCEEDED");
        assertThat(jdbc.queryForObject("SELECT status FROM media WHERE id = ?::uuid", String.class, id)).isEqualTo("REJECTED");
        String key = jdbc.queryForObject("SELECT original_key FROM media WHERE id = ?::uuid", String.class, id);
        assertThat(storage.head(key)).isEmpty(); // the oversize object does not stay in the bucket
        assertThat(usage()).isEqualTo(900);
    }

    @Test
    void concurrentUploadsCanNeverOverbookTheLastBytes() throws Exception {
        int threads = 10; // 10 x 300 bytes against a limit of 1000: exactly three fit
        ExecutorService pool = Executors.newFixedThreadPool(threads);
        try {
            CountDownLatch start = new CountDownLatch(1);
            List<Future<String>> futures = new ArrayList<>();
            for (int t = 0; t < threads; t++) {
                String clean = file("t" + t, 300);
                futures.add(pool.submit(() -> {
                    start.await();
                    return JsonPath.read(uploads(clean), "$.items[0].result");
                }));
            }
            start.countDown();
            List<String> results = new ArrayList<>();
            for (Future<String> f : futures) results.add(f.get());

            assertThat(results.stream().filter("PRESIGNED"::equals).count()).isEqualTo(3);
            assertThat(results.stream().filter("QUOTA_EXCEEDED"::equals).count()).isEqualTo(7);
            assertThat(usage()).isEqualTo(900).isLessThanOrEqualTo(LIMIT);
        } finally {
            pool.shutdownNow();
        }
    }

    @Test
    void anotherSpacesUsageDoesNotCountAgainstMe() throws Exception {
        uploads(file("a1", 900));
        String other = "other-" + UUID.randomUUID().toString().substring(0, 8) + "@x.io";
        TenantFixtures.spaceWithOwner(jdbc, "Neighbour", LIMIT, other);
        RequestPostProcessor neighbour = user(other);
        String neighbourAlbum = JsonPath.read(mvc.perform(post("/api/albums").with(neighbour).with(csrf()).contentType(MediaType.APPLICATION_JSON)
                .content("{\"title\":\"N\"}")).andReturn().getResponse().getContentAsString(), "$.id");
        String res = mvc.perform(post("/api/albums/" + neighbourAlbum + "/uploads").with(neighbour).with(csrf()).contentType(MediaType.APPLICATION_JSON)
                .content("{\"files\":[" + file("n1", 900) + "]}")).andReturn().getResponse().getContentAsString();
        assertThat(JsonPath.<String>read(res, "$.items[0].result")).isEqualTo("PRESIGNED");
    }

    @Test
    void anAlbumInTheTrashIsPurgedWithItsContentAfterThirtyDays() throws Exception {
        String res = uploads(file("a1", 100));
        String id = JsonPath.read(res, "$.items[0].mediaId");
        mvc.perform(delete("/api/albums/" + album).with(me).with(csrf()));
        // album soft-deleted: its content still counts for now
        assertThat(usage()).isEqualTo(100);

        jdbc.update("UPDATE album SET deleted_at = ? WHERE id = ?::uuid", Timestamp.from(Instant.now().minus(31, ChronoUnit.DAYS)), album);
        purge.purge(Instant.now());

        assertThat(jdbc.queryForObject("SELECT count(*) FROM album WHERE id = ?::uuid", Integer.class, album)).isZero();
        assertThat(jdbc.queryForObject("SELECT count(*) FROM media WHERE id = ?::uuid", Integer.class, id)).isZero();
        assertThat(usage()).isZero();
    }
}
