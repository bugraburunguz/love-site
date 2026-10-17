package com.lovesite;

import com.jayway.jsonpath.JsonPath;
import com.lovesite.media.Media;
import com.lovesite.media.MediaKind;
import com.lovesite.media.MediaRepository;
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
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import org.springframework.test.web.servlet.request.RequestPostProcessor;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.stream.Collectors;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;

/** Persistent pages: initialization, automatic placement, templates, moves, conflicts and the tray. */
@SpringBootTest
@AutoConfigureMockMvc
class PagesApiTest {

    @DynamicPropertySource
    static void properties(DynamicPropertyRegistry r) {
        TestInfrastructure.register(r);
    }

    @Autowired MockMvc mvc;
    @Autowired JdbcTemplate jdbc;
    @Autowired MediaRepository mediaRepository;

    final HttpClient http = HttpClient.newHttpClient();
    RequestPostProcessor me;
    UUID space;
    UUID userId;
    String album;

    @BeforeEach
    void setUp() throws Exception {
        String email = "pages-" + UUID.randomUUID().toString().substring(0, 8) + "@x.io";
        space = TenantFixtures.spaceWithOwner(jdbc, "Pages", 50 * TenantFixtures.GIB, email);
        userId = jdbc.queryForObject("SELECT id FROM app_user WHERE email = ?", UUID.class, email);
        me = user(email);
        album = JsonPath.read(send(post("/api/albums"), "{\"title\":\"P\"}").getResponse().getContentAsString(), "$.id");
    }

    // ---------------------------------------------------------------- helpers

    MvcResult send(MockHttpServletRequestBuilder request, String body) throws Exception {
        MockHttpServletRequestBuilder r = request.with(me).with(csrf()).contentType(MediaType.APPLICATION_JSON);
        if (body != null) r.content(body);
        return mvc.perform(r).andReturn();
    }

    String ok(MockHttpServletRequestBuilder request, String body) throws Exception {
        MvcResult res = send(request, body);
        assertThat(res.getResponse().getStatus()).as(res.getResponse().getContentAsString()).isBetween(200, 201);
        return res.getResponse().getContentAsString();
    }

    String pages() throws Exception {
        return ok(get("/api/albums/" + album + "/pages"), null);
    }

    /** A verified, queued photo (as it is right after a completed upload) that is NOT placed on a page yet. */
    UUID newMedia() {
        Media m = new Media(UUID.randomUUID(), space, UUID.fromString(album), userId, MediaKind.IMAGE, "p.jpg", "image/jpeg", 10, null, null);
        m.markUploaded(10);
        mediaRepository.saveAndFlush(m);
        jdbc.update("UPDATE media SET created_at = created_at + (random() * interval '1 second') WHERE id = ?", m.getId());
        return m.getId();
    }

    List<UUID> newMedia(int count) {
        List<UUID> ids = new ArrayList<>();
        for (int i = 0; i < count; i++) ids.add(newMedia());
        return ids;
    }

    static String idsJson(List<UUID> ids) {
        return ids.stream().map(i -> "\"" + i + "\"").collect(Collectors.joining(","));
    }

    /** initialize with the given page sizes (all AUTO), media taken in order */
    List<UUID> initialize(int... sizes) throws Exception {
        int total = 0;
        for (int s : sizes) total += s;
        List<UUID> media = newMedia(total);
        StringBuilder body = new StringBuilder("{\"pages\":[");
        int at = 0;
        for (int p = 0; p < sizes.length; p++) {
            if (p > 0) body.append(',');
            body.append("{\"template\":\"AUTO\",\"mediaIds\":[").append(idsJson(media.subList(at, at + sizes[p]))).append("]}");
            at += sizes[p];
        }
        ok(post("/api/albums/" + album + "/pages/initialize"), body.append("]}").toString());
        return media;
    }

