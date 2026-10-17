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

import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;

/** Per-page themes: null follows the album, the single-page PATCH and the bulk endpoint (one transaction, IDOR, versions). */
@SpringBootTest
@AutoConfigureMockMvc
class PageThemeTest {

    @DynamicPropertySource
    static void properties(DynamicPropertyRegistry r) {
        TestInfrastructure.register(r);
    }

    @Autowired MockMvc mvc;
    @Autowired JdbcTemplate jdbc;
    @Autowired MediaRepository mediaRepository;

    RequestPostProcessor me;
    RequestPostProcessor outsider;
    UUID space;
    UUID userId;
    String album;
    List<String> pageIds;

    @BeforeEach
    void setUp() throws Exception {
        String tag = UUID.randomUUID().toString().substring(0, 8);
        String email = "pt-" + tag + "@x.io";
        String otherEmail = "pt-out-" + tag + "@x.io";
        space = TenantFixtures.spaceWithOwner(jdbc, "PT", TenantFixtures.GIB, email);
        TenantFixtures.spaceWithOwner(jdbc, "PT other", TenantFixtures.GIB, otherEmail);
        userId = jdbc.queryForObject("SELECT id FROM app_user WHERE email = ?", UUID.class, email);
        me = user(email);
        outsider = user(otherEmail);
        album = JsonPath.read(ok(post("/api/albums"), me, "{\"title\":\"T\",\"themeId\":\"romantik\"}"), "$.id");
        StringBuilder pages = new StringBuilder();
        for (int p = 0; p < 4; p++) {
            pages.append(p > 0 ? "," : "").append("{\"template\":\"AUTO\",\"mediaIds\":[\"").append(media()).append("\"]}");
        }
        ok(post("/api/albums/" + album + "/pages/initialize"), me, "{\"pages\":[" + pages + "]}");
        pageIds = JsonPath.read(view(), "$.pages[*].id");
    }

    UUID media() {
        Media m = new Media(UUID.randomUUID(), space, UUID.fromString(album), userId, MediaKind.IMAGE, "t.jpg", "image/jpeg", 10, null, null);
        m.markUploaded(10);
        mediaRepository.saveAndFlush(m);
        return m.getId();
    }

    MvcResult send(MockHttpServletRequestBuilder request, RequestPostProcessor who, String body) throws Exception {
        MockHttpServletRequestBuilder r = request.with(who).with(csrf()).contentType(MediaType.APPLICATION_JSON);
        if (body != null) r.content(body);
        return mvc.perform(r).andReturn();
    }

    String ok(MockHttpServletRequestBuilder request, RequestPostProcessor who, String body) throws Exception {
        MvcResult res = send(request, who, body);
        assertThat(res.getResponse().getStatus()).as(res.getResponse().getContentAsString()).isBetween(200, 201);
        return res.getResponse().getContentAsString();
    }

    String view() throws Exception {
        return ok(get("/api/albums/" + album + "/pages"), me, null);
    }

    List<Object> themes() throws Exception {
        return JsonPath.read(view(), "$.pages[*].themeId");
    }

    int version(int page) throws Exception {
        return JsonPath.read(view(), "$.pages[" + page + "].version");
    }

    @Test
    void nullFollowsTheAlbumThemeAndOverridesStay() throws Exception {
        assertThat(themes()).containsOnlyNulls();
        ok(patch("/api/pages/" + pageIds.get(1)), me, "{\"version\":" + version(1) + ",\"themeId\":\"buyulu\"}");
        assertThat(themes()).containsExactly(null, "buyulu", null, null);

        // album theme changes: null pages simply follow it (they store nothing), the override is untouched
        ok(patch("/api/albums/" + album), me, "{\"themeId\":\"yilbasi\"}");
        assertThat(themes()).containsExactly(null, "buyulu", null, null);
        assertThat(jdbc.queryForObject("SELECT theme_id FROM album WHERE id = ?", String.class, UUID.fromString(album))).isEqualTo("yilbasi");

        // explicit null goes back to the album theme; a PATCH without themeId leaves it alone
        ok(patch("/api/pages/" + pageIds.get(1)), me, "{\"version\":" + version(1) + ",\"swatch\":\"dark\"}");
        assertThat(themes()).containsExactly(null, "buyulu", null, null);
        ok(patch("/api/pages/" + pageIds.get(1)), me, "{\"version\":" + version(1) + ",\"themeId\":null}");
        assertThat(themes()).containsOnlyNulls();
        // the semantic slot survives the theme change
        assertThat((String) JsonPath.read(view(), "$.pages[1].swatch")).isEqualTo("dark");
    }

