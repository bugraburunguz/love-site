package com.lovesite;

import com.jayway.jsonpath.JsonPath;
import com.lovesite.media.Media;
import com.lovesite.media.MediaKind;
import com.lovesite.media.MediaRepository;
import com.lovesite.storage.StorageService;
import com.lovesite.user.AppUser;
import com.lovesite.user.AppUserRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import org.springframework.test.web.servlet.request.RequestPostProcessor;

import java.sql.Timestamp;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;

@SpringBootTest
@AutoConfigureMockMvc
@Import(StatementCounter.class)
class AlbumSummaryTest {

    @DynamicPropertySource
    static void properties(DynamicPropertyRegistry r) {
        TestInfrastructure.register(r);
    }

    @Autowired MockMvc mvc;
    @Autowired JdbcTemplate jdbc;
    @Autowired MediaRepository mediaRepository;
    @Autowired StorageService storage;
    @Autowired AppUserRepository users;

    RequestPostProcessor me;
    UUID space;
    UUID userId;

    @BeforeEach
    void setUp() {
        String email = "summary-" + UUID.randomUUID().toString().substring(0, 8) + "@x.io";
        space = TenantFixtures.spaceWithOwner(jdbc, "Summary", 50 * TenantFixtures.GIB, email);
        userId = jdbc.queryForObject("SELECT id FROM app_user WHERE email = ?", UUID.class, email);
        me = user(email);
    }

    MvcResult send(RequestPostProcessor who, MockHttpServletRequestBuilder request, String body) throws Exception {
        MockHttpServletRequestBuilder r = request.with(who).with(csrf()).contentType(MediaType.APPLICATION_JSON);
        if (body != null) {
            r.content(body);
        }
        return mvc.perform(r).andReturn();
    }

    String ok(MockHttpServletRequestBuilder request, String body) throws Exception {
        MvcResult res = send(me, request, body);
        assertThat(res.getResponse().getStatus()).as(res.getResponse().getContentAsString()).isBetween(200, 201);
        return res.getResponse().getContentAsString();
    }

    UUID album(String title) throws Exception {
        return UUID.fromString(JsonPath.read(ok(post("/api/albums"), "{\"title\":\"" + title + "\"}"), "$.id"));
    }

    UUID media(UUID album, MediaKind kind, String status, Instant createdAt, Instant shownOverride) {
        Media m = new Media(UUID.randomUUID(), space, album, userId, kind, "f", kind == MediaKind.IMAGE ? "image/jpeg" : "video/mp4", 10, null, null);
        mediaRepository.saveAndFlush(m);
        jdbc.update("UPDATE media SET status = ?, created_at = ?, date_override = ? WHERE id = ?", status, Timestamp.from(createdAt),
                shownOverride == null ? null : Timestamp.from(shownOverride), m.getId());
        return m.getId();
    }

    void keys(UUID media, String thumb, String display, String poster) {
        jdbc.update("UPDATE media SET thumb_key = ?, display_key = ?, poster_key = ? WHERE id = ?", thumb, display, poster, media);
    }

    static Instant at(String iso) {
        return Instant.parse(iso);
    }

    @SuppressWarnings("unchecked")
    Map<String, Object> listed(UUID album) throws Exception {
        List<Map<String, Object>> all = JsonPath.read(ok(get("/api/albums"), null), "$[?(@.id == '" + album + "')]");
        assertThat(all).hasSize(1);
        return all.get(0);
    }

    static Instant instant(Object json) {
        return json == null ? null : Instant.parse((String) json);
    }