    static double num(String json, String path) {
        List<Number> found = JsonPath.read(json, path);
        return found.get(0).doubleValue();
    }

    String pageId(int index) throws Exception {
        return JsonPath.read(pages(), "$.pages[" + index + "].id");
    }

    int version(int index) throws Exception {
        return JsonPath.read(pages(), "$.pages[" + index + "].version");
    }

    List<String> mediaOnPage(int index) throws Exception {
        return JsonPath.read(pages(), "$.pages[" + index + "].items[?(@.kind=='MEDIA')].mediaId");
    }

    String template(int index) throws Exception {
        return JsonPath.read(pages(), "$.pages[" + index + "].template");
    }

    int pageCount() throws Exception {
        return JsonPath.<Integer>read(pages(), "$.pages.length()");
    }

    List<String> tray() throws Exception {
        return JsonPath.read(pages(), "$.tray");
    }

    String itemOf(UUID mediaId) throws Exception {
        List<String> ids = JsonPath.read(pages(), "$.pages[*].items[?(@.mediaId=='" + mediaId + "')].id");
        return ids.get(0);
    }

    int itemVersion(UUID mediaId) throws Exception {
        List<Integer> v = JsonPath.read(pages(), "$.pages[*].items[?(@.mediaId=='" + mediaId + "')].version");
        return v.get(0);
    }

    void assertNoSlotCollisions() {
        assertThat(jdbc.queryForList("SELECT page_id, slot_index FROM page_item WHERE page_id IN (SELECT id FROM page WHERE album_id = ?::uuid) "
                + "AND slot_index IS NOT NULL GROUP BY page_id, slot_index HAVING count(*) > 1", album)).isEmpty();
        assertThat(jdbc.queryForList("SELECT page_id FROM page_item WHERE page_id IN (SELECT id FROM page WHERE album_id = ?::uuid) AND slot_index IS NOT NULL "
                + "GROUP BY page_id HAVING count(*) > 4", album)).isEmpty();
    }

    // ---------------------------------------------------------------- initialize

    @Test
    void initializeStoresTheGivenDistributionAndTheTrayIsEmptyAfterwards() throws Exception {
        List<UUID> media = initialize(3, 2, 1);
        String body = pages();
        assertThat(JsonPath.<Integer>read(body, "$.pages.length()")).isEqualTo(3);
        assertThat(JsonPath.<List<String>>read(body, "$.pages[0].items[*].mediaId")).containsExactly(
                media.get(0).toString(), media.get(1).toString(), media.get(2).toString());
        assertThat(JsonPath.<List<Integer>>read(body, "$.pages[0].items[*].slotIndex")).containsExactly(0, 1, 2);
        assertThat(JsonPath.<String>read(body, "$.pages[2].template")).isEqualTo("AUTO");
        assertThat(JsonPath.<List<Object>>read(body, "$.tray")).isEmpty();
        assertThat(JsonPath.<Object>read(body, "$.pages[0].items[0].x")).isNull(); // positions are computed at render time
    }

