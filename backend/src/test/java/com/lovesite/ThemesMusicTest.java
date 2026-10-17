package com.lovesite;

import com.jayway.jsonpath.JsonPath;
import com.lovesite.media.Media;
import com.lovesite.media.MediaKind;
import com.lovesite.media.MediaRepository;
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
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import org.springframework.test.web.servlet.request.RequestPostProcessor;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.sql.Timestamp;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;

/** Themes, page colour / paper, stickers and the per-album song. */
@SpringBootTest
@AutoConfigureMockMvc
class ThemesMusicTest {

    @DynamicPropertySource
    static void properties(DynamicPropertyRegistry r) {
        TestInfrastructure.register(r);
    }

    @Autowired MockMvc mvc;
    @Autowired JdbcTemplate jdbc;
    @Autowired StorageService storage;
    @Autowired MediaRepository mediaRepository;
    @Autowired TrashPurgeJob purge;

    final HttpClient http = HttpClient.newHttpClient();
    RequestPostProcessor me;
    String email;
    UUID space;
    UUID userId;
    String album;

    @BeforeEach
    void setUp() throws Exception {
        email = "theme-" + UUID.randomUUID().toString().substring(0, 8) + "@x.io";
        space = TenantFixtures.spaceWithOwner(jdbc, "Themes", 50 * TenantFixtures.GIB, email);
        userId = jdbc.queryForObject("SELECT id FROM app_user WHERE email = ?", UUID.class, email);
        me = user(email);
        album = JsonPath.read(ok(post("/api/albums"), "{\"title\":\"T\"}"), "$.id");
    }

    MvcResult send(MockHttpServletRequestBuilder request, RequestPostProcessor who, String body) throws Exception {
        MockHttpServletRequestBuilder r = request.with(who).with(csrf()).contentType(MediaType.APPLICATION_JSON);
        if (body != null) r.content(body);
        return mvc.perform(r).andReturn();
    }

    int status(MockHttpServletRequestBuilder request, String body) throws Exception {
        return send(request, me, body).getResponse().getStatus();
    }

    String ok(MockHttpServletRequestBuilder request, String body) throws Exception {
        MvcResult res = send(request, me, body);
        assertThat(res.getResponse().getStatus()).as(res.getResponse().getContentAsString()).isBetween(200, 201);
        return res.getResponse().getContentAsString();
    }

    String pages() throws Exception {
        return ok(get("/api/albums/" + album + "/pages"), null);
    }

    UUID media() {
        Media m = new Media(UUID.randomUUID(), space, UUID.fromString(album), userId, MediaKind.IMAGE, "t.jpg", "image/jpeg", 10, null, null);
        m.markUploaded(10);
        mediaRepository.saveAndFlush(m);
        return m.getId();
    }

    /** one AUTO page holding `n` photos */
    String initPage(int n) throws Exception {
        StringBuilder ids = new StringBuilder();
        for (int i = 0; i < n; i++) ids.append(i > 0 ? "," : "").append('"').append(media()).append('"');
        ok(post("/api/albums/" + album + "/pages/initialize"), "{\"pages\":[{\"template\":\"AUTO\",\"mediaIds\":[" + ids + "]}]}");
        return JsonPath.read(pages(), "$.pages[0].id");
    }

    int pageVersion() throws Exception {
        return JsonPath.read(pages(), "$.pages[0].version");
    }

    long used() throws Exception {
        return JsonPath.<Number>read(ok(get("/api/space"), null), "$.usedBytes").longValue();
    }

    boolean exists(String key) {
        return storage.head(key).isPresent();
    }

    // ---------------------------------------------------------------- theme