    @Test
    void listCarriesCountDatesAndCover() throws Exception {
        UUID album = album("Dolu");
        UUID video = media(album, MediaKind.VIDEO, "READY", at("2024-03-01T10:00:00Z"), null);
        keys(video, "t/video-thumb", "d/video-display", "p/video-poster");
        UUID image = media(album, MediaKind.IMAGE, "READY", at("2024-03-02T10:00:00Z"), at("2020-01-01T00:00:00Z"));
        keys(image, "t/image-thumb", "d/image-display", null);
        media(album, MediaKind.IMAGE, "FAILED", at("2024-02-01T10:00:00Z"), null);
        media(album, MediaKind.IMAGE, "PROCESSING", at("2024-05-01T10:00:00Z"), null);
        media(album, MediaKind.IMAGE, "PENDING_UPLOAD", at("2019-01-01T00:00:00Z"), null);
        media(album, MediaKind.IMAGE, "REJECTED", at("2030-01-01T00:00:00Z"), null);
        UUID deleted = media(album, MediaKind.IMAGE, "READY", at("2010-01-01T00:00:00Z"), null);
        jdbc.update("UPDATE media SET deleted_at = now(), thumb_key = 'deleted' WHERE id = ?", deleted);

        Map<String, Object> a = listed(album);
        assertThat(a.get("mediaCount")).isEqualTo(4);
        assertThat(instant(a.get("firstShownAt"))).isEqualTo(at("2020-01-01T00:00:00Z"));
        assertThat(instant(a.get("lastShownAt"))).isEqualTo(at("2024-05-01T10:00:00Z"));
        assertThat(a.get("coverUrl")).isEqualTo(storage.presignGet("p/video-poster"));
    }

    @Test
    void imageCoverIsThumbOrDisplay() throws Exception {
        UUID withThumb = album("Thumb");
        keys(media(withThumb, MediaKind.IMAGE, "READY", at("2024-01-01T00:00:00Z"), null), "t/a", "d/a", null);
        UUID displayOnly = album("Display");
        media(displayOnly, MediaKind.IMAGE, "UPLOADED", at("2023-01-01T00:00:00Z"), null);
        keys(media(displayOnly, MediaKind.IMAGE, "READY", at("2024-01-01T00:00:00Z"), null), null, "d/b", null);
        UUID notReady = album("Bekliyor");
        media(notReady, MediaKind.IMAGE, "PROCESSING", at("2024-01-01T00:00:00Z"), null);

        assertThat(listed(withThumb).get("coverUrl")).isEqualTo(storage.presignGet("t/a"));
        assertThat(listed(displayOnly).get("coverUrl")).isEqualTo(storage.presignGet("d/b"));
        assertThat(listed(displayOnly).get("mediaCount")).isEqualTo(2);
        assertThat(listed(notReady).get("coverUrl")).isNull();
        assertThat(listed(notReady).get("mediaCount")).isEqualTo(1);
    }

    @Test
    void coverSkipsAReadyItemWithoutAnImage() throws Exception {
        UUID album = album("Postersiz");
        keys(media(album, MediaKind.VIDEO, "READY", at("2024-01-01T00:00:00Z"), null), null, null, null);
        keys(media(album, MediaKind.IMAGE, "READY", at("2024-01-02T00:00:00Z"), null), "t/next", null, null);

        assertThat(listed(album).get("coverUrl")).isEqualTo(storage.presignGet("t/next"));
    }

    @Test
    void emptyAlbumHasZeroAndNulls() throws Exception {
        UUID album = album("Bos");
        Map<String, Object> a = listed(album);
        assertThat(a.get("mediaCount")).isEqualTo(0);
        assertThat(a.get("firstShownAt")).isNull();
        assertThat(a.get("lastShownAt")).isNull();
        assertThat(a.get("coverUrl")).isNull();

        String created = ok(post("/api/albums"), "{\"title\":\"Yeni\"}");
        assertThat((Integer) JsonPath.read(created, "$.mediaCount")).isZero();
    }

    @Test
    void getByIdCarriesTheSameFields() throws Exception {
        UUID album = album("Tek");
        UUID image = media(album, MediaKind.IMAGE, "READY", at("2024-03-02T10:00:00Z"), null);
        keys(image, "t/one", null, null);
        media(album, MediaKind.VIDEO, "FAILED", at("2024-04-02T10:00:00Z"), null);

        String body = ok(get("/api/albums/" + album), null);
        assertThat((String) JsonPath.read(body, "$.id")).isEqualTo(album.toString());
        assertThat((String) JsonPath.read(body, "$.title")).isEqualTo("Tek");
        assertThat((Integer) JsonPath.read(body, "$.mediaCount")).isEqualTo(2);
        assertThat(instant(JsonPath.read(body, "$.firstShownAt"))).isEqualTo(at("2024-03-02T10:00:00Z"));
        assertThat(instant(JsonPath.read(body, "$.lastShownAt"))).isEqualTo(at("2024-04-02T10:00:00Z"));
        assertThat((String) JsonPath.read(body, "$.coverUrl")).isEqualTo(storage.presignGet("t/one"));
    }