    @Test
    void initializeIsIdempotentAndSafeWhenTwoClientsOpenTheAlbumTogether() throws Exception {
        List<UUID> media = newMedia(6);
        ExecutorService pool = Executors.newFixedThreadPool(6);
        try {
            CountDownLatch start = new CountDownLatch(1);
            List<Future<String>> results = new ArrayList<>();
            for (int t = 0; t < 6; t++) {
                // every client proposes a different split
                int split = 1 + t % 4;
                String body = "{\"pages\":[{\"template\":\"AUTO\",\"mediaIds\":[" + idsJson(media.subList(0, split)) + "]},"
                        + "{\"template\":\"AUTO\",\"mediaIds\":[" + idsJson(media.subList(split, 6).subList(0, Math.min(4, 6 - split))) + "]}]}";
                results.add(pool.submit(() -> {
                    start.await();
                    return ok(post("/api/albums/" + album + "/pages/initialize"), body);
                }));
            }
            start.countDown();
            List<String> bodies = new ArrayList<>();
            for (Future<String> f : results) bodies.add(f.get());
            // one winner: all clients got the same pages, and only one set of pages exists
            assertThat(bodies).allMatch(b -> b.equals(bodies.get(0)));
            assertThat(jdbc.queryForObject("SELECT count(*) FROM page WHERE album_id = ?::uuid", Integer.class, album)).isEqualTo(2);
            assertThat(jdbc.queryForObject("SELECT count(*) FROM page_item WHERE page_id IN (SELECT id FROM page WHERE album_id = ?::uuid)", Integer.class, album))
                    .isLessThanOrEqualTo(6);
        } finally {
            pool.shutdownNow();
        }
        // a later call changes nothing
        String before = pages();
        ok(post("/api/albums/" + album + "/pages/initialize"), "{\"pages\":[{\"template\":\"FEATURED\",\"mediaIds\":[\"" + media.get(5) + "\"]}]}");
        assertThat(pages()).isEqualTo(before);
    }

    @Test
    void initializeRejectsForeignOrDuplicateMediaAndTooManyPerPage() throws Exception {
        List<UUID> media = newMedia(5);
        assertThat(send(post("/api/albums/" + album + "/pages/initialize"),
                "{\"pages\":[{\"template\":\"AUTO\",\"mediaIds\":[" + idsJson(media) + "]}]}").getResponse().getStatus()).isEqualTo(400);
        assertThat(send(post("/api/albums/" + album + "/pages/initialize"),
                "{\"pages\":[{\"template\":\"AUTO\",\"mediaIds\":[\"" + media.get(0) + "\",\"" + media.get(0) + "\"]}]}").getResponse().getStatus()).isEqualTo(400);
        assertThat(send(post("/api/albums/" + album + "/pages/initialize"),
                "{\"pages\":[{\"template\":\"AUTO\",\"mediaIds\":[\"" + UUID.randomUUID() + "\"]}]}").getResponse().getStatus()).isEqualTo(404);
        assertThat(pageCount()).isZero(); // nothing was written by the failed attempts
    }

    // ---------------------------------------------------------------- upload placement

    String uploadAndComplete(boolean featured, String name) throws Exception {
        byte[] data = ("data-" + name).getBytes();
        String sha = String.format("%064x", new java.math.BigInteger(1, java.security.MessageDigest.getInstance("SHA-256").digest(name.getBytes())));
        String res = ok(post("/api/albums/" + album + "/uploads"), "{\"files\":[{\"clientId\":\"c\",\"filename\":\"" + name + ".jpg\",\"contentType\":\"image/jpeg\","
                + "\"sizeBytes\":" + data.length + ",\"sha256\":\"" + sha + "\",\"featured\":" + featured + "}]}");
        String url = JsonPath.read(res, "$.items[0].uploadUrl");
        String mediaId = JsonPath.read(res, "$.items[0].mediaId");
        var put = http.send(HttpRequest.newBuilder(URI.create(url)).header("Content-Type", "image/jpeg")
                .PUT(HttpRequest.BodyPublishers.ofByteArray(data)).build(), HttpResponse.BodyHandlers.discarding());
        assertThat(put.statusCode()).isEqualTo(200);
        ok(post("/api/media/" + mediaId + "/complete"), null);
        return mediaId;
    }

    @Test
    void completedUploadsFillTheLastAutoPageThenOpenNewOnes() throws Exception {
        initialize(3);
        String a = uploadAndComplete(false, "a");
        assertThat(mediaOnPage(0)).hasSize(4).endsWith(a);
        String b = uploadAndComplete(false, "b");
        assertThat(pageCount()).isEqualTo(2);
        assertThat(template(1)).isEqualTo("AUTO");
        assertThat(mediaOnPage(1)).containsExactly(b);
        // the existing photos did not move
        assertThat(mediaOnPage(0)).hasSize(4);
        assertNoSlotCollisions();
    }