    @Test
    void anAlbumHasAThemeThatDefaultsToRomantikAndIsValidated() throws Exception {
        assertThat(JsonPath.<String>read(ok(get("/api/albums"), null), "$[0].themeId")).isEqualTo("romantik");
        String created = ok(post("/api/albums"), "{\"title\":\"Sihir\",\"themeId\":\"buyulu\"}");
        assertThat(JsonPath.<String>read(created, "$.themeId")).isEqualTo("buyulu");

        for (String bad : List.of("hogwarts", "Romantik", "x".repeat(41), "../etc", "buyulu ")) {
            assertThat(status(post("/api/albums"), "{\"title\":\"x\",\"themeId\":\"" + bad + "\"}")).as(bad).isEqualTo(400);
        }
        String id = JsonPath.read(created, "$.id");
        assertThat(JsonPath.<String>read(ok(patch("/api/albums/" + id), "{\"themeId\":\"cadilar-bayrami\"}"), "$.themeId")).isEqualTo("cadilar-bayrami");
        // renaming keeps the theme, and changing the theme keeps the title
        String renamed = ok(patch("/api/albums/" + id), "{\"title\":\"Yeni ad\"}");
        assertThat(JsonPath.<String>read(renamed, "$.themeId")).isEqualTo("cadilar-bayrami");
        assertThat(JsonPath.<String>read(ok(patch("/api/albums/" + id), "{\"themeId\":\"yilbasi\"}"), "$.title")).isEqualTo("Yeni ad");
        assertThat(status(patch("/api/albums/" + id), "{\"themeId\":\"nope\"}")).isEqualTo(400);
        assertThat(status(patch("/api/albums/" + id), "{\"title\":\"  \"}")).isEqualTo(400);
        for (String theme : List.of("romantik", "buyulu", "arkadaslar", "seyahat", "yilbasi", "cadilar-bayrami")) {
            assertThat(JsonPath.<String>read(ok(patch("/api/albums/" + id), "{\"themeId\":\"" + theme + "\"}"), "$.themeId")).isEqualTo(theme);
        }
    }

    // ---------------------------------------------------------------- page look

    @Test
    void pageColourAndPaperUseSemanticSlotsAndCanBeResetToTheThemeDefault() throws Exception {
        String page = initPage(2);
        ok(patch("/api/pages/" + page), "{\"swatch\":\"dark\",\"paper\":\"textured\",\"version\":" + pageVersion() + "}");
        assertThat(JsonPath.<String>read(pages(), "$.pages[0].swatch")).isEqualTo("dark");
        assertThat(JsonPath.<String>read(pages(), "$.pages[0].paper")).isEqualTo("textured");

        for (String bad : List.of("neon", "DARK", "#000000", "dark;drop")) {
            assertThat(status(patch("/api/pages/" + page), "{\"swatch\":\"" + bad + "\",\"version\":" + pageVersion() + "}")).as(bad).isEqualTo(400);
        }
        assertThat(status(patch("/api/pages/" + page), "{\"paper\":\"glitter\",\"version\":" + pageVersion() + "}")).isEqualTo(400);
        // an invalid change leaves the stored look alone
        assertThat(JsonPath.<String>read(pages(), "$.pages[0].swatch")).isEqualTo("dark");

        // only the given slot changes
        ok(patch("/api/pages/" + page), "{\"swatch\":\"soft\",\"version\":" + pageVersion() + "}");
        assertThat(JsonPath.<String>read(pages(), "$.pages[0].paper")).isEqualTo("textured");
        // the look survives a template change
        ok(patch("/api/pages/" + page), "{\"template\":\"FEATURED\",\"version\":" + pageVersion() + "}");
        assertThat(JsonPath.<String>read(pages(), "$.pages[0].swatch")).isEqualTo("soft");

        ok(patch("/api/pages/" + page), "{\"swatch\":\"DEFAULT\",\"paper\":\"DEFAULT\",\"version\":" + pageVersion() + "}");
        assertThat(JsonPath.<Object>read(pages(), "$.pages[0].swatch")).isNull();
        assertThat(JsonPath.<Object>read(pages(), "$.pages[0].paper")).isNull();

        // a stale device gets a 409 with the current page
        int stale = pageVersion();
        ok(patch("/api/pages/" + page), "{\"swatch\":\"deep\",\"version\":" + stale + "}");
        MvcResult conflict = send(patch("/api/pages/" + page), me, "{\"swatch\":\"light\",\"version\":" + stale + "}");
        assertThat(conflict.getResponse().getStatus()).isEqualTo(409);
        assertThat(JsonPath.<String>read(conflict.getResponse().getContentAsString(), "$.current.swatch")).isEqualTo("deep");
    }

