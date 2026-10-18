package com.lovesite;

import com.jayway.jsonpath.JsonPath;
import com.lovesite.export.ExportCleanupJob;
import com.lovesite.export.ExportQueue;
import com.lovesite.export.ExportRenderer;
import com.lovesite.media.processing.MediaProcessingQueue;
import com.lovesite.storage.StorageService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.context.annotation.Primary;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import org.springframework.test.web.servlet.request.RequestPostProcessor;

import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;

/**
 * Export API and queue with a stand-in renderer (the real Chromium / ffmpeg pipeline is covered by the e2e test against the
 * production image): IDOR, validation, limits, "same content -> same result", the 24 h cleanup, fairness and priority.
 */
@SpringBootTest
@AutoConfigureMockMvc
@Import(ExportApiTest.FakeRendererConfig.class)
class ExportApiTest {

    @DynamicPropertySource
    static void properties(DynamicPropertyRegistry r) {
        TestInfrastructure.register(r);
        r.add("app.export.daily-limit", () -> "8");
    }

    /** Writes one small file per job; can be held to simulate a long render. */
    @TestConfiguration
    static class FakeRendererConfig {
        static final AtomicInteger renders = new AtomicInteger();
        static volatile CountDownLatch hold = null;
        static volatile CountDownLatch started = null;

        @Bean
        @Primary
        ExportRenderer fakeRenderer() {
            return (job, work) -> {
                renders.incrementAndGet();
                if (started != null) started.countDown();
                if (hold != null) hold.await(20, TimeUnit.SECONDS);
                Path f = work.resolve("out.png");
                Files.write(f, new byte[] {1, 2, 3});
                return new ExportRenderer.Result(List.of(new ExportRenderer.OutputFile(f, "out.png", "image/png", "main")), List.of("not"));
            };
        }
    }

    @Autowired MockMvc mvc;
    @Autowired JdbcTemplate jdbc;
    @Autowired ExportQueue queue;
    @Autowired MediaProcessingQueue mediaQueue;
    @Autowired ExportCleanupJob cleanup;
    @Autowired StorageService storage;

    RequestPostProcessor me;
    RequestPostProcessor outsider;
    UUID space;
    UUID otherSpace;
    UUID userId;
    UUID album;
    UUID otherAlbum;
    UUID page;

    @BeforeEach
    void setUp() throws Exception {
        String tag = UUID.randomUUID().toString().substring(0, 8);
        space = TenantFixtures.spaceWithOwner(jdbc, "Ex", TenantFixtures.GIB, "ex-" + tag + "@x.io");
        otherSpace = TenantFixtures.spaceWithOwner(jdbc, "Ex other", TenantFixtures.GIB, "ex-out-" + tag + "@x.io");
        userId = jdbc.queryForObject("SELECT user_id FROM space_member WHERE space_id = ?", UUID.class, space);
        me = user("ex-" + tag + "@x.io");
        outsider = user("ex-out-" + tag + "@x.io");
        album = UUID.fromString(JsonPath.read(ok(post("/api/albums"), me, "{\"title\":\"Ex\"}"), "$.id"));
        otherAlbum = UUID.fromString(JsonPath.read(ok(post("/api/albums"), outsider, "{\"title\":\"O\"}"), "$.id"));
        StringBuilder ids = new StringBuilder();
        for (int i = 0; i < 4; i++) ids.append(i > 0 ? "," : "").append('"').append(media(space, album, "READY")).append('"');
        ok(post("/api/albums/" + album + "/pages/initialize"), me, "{\"pages\":[{\"template\":\"AUTO\",\"mediaIds\":[" + ids + "]}]}");
        page = UUID.fromString(JsonPath.read(ok(get("/api/albums/" + album + "/pages"), me, null), "$.pages[0].id"));
        FakeRendererConfig.hold = null;
        FakeRendererConfig.started = null;
        queue.drain(10_000); // jobs of earlier tests
    }

    UUID media(UUID spaceId, UUID albumId, String status) {
        UUID uploader = jdbc.queryForObject("SELECT user_id FROM space_member WHERE space_id = ? LIMIT 1", UUID.class, spaceId);
        return jdbc.queryForObject("INSERT INTO media (album_id, uploaded_by, type, status, original_key, original_filename, content_type, size_bytes, space_id, "
                + "display_key, thumb_key, width, height, caption) VALUES (?, ?, 'IMAGE', ?, 'k', 'f.jpg', 'image/jpeg', 1, ?, 'd/display.webp', 'd/thumb.webp', 1200, 1600, 'Merhaba') RETURNING id",
                UUID.class, albumId, uploader, status, spaceId);
    }