    @Test
    void aSinglePageUploadGetsAFeaturedPageBehindTheLastOne() throws Exception {
        initialize(2);
        String big = uploadAndComplete(true, "big");
        assertThat(pageCount()).isEqualTo(2);
        assertThat(template(1)).isEqualTo("FEATURED");
        assertThat(mediaOnPage(1)).containsExactly(big);
        // the next normal upload cannot join a FEATURED page: it opens an AUTO page after it
        String next = uploadAndComplete(false, "next");
        assertThat(pageCount()).isEqualTo(3);
        assertThat(template(2)).isEqualTo("AUTO");
        assertThat(mediaOnPage(2)).containsExactly(next);
        assertThat(mediaOnPage(0)).hasSize(2);
    }

    @Test
    void anAlbumWithoutPagesLeavesNewUploadsInTheTrayUntilItIsInitialized() throws Exception {
        String first = uploadAndComplete(false, "x");
        assertThat(pageCount()).isZero();
        assertThat(tray()).containsExactly(first);
    }

    @Test
    void concurrentCompletesNeverShareASlot() throws Exception {
        initialize(1);
        int threads = 12;
        ExecutorService pool = Executors.newFixedThreadPool(threads);
        try {
            CountDownLatch start = new CountDownLatch(1);
            List<Future<String>> futures = new ArrayList<>();
            for (int t = 0; t < threads; t++) {
                String name = "c" + t;
                futures.add(pool.submit(() -> {
                    start.await();
                    return uploadAndComplete(false, name);
                }));
            }
            start.countDown();
            List<String> ids = new ArrayList<>();
            for (Future<String> f : futures) ids.add(f.get());

            assertNoSlotCollisions();
            List<String> placed = JsonPath.read(pages(), "$.pages[*].items[*].mediaId");
            assertThat(placed).hasSize(13).doesNotHaveDuplicates().containsAll(ids);
            assertThat(tray()).isEmpty();
            // 13 photos, 4 per page at most, filled in order: 4+4+4+1
            assertThat(pageCount()).isEqualTo(4);
        } finally {
            pool.shutdownNow();
        }
    }

    // ---------------------------------------------------------------- templates

    @Test
    void switchingToFeaturedKeepsTheFirstPhotoAndMovesTheRestBehind() throws Exception {
        List<UUID> media = initialize(3, 2);
        String page0 = pageId(0);
        ok(patch("/api/pages/" + page0), "{\"template\":\"FEATURED\",\"version\":" + version(0) + "}");

        assertThat(pageCount()).isEqualTo(3);
        assertThat(template(0)).isEqualTo("FEATURED");
        assertThat(mediaOnPage(0)).containsExactly(media.get(0).toString());
        assertThat(template(1)).isEqualTo("AUTO");
        assertThat(mediaOnPage(1)).containsExactly(media.get(1).toString(), media.get(2).toString());
        assertThat(mediaOnPage(2)).containsExactly(media.get(3).toString(), media.get(4).toString()); // the old second page is now third
        assertNoSlotCollisions();
        // back to AUTO changes nothing else
        ok(patch("/api/pages/" + page0), "{\"template\":\"AUTO\",\"version\":" + version(0) + "}");
        assertThat(template(0)).isEqualTo("AUTO");
        assertThat(mediaOnPage(0)).containsExactly(media.get(0).toString());
    }