    // ---------------------------------------------------------------- stickers

    String sticker(String page, String variant) {
        return "{\"pageId\":\"" + page + "\",\"kind\":\"STICKER\",\"variant\":\"" + variant + "\",\"x\":500,\"y\":700,\"width\":160,\"rotation\":-8}";
    }

    @Test
    void stickersAreFreeLayersOnEveryTemplateAndDoNotTouchTheLayout() throws Exception {
        String page = initPage(4);
        String res = ok(post("/api/page-items"), sticker(page, "romantik:wax-seal"));
        assertThat(JsonPath.<List<String>>read(res, "$.pages[0].items[?(@.kind=='STICKER')].variant")).containsExactly("romantik:wax-seal");
        // 4 photos on an AUTO page plus a sticker: the page is not "full" for photos in any other sense, and the tray stays empty
        assertThat(JsonPath.<List<Object>>read(res, "$.tray")).isEmpty();
        assertThat(JsonPath.<List<Object>>read(res, "$.pages[0].items[?(@.kind=='MEDIA')]")).hasSize(4);
        assertThat(JsonPath.<List<Integer>>read(res, "$.pages[0].items[?(@.kind=='MEDIA')].slotIndex")).containsExactly(0, 1, 2, 3);

        // any template
        ok(patch("/api/pages/" + page), "{\"template\":\"FEATURED\",\"version\":" + pageVersion() + "}");
        ok(post("/api/page-items"), sticker(page, "buyulu:owl"));
        assertThat(JsonPath.<List<Object>>read(pages(), "$.pages[0].items[?(@.kind=='STICKER')]")).hasSize(2);
        // the overflow photos of the template change moved on, the stickers stayed
        assertThat(JsonPath.<Integer>read(pages(), "$.pages.length()")).isEqualTo(2);
        assertThat(JsonPath.<List<Object>>read(pages(), "$.pages[1].items[?(@.kind=='STICKER')]")).isEmpty();

        // position / delete work for stickers on non-free pages
        String stickerId = JsonPath.<List<String>>read(pages(), "$.pages[0].items[?(@.kind=='STICKER')].id").get(0);
        int version = JsonPath.<List<Integer>>read(pages(), "$.pages[0].items[?(@.id=='" + stickerId + "')].version").get(0);
        String moved = ok(patch("/api/page-items/" + stickerId), "{\"x\":120,\"y\":340,\"rotation\":15,\"version\":" + version + "}");
        assertThat(JsonPath.<Number>read(moved, "$.x").doubleValue()).isEqualTo(120.0);
        ok(delete("/api/page-items/" + stickerId), null);
        assertThat(JsonPath.<List<Object>>read(pages(), "$.pages[0].items[?(@.kind=='STICKER')]")).hasSize(1);
    }