    UUID mediaOnPage() {
        return jdbc.queryForObject("SELECT media_id FROM page_item WHERE page_id = ? ORDER BY slot_index LIMIT 1", UUID.class, page);
    }

    MvcResult send(MockHttpServletRequestBuilder request, RequestPostProcessor who, String body) throws Exception {
        MockHttpServletRequestBuilder r = request.with(who).with(csrf()).contentType(MediaType.APPLICATION_JSON);
        if (body != null) r.content(body);
        return mvc.perform(r).andReturn();
    }

    String ok(MockHttpServletRequestBuilder request, RequestPostProcessor who, String body) throws Exception {
        MvcResult res = send(request, who, body);
        assertThat(res.getResponse().getStatus()).as(res.getResponse().getContentAsString()).isBetween(200, 202);
        return res.getResponse().getContentAsString();
    }

    int create(RequestPostProcessor who, String type, String params) throws Exception {
        return send(post("/api/exports"), who, "{\"type\":\"" + type + "\",\"params\":" + params + "}").getResponse().getStatus();
    }

    String createOk(String type, String params) throws Exception {
        return ok(post("/api/exports"), me, "{\"type\":\"" + type + "\",\"params\":" + params + "}");
    }

    @Test
    void foreignIdsAre404AndCreateNothing() throws Exception {
        UUID foreignMedia = media(otherSpace, otherAlbum, "READY");
        UUID mine = mediaOnPage();
        Integer before = jdbc.queryForObject("SELECT count(*) FROM export_job WHERE space_id = ?", Integer.class, space);
        for (String type : List.of("POLAROID", "STORY", "POST")) {
            assertThat(create(me, type, "{\"mediaId\":\"" + foreignMedia + "\"}")).as(type).isEqualTo(404);
        }
        assertThat(create(me, "CAROUSEL", "{\"albumId\":\"" + otherAlbum + "\",\"pageIds\":[\"" + page + "\"]}")).isEqualTo(404);
        UUID foreignPage = jdbc.queryForObject("INSERT INTO page (album_id, space_id, page_index, template) VALUES (?, ?, 0, 'AUTO') RETURNING id", UUID.class, otherAlbum, otherSpace);
        assertThat(create(me, "CAROUSEL", "{\"albumId\":\"" + album + "\",\"pageIds\":[\"" + page + "\",\"" + foreignPage + "\"]}")).isEqualTo(404);
        assertThat(create(me, "REELS", "{\"albumId\":\"" + otherAlbum + "\"}")).isEqualTo(404);
        assertThat(create(me, "REELS", "{\"albumId\":\"" + album + "\",\"mediaIds\":[\"" + mine + "\",\"" + foreignMedia + "\"]}")).isEqualTo(404);
        assertThat(create(me, "STICKER_PACK", "{\"mediaIds\":[\"" + mine + "\",\"" + mediaOnPage() + "\",\"" + foreignMedia + "\"]}")).isIn(400, 404);
        assertThat(jdbc.queryForObject("SELECT count(*) FROM export_job WHERE space_id = ?", Integer.class, space)).isEqualTo(before);

        // another space's export id behaves like a missing one
        String job = JsonPath.read(createOk("POLAROID", "{\"mediaId\":\"" + mine + "\"}"), "$.id");
        assertThat(send(get("/api/exports/" + job), outsider, null).getResponse().getStatus()).isEqualTo(404);
        assertThat(send(get("/api/exports/" + UUID.randomUUID()), me, null).getResponse().getStatus()).isEqualTo(404);
        assertThat(send(get("/api/albums/" + album + "/exports"), outsider, null).getResponse().getStatus()).isEqualTo(404);
        // and the original download too
        assertThat(send(get("/api/media/" + foreignMedia + "/original"), me, null).getResponse().getStatus()).isEqualTo(404);
    }

    @Test
    void validation() throws Exception {
        UUID m = mediaOnPage();
        assertThat(create(me, "GIF", "{}")).isEqualTo(400);
        assertThat(create(me, "POLAROID", "{}")).isEqualTo(400);
        assertThat(create(me, "POLAROID", "{\"mediaId\":\"" + m + "\",\"background\":\"blue\"}")).isEqualTo(400);
        assertThat(create(me, "POLAROID", "{\"mediaId\":\"" + m + "\",\"motion\":true}")).isEqualTo(400); // a still photo has no loop
        UUID processing = media(space, album, "PROCESSING");
        assertThat(create(me, "STORY", "{\"mediaId\":\"" + processing + "\"}")).isEqualTo(409);
        assertThat(create(me, "STICKER_PACK", "{\"mediaIds\":[\"" + m + "\"]}")).isEqualTo(400); // fewer than 3
        assertThat(create(me, "CAROUSEL", "{\"albumId\":\"" + album + "\",\"pageIds\":[]}")).isEqualTo(400);
    }