    @Test
    void freezingWritesTheGivenPositionsAndUnfreezingKeepsTheStackingOrder() throws Exception {
        List<UUID> media = initialize(3);
        String body = pages();
        List<String> itemIds = JsonPath.read(body, "$.pages[0].items[*].id");
        int v = version(0);
        // missing positions are refused
        assertThat(send(patch("/api/pages/" + pageId(0)), "{\"template\":\"FREE\",\"version\":" + v + ",\"items\":[]}").getResponse().getStatus()).isEqualTo(400);
        // item 0 gets the highest z so that the order changes on the way back
        String frozen = "[{\"id\":\"" + itemIds.get(0) + "\",\"x\":300,\"y\":400,\"width\":380,\"rotation\":-4,\"zIndex\":30},"
                + "{\"id\":\"" + itemIds.get(1) + "\",\"x\":620,\"y\":500,\"width\":360,\"rotation\":3.5,\"zIndex\":10},"
                + "{\"id\":\"" + itemIds.get(2) + "\",\"x\":500,\"y\":1000,\"width\":400,\"rotation\":0,\"zIndex\":20}]";
        ok(patch("/api/pages/" + pageId(0)), "{\"template\":\"FREE\",\"version\":" + v + ",\"items\":" + frozen + "}");

        String free = pages();
        assertThat(JsonPath.<String>read(free, "$.pages[0].template")).isEqualTo("FREE");
        assertThat(num(free, "$.pages[0].items[?(@.id=='" + itemIds.get(1) + "')].x")).isEqualTo(620.0);
        assertThat(num(free, "$.pages[0].items[?(@.id=='" + itemIds.get(1) + "')].rotation")).isEqualTo(3.5);
        assertThat(JsonPath.<List<Object>>read(free, "$.pages[0].items[*].slotIndex")).containsOnlyNulls();

        ok(patch("/api/pages/" + pageId(0)), "{\"template\":\"AUTO\",\"version\":" + version(0) + "}");
        // order by z: item1 (10), item2 (20), item0 (30)
        assertThat(mediaOnPage(0)).containsExactly(media.get(1).toString(), media.get(2).toString(), media.get(0).toString());
        assertThat(JsonPath.<List<Object>>read(pages(), "$.pages[0].items[*].x")).containsOnlyNulls();
    }

    @Test
    void aFreePageWithMoreThanFourPhotosOverflowsIntoNewAutoPagesWhenSwitchedBack() throws Exception {
        initialize(1);
        String page = pageId(0);
        List<UUID> extra = newMedia(5);
        ok(patch("/api/pages/" + page), "{\"template\":\"FREE\",\"version\":" + version(0) + ",\"items\":[{\"id\":\"" + itemOf(UUID.fromString(mediaOnPage(0).get(0)))
                + "\",\"x\":500,\"y\":700,\"width\":400,\"rotation\":0}]}");
        for (UUID m : extra) {
            ok(post("/api/page-items"), "{\"pageId\":\"" + page + "\",\"mediaId\":\"" + m + "\",\"x\":500,\"y\":700,\"width\":300}");
        }
        assertThat(mediaOnPage(0)).hasSize(6);
        ok(patch("/api/pages/" + page), "{\"template\":\"AUTO\",\"version\":" + version(0) + "}");
        assertThat(mediaOnPage(0)).hasSize(4);
        assertThat(mediaOnPage(1)).hasSize(2);
        assertNoSlotCollisions();
    }

    // ---------------------------------------------------------------- pages

    @Test
    void deletingAPageSendsItsPhotosToTheTrayAndClosesTheGap() throws Exception {
        List<UUID> media = initialize(2, 2, 2);
        ok(delete("/api/pages/" + pageId(1)), null);
        assertThat(pageCount()).isEqualTo(2);
        assertThat(tray()).containsExactlyInAnyOrder(media.get(2).toString(), media.get(3).toString());
        assertThat(JsonPath.<List<Integer>>read(pages(), "$.pages[*].pageIndex")).containsExactly(0, 1);
        assertThat(mediaOnPage(1)).containsExactly(media.get(4).toString(), media.get(5).toString());
        // the media itself is not deleted
        assertThat(jdbc.queryForObject("SELECT count(*) FROM media WHERE album_id = ?::uuid AND deleted_at IS NULL", Integer.class, album)).isEqualTo(6);
    }