    @Test
    void stickerVariantsPositionsAndTheLimitAreValidated() throws Exception {
        String page = initPage(1);
        for (String bad : List.of("Romantik:heart", "romantik", "romantik:", ":heart", "a:b", "romantik:heart extra", "romantik:he/art",
                "x".repeat(40) + ":heart", "romantik:" + "y".repeat(50), "ro mantik:heart", "romantik:heart;drop")) {
            assertThat(status(post("/api/page-items"), sticker(page, bad))).as(bad).isEqualTo(400);
        }
        assertThat(status(post("/api/page-items"), "{\"pageId\":\"" + page + "\",\"kind\":\"STICKER\",\"variant\":\"romantik:heart\"}")).isEqualTo(400); // no position
        assertThat(status(post("/api/page-items"), "{\"pageId\":\"" + page + "\",\"kind\":\"STICKER\",\"variant\":\"romantik:heart\",\"x\":1e9,\"y\":1}")).isEqualTo(400);
        assertThat(status(post("/api/page-items"), "{\"pageId\":\"" + page + "\",\"kind\":\"TAPE\",\"variant\":\"romantik:heart\",\"x\":1,\"y\":1}")).isEqualTo(400);

        for (int i = 0; i < 20; i++) ok(post("/api/page-items"), sticker(page, "romantik:heart"));
        MvcResult tooMany = send(post("/api/page-items"), me, sticker(page, "romantik:heart"));
        assertThat(tooMany.getResponse().getStatus()).isEqualTo(400);
        assertThat(JsonPath.<String>read(tooMany.getResponse().getContentAsString(), "$.detail")).contains("20");
        assertThat(JsonPath.<List<Object>>read(pages(), "$.pages[0].items[?(@.kind=='STICKER')]")).hasSize(20);
        // the limit is per page
        ok(post("/api/albums/" + album + "/pages"), "{\"afterPageIndex\":0,\"template\":\"FREE\"}");
        String second = JsonPath.read(pages(), "$.pages[1].id");
        ok(post("/api/page-items"), sticker(second, "romantik:heart"));
    }

    // ---------------------------------------------------------------- music

    String musicUpload(String body) throws Exception {
        return ok(post("/api/albums/" + album + "/music/upload"), body);
    }

    String upload(String filename, String type, int size) {
        return "{\"filename\":\"" + filename + "\",\"contentType\":\"" + type + "\",\"sizeBytes\":" + size + "}";
    }

    void put(String url, String type, byte[] data) throws Exception {
        var res = http.send(HttpRequest.newBuilder(URI.create(url)).header("Content-Type", type).PUT(HttpRequest.BodyPublishers.ofByteArray(data)).build(),
                HttpResponse.BodyHandlers.discarding());
        assertThat(res.statusCode()).isEqualTo(200);
    }

    String pendingKey() {
        return jdbc.queryForObject("SELECT music_pending_key FROM album WHERE id = ?::uuid", String.class, album);
    }

    String musicKey() {
        return jdbc.queryForObject("SELECT music_key FROM album WHERE id = ?::uuid", String.class, album);
    }

    String uploadSong(String filename, byte[] data) throws Exception {
        String res = musicUpload(upload(filename, "audio/mpeg", data.length));
        put(JsonPath.read(res, "$.uploadUrl"), "audio/mpeg", data);
        return ok(post("/api/albums/" + album + "/music/complete"), null);
    }

    @Test
    void aSongCanBeUploadedPlayedReplacedAndRemoved() throws Exception {
        assertThat(JsonPath.<Object>read(ok(get("/api/albums"), null), "$[0].musicUrl")).isNull();
        byte[] first = new byte[3000];
        String done = uploadSong("sarki.mp3", first);
        String url = JsonPath.read(done, "$.musicUrl");
        assertThat(JsonPath.<String>read(done, "$.musicName")).isEqualTo("sarki.mp3");
        String key = musicKey();
        assertThat(key).startsWith("spaces/" + space + "/albums/" + album + "/audio/");
        var got = http.send(HttpRequest.newBuilder(URI.create(url)).GET().build(), HttpResponse.BodyHandlers.ofByteArray());
        assertThat(got.body()).hasSize(3000);
        assertThat(used()).isEqualTo(3000);
        assertThat(JsonPath.<String>read(ok(get("/api/albums"), null), "$[0].musicUrl")).isNotBlank();

        // replacing removes the previous object
        String second = uploadSong("yeni.m4a", new byte[1200]);
        assertThat(JsonPath.<String>read(second, "$.musicName")).isEqualTo("yeni.m4a");
        assertThat(exists(key)).isFalse();
        assertThat(exists(musicKey())).isTrue();
        assertThat(used()).isEqualTo(1200);

        String removed = ok(delete("/api/albums/" + album + "/music"), null);
        assertThat(JsonPath.<Object>read(removed, "$.musicUrl")).isNull();
        assertThat(jdbc.queryForObject("SELECT music_key IS NULL FROM album WHERE id = ?::uuid", Boolean.class, album)).isTrue();
        assertThat(used()).isZero();
    }