    @Test
    void readyResultHasDownloadLinksAndTheAlbumListShowsIt() throws Exception {
        UUID m = mediaOnPage();
        String created = createOk("STORY", "{\"mediaId\":\"" + m + "\",\"watermark\":false}");
        String id = JsonPath.read(created, "$.id");
        assertThat((String) JsonPath.read(created, "$.status")).isEqualTo("QUEUED");
        assertThat(queue.drain(10_000)).isTrue();
        String ready = ok(get("/api/exports/" + id), me, null);
        assertThat((String) JsonPath.read(ready, "$.status")).isEqualTo("READY");
        String url = JsonPath.read(ready, "$.files[0].url");
        assertThat(url).contains("response-content-disposition=attachment");
        assertThat((List<String>) JsonPath.read(ready, "$.notes")).containsExactly("not");
        assertThat((String) JsonPath.read(ready, "$.albumId")).isEqualTo(album.toString());
        // the payload snapshot carries the page's theme (the album's here) and the media keys, never URLs
        String payload = jdbc.queryForObject("SELECT payload::text FROM export_job WHERE id = ?", String.class, UUID.fromString(id));
        assertThat(payload).contains("\"themeId\": \"romantik\"").contains("d/display.webp").doesNotContain("X-Amz-Signature");
        assertThat(jdbc.queryForObject("SELECT count(*) FROM export_job WHERE id = ? AND result_keys::text LIKE ?", Integer.class,
                UUID.fromString(id), "%spaces/" + space + "/exports/" + id + "/out.png%")).isEqualTo(1);
        List<String> listed = JsonPath.read(ok(get("/api/albums/" + album + "/exports"), me, null), "$[*].id");
        assertThat(listed).contains(id);
        // the original: a download link with the original file name
        String original = ok(get("/api/media/" + m + "/original"), me, null);
        assertThat((String) JsonPath.read(original, "$.filename")).isEqualTo("f.jpg");
        assertThat((String) JsonPath.read(original, "$.url")).contains("response-content-disposition=attachment");
    }

    @Test
    void sameContentIsNotRenderedAgainButNewContentIs() throws Exception {
        UUID m = mediaOnPage();
        String first = JsonPath.read(createOk("POLAROID", "{\"mediaId\":\"" + m + "\"}"), "$.id");
        queue.drain(10_000);
        int renders = FakeRendererConfig.renders.get();
        String again = JsonPath.read(createOk("POLAROID", "{\"mediaId\":\"" + m + "\",\"background\":\"transparent\"}"), "$.id");
        assertThat(again).isEqualTo(first);
        queue.drain(10_000);
        assertThat(FakeRendererConfig.renders.get()).isEqualTo(renders);

        // a new caption is new content
        ok(patch("/api/media/" + m), me, "{\"caption\":\"Yeni\"}");
        String afterCaption = JsonPath.read(createOk("POLAROID", "{\"mediaId\":\"" + m + "\"}"), "$.id");
        assertThat(afterCaption).isNotEqualTo(first);
        // so is a new page theme
        int version = JsonPath.read(ok(get("/api/albums/" + album + "/pages"), me, null), "$.pages[0].version");
        ok(patch("/api/pages/" + page), me, "{\"version\":" + version + ",\"themeId\":\"buyulu\"}");
        String afterTheme = JsonPath.read(createOk("POLAROID", "{\"mediaId\":\"" + m + "\"}"), "$.id");
        assertThat(afterTheme).isNotIn(first, afterCaption);
        assertThat(jdbc.queryForObject("SELECT payload::text FROM export_job WHERE id = ?", String.class, UUID.fromString(afterTheme))).contains("buyulu");
        // and another background is another result
        assertThat((String) JsonPath.read(createOk("POLAROID", "{\"mediaId\":\"" + m + "\",\"background\":\"page\"}"), "$.id")).isNotEqualTo(afterTheme);
        queue.drain(10_000);
    }