    @Test
    void unknownThemeIsRejected() throws Exception {
        assertThat(send(patch("/api/pages/" + pageIds.get(0)), me, "{\"version\":" + version(0) + ",\"themeId\":\"nope\"}").getResponse().getStatus()).isEqualTo(400);
        assertThat(send(post("/api/albums/" + album + "/pages/theme"), me, "{\"pageIds\":[\"" + pageIds.get(0) + "\"],\"themeId\":\"nope\"}").getResponse().getStatus()).isEqualTo(400);
        assertThat(themes()).containsOnlyNulls();
    }

    @Test
    void bulkAppliesInOneGoAndNullResets() throws Exception {
        String body = "{\"pages\":[{\"id\":\"" + pageIds.get(2) + "\",\"version\":" + version(2) + "},{\"id\":\"" + pageIds.get(3) + "\",\"version\":" + version(3) + "}],\"themeId\":\"seyahat\"}";
        ok(post("/api/albums/" + album + "/pages/theme"), me, body);
        assertThat(themes()).containsExactly(null, null, "seyahat", "seyahat");
        ok(post("/api/albums/" + album + "/pages/theme"), me, "{\"pageIds\":[\"" + pageIds.get(2) + "\",\"" + pageIds.get(3) + "\"],\"themeId\":null}");
        assertThat(themes()).containsOnlyNulls();
    }

    @Test
    void foreignPageInTheListIs404AndNothingChanges() throws Exception {
        // a page of another space's album
        String otherAlbum = JsonPath.read(ok(post("/api/albums"), outsider, "{\"title\":\"O\"}"), "$.id");
        UUID otherSpace = jdbc.queryForObject("SELECT space_id FROM album WHERE id = ?", UUID.class, UUID.fromString(otherAlbum));
        UUID foreignPage = jdbc.queryForObject("INSERT INTO page (album_id, space_id, page_index, template) VALUES (?, ?, 0, 'AUTO') RETURNING id",
                UUID.class, UUID.fromString(otherAlbum), otherSpace);
        List<String> ids = new ArrayList<>(pageIds);
        ids.add(foreignPage.toString());
        String list = String.join("\",\"", ids);
        MvcResult res = send(post("/api/albums/" + album + "/pages/theme"), me, "{\"pageIds\":[\"" + list + "\"],\"themeId\":\"buyulu\"}");
        assertThat(res.getResponse().getStatus()).isEqualTo(404);
        assertThat(themes()).containsOnlyNulls();
        assertThat(jdbc.queryForObject("SELECT theme_id FROM page WHERE id = ?", String.class, foreignPage)).isNull();

        // the other space cannot touch our album either (same 404 as an unknown album)
        assertThat(send(post("/api/albums/" + album + "/pages/theme"), outsider, "{\"pageIds\":[\"" + pageIds.get(0) + "\"],\"themeId\":\"buyulu\"}")
                .getResponse().getStatus()).isEqualTo(404);
        assertThat(send(patch("/api/pages/" + pageIds.get(0)), outsider, "{\"version\":0,\"themeId\":\"buyulu\"}").getResponse().getStatus()).isEqualTo(404);
        assertThat(themes()).containsOnlyNulls();
    }

    @Test
    void staleVersionIs409AndNothingChanges() throws Exception {
        int v0 = version(0);
        String body = "{\"pages\":[{\"id\":\"" + pageIds.get(0) + "\",\"version\":" + v0 + "},{\"id\":\"" + pageIds.get(1) + "\",\"version\":" + (version(1) + 5) + "}],\"themeId\":\"buyulu\"}";
        MvcResult res = send(post("/api/albums/" + album + "/pages/theme"), me, body);
        assertThat(res.getResponse().getStatus()).isEqualTo(409);
        assertThat((List<Object>) JsonPath.read(res.getResponse().getContentAsString(), "$.current.pages")).hasSize(4);
        assertThat(themes()).containsOnlyNulls();
        assertThat(version(0)).isEqualTo(v0);
    }
}