    @Test
    void songUploadsAreCheckedForTypeSizeAndQuota() throws Exception {
        assertThat(status(post("/api/albums/" + album + "/music/upload"), upload("a.exe", "application/x-msdownload", 100))).isEqualTo(400);
        assertThat(status(post("/api/albums/" + album + "/music/upload"), upload("a.wav", "audio/wav", 100))).isEqualTo(400);
        assertThat(status(post("/api/albums/" + album + "/music/upload"), upload("a.mp3", "audio/mpeg", 0))).isEqualTo(400);
        assertThat(status(post("/api/albums/" + album + "/music/upload"), upload("a.mp3", "audio/mpeg", 20 * 1024 * 1024 + 1))).isEqualTo(400);
        for (String type : List.of("audio/mpeg", "audio/mp4", "audio/x-m4a", "audio/aac", "audio/ogg")) {
            assertThat(status(post("/api/albums/" + album + "/music/upload"), upload("a", type, 10))).as(type).isEqualTo(200);
        }

        // quota: the space only has 1000 bytes
        jdbc.update("UPDATE space SET storage_limit_bytes = 1000 WHERE id = ?", space);
        MvcResult big = send(post("/api/albums/" + album + "/music/upload"), me, upload("big.mp3", "audio/mpeg", 2000));
        assertThat(big.getResponse().getStatus()).isEqualTo(413);
        assertThat(JsonPath.<String>read(big.getResponse().getContentAsString(), "$.code")).isEqualTo("QUOTA_EXCEEDED");
        assertThat(status(post("/api/albums/" + album + "/music/upload"), upload("fits.mp3", "audio/mpeg", 900))).isEqualTo(200);
        // the song and the photos share the same allowance: the pending 900 bytes are counted already
        Media m = new Media(UUID.randomUUID(), space, UUID.fromString(album), userId, MediaKind.IMAGE, "x.jpg", "image/jpeg", 200, null, null);
        m.markUploaded(200);
        mediaRepository.saveAndFlush(m);
        assertThat(used()).isEqualTo(1100);
        assertThat(status(post("/api/albums/" + album + "/music/upload"), upload("fits2.mp3", "audio/mpeg", 900))).isEqualTo(413);
    }

    @Test
    void completeNeedsTheUploadAndChecksWhatWasReallyStored() throws Exception {
        assertThat(status(post("/api/albums/" + album + "/music/complete"), null)).isEqualTo(409); // nothing requested
        String res = musicUpload(upload("a.mp3", "audio/mpeg", 500));
        assertThat(status(post("/api/albums/" + album + "/music/complete"), null)).isEqualTo(409); // not uploaded yet

        // the requested type is part of the signature: a different type cannot even be PUT with this URL
        String key = pendingKey();
        storage.putObject(key, "audio/ogg", new byte[500]); // stored under another type than requested
        MvcResult mismatch = send(post("/api/albums/" + album + "/music/complete"), me, null);
        assertThat(mismatch.getResponse().getStatus()).isEqualTo(422);
        assertThat(exists(key)).isFalse();
        assertThat(pendingKey()).isNull();
        assertThat(used()).isZero();
        assertThat(res).contains("uploadUrl");
    }