    @Test
    void getByIdOfAnotherSpaceOrDeletedIsNotFound() throws Exception {
        UUID mine = album("Benim");
        String otherEmail = "other-" + UUID.randomUUID().toString().substring(0, 8) + "@x.io";
        TenantFixtures.spaceWithOwner(jdbc, "Other", TenantFixtures.GIB, otherEmail);

        assertThat(send(user(otherEmail), get("/api/albums/" + mine), null).getResponse().getStatus()).isEqualTo(404);
        assertThat(send(me, delete("/api/albums/" + mine), null).getResponse().getStatus()).isEqualTo(204);
        assertThat(send(me, get("/api/albums/" + mine), null).getResponse().getStatus()).isEqualTo(404);
        assertThat(send(me, get("/api/albums/" + UUID.randomUUID()), null).getResponse().getStatus()).isEqualTo(404);
    }

    int statementsOfList() throws Exception {
        return StatementCounter.record(() -> ok(get("/api/albums"), null)).size();
    }

    @Test
    void listUsesAFixedNumberOfQueries() throws Exception {
        UUID first = album("Bir");
        keys(media(first, MediaKind.IMAGE, "READY", at("2024-01-01T00:00:00Z"), null), "t/1", null, null);
        int one = statementsOfList();
        assertThat(one).isPositive();

        for (int i = 0; i < 4; i++) {
            UUID album = album("Daha " + i);
            keys(media(album, MediaKind.IMAGE, "READY", at("2024-01-01T00:00:00Z"), null), "t/x" + i, null, null);
        }
        assertThat(statementsOfList()).isEqualTo(one);
    }

    @Test
    void thePagesViewReadsThePageTableOnce() throws Exception {
        UUID album = album("Sayfalar");
        UUID photo = media(album, MediaKind.IMAGE, "READY", at("2024-01-01T00:00:00Z"), null);
        keys(photo, "t/p", null, null);
        ok(post("/api/albums/" + album + "/pages/initialize"), "{\"pages\":[{\"template\":\"AUTO\",\"mediaIds\":[\"" + photo + "\"]}]}");

        List<String> sql = StatementCounter.record(() -> ok(get("/api/albums/" + album + "/pages"), null));

        assertThat(sql.stream().filter(s -> s.toLowerCase().matches("(?s).*from page( |$).*"))).hasSize(1);
    }

    @Test
    void theTrashListUsesAFixedNumberOfQueries() throws Exception {
        assertThat(send(me, delete("/api/albums/" + album("Cop 1")), null).getResponse().getStatus()).isEqualTo(204);
        int one = StatementCounter.record(() -> ok(get("/api/trash"), null)).size();
        for (int i = 0; i < 3; i++) {
            assertThat(send(me, delete("/api/albums/" + album("Cop x" + i)), null).getResponse().getStatus()).isEqualTo(204);
        }
        assertThat(StatementCounter.record(() -> ok(get("/api/trash"), null))).hasSize(one);
    }

    @Test
    void emailLookupMatchesTheLowerEmailIndex() throws Exception {
        List<String> sql = StatementCounter.record(() -> users.findByEmailIgnoreCase("SUMMARY@X.IO"));
        assertThat(sql).anySatisfy(s -> assertThat(s.toLowerCase()).contains("lower(").doesNotContain("upper("));
        String email = jdbc.queryForObject("SELECT email FROM app_user WHERE id = ?", String.class, userId);
        assertThat(users.findByEmailIgnoreCase(email.toUpperCase())).map(AppUser::getId).contains(userId);
    }
}