    @Test
    void newPagesCanBeInsertedAnywhereAndPagesCanBeReordered() throws Exception {
        List<UUID> media = initialize(1, 1, 1);
        ok(post("/api/albums/" + album + "/pages"), "{\"afterPageIndex\":0,\"template\":\"FREE\"}");
        assertThat(pageCount()).isEqualTo(4);
        assertThat(template(1)).isEqualTo("FREE");
        ok(post("/api/albums/" + album + "/pages"), "{\"afterPageIndex\":-1,\"template\":\"AUTO\"}");
        assertThat(template(0)).isEqualTo("AUTO");
        assertThat(mediaOnPage(1)).containsExactly(media.get(0).toString());
        assertThat(send(post("/api/albums/" + album + "/pages"), "{\"afterPageIndex\":9,\"template\":\"AUTO\"}").getResponse().getStatus()).isEqualTo(400);

        List<String> ids = JsonPath.read(pages(), "$.pages[*].id");
        List<String> reversed = new ArrayList<>(ids);
        java.util.Collections.reverse(reversed);
        ok(post("/api/albums/" + album + "/pages/reorder"), "{\"pageIds\":[" + reversed.stream().map(i -> "\"" + i + "\"").collect(Collectors.joining(",")) + "]}");
        assertThat(JsonPath.<List<String>>read(pages(), "$.pages[*].id")).isEqualTo(reversed);
        // an incomplete list means the client's picture is outdated
        assertThat(send(post("/api/albums/" + album + "/pages/reorder"), "{\"pageIds\":[\"" + ids.get(0) + "\"]}").getResponse().getStatus()).isEqualTo(409);
    }

    // ---------------------------------------------------------------- moves, tray, swap

    @Test
    void movesRespectThePageSizeAndSwapWithFeaturedPages() throws Exception {
        List<UUID> media = initialize(4, 2);
        ok(patch("/api/pages/" + pageId(1)), "{\"template\":\"FEATURED\",\"version\":" + version(1) + "}"); // second page: media 4 stays, 5 -> new AUTO page
        assertThat(pageCount()).isEqualTo(3);

        // page 0 is full: nothing more fits there
        String toFull = "{\"targetPageId\":\"" + pageId(0) + "\"}";
        assertThat(send(post("/api/page-items/" + itemOf(media.get(5)) + "/move"), toFull).getResponse().getStatus()).isEqualTo(409);

        // moving within the page re-orders
        ok(post("/api/page-items/" + itemOf(media.get(3)) + "/move"), "{\"targetPageId\":\"" + pageId(0) + "\",\"slotIndex\":0}");
        assertThat(mediaOnPage(0)).containsExactly(media.get(3).toString(), media.get(0).toString(), media.get(1).toString(), media.get(2).toString());

        // dropping a photo on the FEATURED page swaps: the featured one goes back to where the dropped one came from
        ok(post("/api/page-items/" + itemOf(media.get(0)) + "/move"), "{\"targetPageId\":\"" + pageId(1) + "\"}");
        assertThat(mediaOnPage(1)).containsExactly(media.get(0).toString());
        assertThat(mediaOnPage(0)).containsExactly(media.get(3).toString(), media.get(4).toString(), media.get(1).toString(), media.get(2).toString());
        assertNoSlotCollisions();

        // from AUTO to the freed-up AUTO page
        ok(post("/api/page-items/" + itemOf(media.get(1)) + "/move"), "{\"targetPageId\":\"" + pageId(2) + "\",\"slotIndex\":1}");
        assertThat(mediaOnPage(2)).containsExactly(media.get(5).toString(), media.get(1).toString());
        assertThat(mediaOnPage(0)).hasSize(3);
    }