    @Test
    void aNewRequestReplacesAnUnconfirmedUpload() throws Exception {
        musicUpload(upload("one.mp3", "audio/mpeg", 400));
        String firstPending = pendingKey();
        storage.putObject(firstPending, "audio/mpeg", new byte[400]);
        assertThat(used()).isEqualTo(400); // reserved already
        musicUpload(upload("two.mp3", "audio/mpeg", 700));
        assertThat(pendingKey()).isNotEqualTo(firstPending);
        assertThat(exists(firstPending)).isFalse();
        assertThat(used()).isEqualTo(700);
    }

    @Test
    void theOldSpaceWideMusicEndpointIsGone() throws Exception {
        assertThat(mvc.perform(get("/api/settings/music").with(me)).andReturn().getResponse().getStatus()).isEqualTo(404);
    }

    @Test
    void anAlbumSongIsPurgedWithItsAlbumAndNoEarlier() throws Exception {
        uploadSong("p.mp3", new byte[800]);
        String key = musicKey();
        mvc.perform(delete("/api/albums/" + album).with(me).with(csrf()));
        assertThat(used()).isEqualTo(800); // in the trash it still counts

        jdbc.update("UPDATE album SET deleted_at = ? WHERE id = ?::uuid", Timestamp.from(Instant.now().minus(29, ChronoUnit.DAYS)), album);
        purge.purge(Instant.now());
        assertThat(exists(key)).isTrue();

        jdbc.update("UPDATE album SET deleted_at = ? WHERE id = ?::uuid", Timestamp.from(Instant.now().minus(31, ChronoUnit.DAYS)), album);
        purge.purge(Instant.now());
        assertThat(exists(key)).isFalse();
        assertThat(jdbc.queryForObject("SELECT count(*) FROM album WHERE id = ?::uuid", Integer.class, album)).isZero();
        assertThat(used()).isZero();
    }

    // ---------------------------------------------------------------- who added it, and other spaces

    @Test
    void mediaCarriesTheNameOfWhoAddedIt() throws Exception {
        UUID id = media();
        jdbc.update("UPDATE app_user SET display_name = 'Ayşe' WHERE id = ?", userId);
        initPage(0 + 1);
        String list = ok(get("/api/albums/" + album + "/media"), null);
        assertThat(JsonPath.<List<String>>read(list, "$[*].uploadedByName")).contains("Ayşe").doesNotContainNull();
        assertThat(id).isNotNull();
    }

    @Test
    void otherSpacesCannotTouchThemesMusicOrStickers() throws Exception {
        String page = initPage(1);
        String outsiderEmail = "outsider-" + UUID.randomUUID().toString().substring(0, 8) + "@x.io";
        TenantFixtures.spaceWithOwner(jdbc, "Other", TenantFixtures.GIB, outsiderEmail);
        RequestPostProcessor outsider = user(outsiderEmail);
        uploadSong("s.mp3", new byte[300]);
        String before = pages();
        String musicBefore = musicKey();
        UUID missing = UUID.randomUUID();

        List<MockHttpServletRequestBuilder> probes = List.of(
                patch("/api/albums/" + album).content("{\"themeId\":\"yilbasi\"}"),
                post("/api/albums/" + album + "/music/upload").content(upload("a.mp3", "audio/mpeg", 10)),
                post("/api/albums/" + album + "/music/complete"),
                delete("/api/albums/" + album + "/music"),
                patch("/api/pages/" + page).content("{\"swatch\":\"dark\",\"version\":0}"),
                post("/api/page-items").content(sticker(page, "romantik:heart")));
        for (MockHttpServletRequestBuilder probe : probes) {
            MvcResult res = mvc.perform(probe.with(outsider).with(csrf()).contentType(MediaType.APPLICATION_JSON)).andReturn();
            assertThat(res.getResponse().getStatus()).isEqualTo(404);
        }
        assertThat(pages()).isEqualTo(before);
        assertThat(musicKey()).isEqualTo(musicBefore);
        assertThat(JsonPath.<String>read(ok(get("/api/albums"), null), "$[0].themeId")).isEqualTo("romantik");
        assertThat(missing).isNotNull();
    }
}