    @Test
    void atMostThreeActivePerSpaceAndADailyLimit() throws Exception {
        FakeRendererConfig.hold = new CountDownLatch(1);
        try {
            // nothing is worked off meanwhile (the queue is driven by hand): three distinct requests queue up, the fourth is refused
            UUID m = mediaOnPage();
            assertThat(create(me, "POLAROID", "{\"mediaId\":\"" + m + "\"}")).isEqualTo(202);
            assertThat(create(me, "STORY", "{\"mediaId\":\"" + m + "\"}")).isEqualTo(202);
            assertThat(create(me, "POST", "{\"mediaId\":\"" + m + "\"}")).isEqualTo(202);
            assertThat(create(me, "POLAROID", "{\"mediaId\":\"" + m + "\",\"background\":\"page\"}")).isEqualTo(429);
            // asking again for something already queued is fine (it is the same job)
            assertThat(create(me, "STORY", "{\"mediaId\":\"" + m + "\"}")).isEqualTo(202);
            // another space is not affected
            assertThat(create(outsider, "STORY", "{\"mediaId\":\"" + media(otherSpace, otherAlbum, "READY") + "\"}")).isEqualTo(202);
        } finally {
            FakeRendererConfig.hold.countDown();
            FakeRendererConfig.hold = null;
            queue.drain(20_000);
        }
        // daily limit (8 in this test): 3 already today
        UUID m = mediaOnPage();
        int status = 202;
        for (int i = 0; i < 10 && status == 202; i++) {
            ok(patch("/api/media/" + m), me, "{\"caption\":\"v" + i + "\"}");
            status = create(me, "POLAROID", "{\"mediaId\":\"" + m + "\"}");
            queue.drain(10_000);
        }
        assertThat(status).isEqualTo(429);
        assertThat(jdbc.queryForObject("SELECT count(*) FROM export_job WHERE space_id = ? AND created_at > now() - interval '24 hours'", Integer.class, space)).isEqualTo(8);
    }

    @Test
    void resultsAreDeletedAfter24Hours() throws Exception {
        String id = JsonPath.read(createOk("POST", "{\"mediaId\":\"" + mediaOnPage() + "\"}"), "$.id");
        queue.drain(10_000);
        String key = "spaces/" + space + "/exports/" + id + "/out.png";
        assertThat(storage.head(key)).isPresent();
        // not yet
        cleanup.purgeExpired(Instant.now());
        assertThat(storage.head(key)).isPresent();
        cleanup.purgeExpired(Instant.now().plus(25, ChronoUnit.HOURS));
        assertThat(storage.head(key)).isEmpty();
        assertThat(jdbc.queryForObject("SELECT count(*) FROM export_job WHERE id = ?", Integer.class, UUID.fromString(id))).isZero();
        assertThat(send(get("/api/exports/" + id), me, null).getResponse().getStatus()).isEqualTo(404);
        // exports never count against the quota
        String space = ok(get("/api/space"), me, null);
        assertThat(((Number) JsonPath.read(space, "$.usedBytes")).longValue()).isLessThan(100);
    }

    @Test
    void aLongExportDoesNotHoldUpMediaProcessing() throws Exception {
        FakeRendererConfig.hold = new CountDownLatch(1);
        FakeRendererConfig.started = new CountDownLatch(1);
        try {
            createOk("POST", "{\"mediaId\":\"" + mediaOnPage() + "\"}");
            assertThat(queue.pollOnce()).isEqualTo(1);
            assertThat(FakeRendererConfig.started.await(10, TimeUnit.SECONDS)).isTrue();
            // the export worker is busy; an upload's processing is still claimed right away by its own worker
            media(space, album, "UPLOADED");
            // (the media worker may pick an older waiting item first; what matters is that it is free to start one now)
            assertThat(mediaQueue.pollOnce()).isGreaterThanOrEqualTo(1);
            assertThat(queue.isIdle()).isFalse();
        } finally {
            FakeRendererConfig.hold.countDown();
            FakeRendererConfig.hold = null;
            queue.drain(20_000);
            mediaQueue.drain(20_000);
        }
    }

    @Test
    void queueIsFairBetweenSpaces() throws Exception {
        FakeRendererConfig.hold = new CountDownLatch(1);
        try {
            UUID m = mediaOnPage();
            createOk("POLAROID", "{\"mediaId\":\"" + m + "\"}");
            createOk("STORY", "{\"mediaId\":\"" + m + "\"}");
            Thread.sleep(20);
            String theirs = JsonPath.read(ok(post("/api/exports"), outsider, "{\"type\":\"STORY\",\"params\":{\"mediaId\":\"" + media(otherSpace, otherAlbum, "READY") + "\"}}"), "$.id");
            queue.pollOnce(); // one worker: takes our oldest job
            // with ours RUNNING, the other space's job comes before our second one
            String next = jdbc.queryForObject("SELECT e.id::text FROM export_job e JOIN space s ON s.id = e.space_id WHERE e.status = 'QUEUED' "
                    + "ORDER BY (EXISTS (SELECT 1 FROM export_job r WHERE r.space_id = e.space_id AND r.status = 'RUNNING')), s.export_served_at ASC NULLS FIRST, e.created_at LIMIT 1", String.class);
            assertThat(next).isEqualTo(theirs);
        } finally {
            FakeRendererConfig.hold.countDown();
            FakeRendererConfig.hold = null;
            queue.drain(20_000);
        }
    }
}