    @Test
    void theTrayFeedsPagesAndRemovingGivesPhotosBack() throws Exception {
        initialize(2);
        UUID loose = newMedia();
        assertThat(tray()).containsExactly(loose.toString());

        ok(post("/api/page-items"), "{\"pageId\":\"" + pageId(0) + "\",\"mediaId\":\"" + loose + "\"}");
        assertThat(mediaOnPage(0)).hasSize(3).contains(loose.toString());
        assertThat(tray()).isEmpty();
        // a photo can only sit on one place
        assertThat(send(post("/api/page-items"), "{\"pageId\":\"" + pageId(0) + "\",\"mediaId\":\"" + loose + "\"}").getResponse().getStatus()).isEqualTo(409);

        ok(delete("/api/page-items/" + itemOf(loose)), null);
        assertThat(tray()).containsExactly(loose.toString());
        assertThat(mediaOnPage(0)).hasSize(2);
        assertThat(JsonPath.<List<Integer>>read(pages(), "$.pages[0].items[*].slotIndex")).containsExactly(0, 1);
        // the media is untouched
        assertThat(jdbc.queryForObject("SELECT deleted_at IS NULL FROM media WHERE id = ?", Boolean.class, loose)).isTrue();
    }

    @Test
    void aFullAutoPageRefusesTrayPhotosAndFeaturedPagesReplaceTheirPhoto() throws Exception {
        List<UUID> media = initialize(4, 1);
        UUID loose = newMedia();
        assertThat(send(post("/api/page-items"), "{\"pageId\":\"" + pageId(0) + "\",\"mediaId\":\"" + loose + "\"}").getResponse().getStatus()).isEqualTo(409);
        ok(patch("/api/pages/" + pageId(1)), "{\"template\":\"FEATURED\",\"version\":" + version(1) + "}");
        ok(post("/api/page-items"), "{\"pageId\":\"" + pageId(1) + "\",\"mediaId\":\"" + loose + "\"}");
        assertThat(mediaOnPage(1)).containsExactly(loose.toString());
        assertThat(tray()).containsExactly(media.get(4).toString());
    }

    @Test
    void deletingMediaTakesItOffItsPage() throws Exception {
        List<UUID> media = initialize(3);
        assertThat(send(delete("/api/media/" + media.get(1)), null).getResponse().getStatus()).isEqualTo(204);
        assertThat(mediaOnPage(0)).containsExactly(media.get(0).toString(), media.get(2).toString());
        assertThat(JsonPath.<List<Integer>>read(pages(), "$.pages[0].items[*].slotIndex")).containsExactly(0, 1);
        assertThat(tray()).isEmpty(); // deleted media is not "unplaced" either
    }

    // ---------------------------------------------------------------- featuring

    @Test
    void featureGivesThePhotoAFeaturedPageRightBehindItsPage() throws Exception {
        List<UUID> media = initialize(3, 2);
        ok(post("/api/media/" + media.get(1) + "/feature"), null);
        assertThat(pageCount()).isEqualTo(3);
        assertThat(mediaOnPage(0)).containsExactly(media.get(0).toString(), media.get(2).toString());
        assertThat(template(1)).isEqualTo("FEATURED");
        assertThat(mediaOnPage(1)).containsExactly(media.get(1).toString());
        assertThat(mediaOnPage(2)).containsExactly(media.get(3).toString(), media.get(4).toString());
        // featuring again changes nothing
        String before = pages();
        ok(post("/api/media/" + media.get(1) + "/feature"), null);
        assertThat(pages()).isEqualTo(before);
        assertNoSlotCollisions();
    }

    @Test
    void featuringTheOnlyPhotoOfAPageDoesNotLeaveAnEmptyPageBehind() throws Exception {
        List<UUID> media = initialize(1, 2);
        ok(post("/api/media/" + media.get(0) + "/feature"), null);
        assertThat(pageCount()).isEqualTo(2);
        assertThat(template(0)).isEqualTo("FEATURED");
        assertThat(mediaOnPage(0)).containsExactly(media.get(0).toString());
        assertThat(mediaOnPage(1)).hasSize(2);
        assertThat(JsonPath.<List<Integer>>read(pages(), "$.pages[*].pageIndex")).containsExactly(0, 1);
    }

    // ---------------------------------------------------------------- positions and conflicts

    @Test
    void positionsAreOnlyEditableOnFreePagesAndStaleVersionsGet409WithTheCurrentPage() throws Exception {
        List<UUID> media = initialize(2);
        String item = itemOf(media.get(0));
        // AUTO pages have no free positions
        assertThat(send(patch("/api/page-items/" + item), "{\"x\":10,\"version\":" + itemVersion(media.get(0)) + "}").getResponse().getStatus()).isEqualTo(409);

        List<String> ids = JsonPath.read(pages(), "$.pages[0].items[*].id");
        String frozen = "[{\"id\":\"" + ids.get(0) + "\",\"x\":300,\"y\":400,\"width\":380,\"rotation\":0,\"zIndex\":1},{\"id\":\"" + ids.get(1)
                + "\",\"x\":600,\"y\":900,\"width\":380,\"rotation\":0,\"zIndex\":2}]";
        int pageVersion = version(0);
        ok(patch("/api/pages/" + pageId(0)), "{\"template\":\"FREE\",\"version\":" + pageVersion + ",\"items\":" + frozen + "}");

        // a second device still holds the old page version
        MvcResult stalePage = send(patch("/api/pages/" + pageId(0)), "{\"template\":\"AUTO\",\"version\":" + pageVersion + "}");
        assertThat(stalePage.getResponse().getStatus()).isEqualTo(409);
        assertThat(JsonPath.<String>read(stalePage.getResponse().getContentAsString(), "$.current.template")).isEqualTo("FREE");
        assertThat(JsonPath.<String>read(stalePage.getResponse().getContentAsString(), "$.detail")).contains("başka bir yerde");

        int v = itemVersion(media.get(0));
        String moved = ok(patch("/api/page-items/" + item), "{\"x\":120,\"rotation\":12,\"zIndex\":5,\"version\":" + v + "}");
        assertThat(JsonPath.<Number>read(moved, "$.x").doubleValue()).isEqualTo(120.0);
        assertThat(JsonPath.<Number>read(moved, "$.y").doubleValue()).isEqualTo(400.0); // untouched fields stay
        assertThat(JsonPath.<Integer>read(moved, "$.version")).isEqualTo(v + 1);

        MvcResult staleItem = send(patch("/api/page-items/" + item), "{\"x\":999,\"version\":" + v + "}");
        assertThat(staleItem.getResponse().getStatus()).isEqualTo(409);
        assertThat(num(staleItem.getResponse().getContentAsString(), "$.current.items[?(@.id=='" + item + "')].x")).isEqualTo(120.0);
        // the losing write changed nothing
        assertThat(jdbc.queryForObject("SELECT x FROM page_item WHERE id = ?::uuid", Double.class, item)).isEqualTo(120.0);
        // missing version and absurd values are refused
        assertThat(send(patch("/api/page-items/" + item), "{\"x\":1}").getResponse().getStatus()).isEqualTo(400);
        assertThat(send(patch("/api/page-items/" + item), "{\"x\":1e9,\"version\":" + (v + 1) + "}").getResponse().getStatus()).isEqualTo(400);
    }

    @Test
    void aMediaItemCanOnlyBeOnOnePageEvenWithDirectInserts() throws Exception {
        List<UUID> media = initialize(1);
        String page = pageId(0);
        org.junit.jupiter.api.Assertions.assertThrows(org.springframework.dao.DuplicateKeyException.class,
                () -> jdbc.update("INSERT INTO page_item (page_id, space_id, kind, media_id, slot_index) VALUES (?::uuid, ?, 'MEDIA', ?, 5)", page, space, media.get(0)));
    }
}
