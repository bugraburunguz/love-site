package com.lovesite;

import com.jayway.jsonpath.JsonPath;
import com.lovesite.media.Media;
import com.lovesite.media.MediaKind;
import com.lovesite.media.MediaRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.MethodSource;
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

import java.util.UUID;
import java.util.stream.Stream;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;

/** IDOR matrix of the page endpoints: another space's ids behave like missing ids and change nothing. */
@SpringBootTest
@AutoConfigureMockMvc
class PageIdorTest {

    @DynamicPropertySource
    static void properties(DynamicPropertyRegistry r) {
        TestInfrastructure.register(r);
    }

    @Autowired MockMvc mvc;
    @Autowired JdbcTemplate jdbc;
    @Autowired MediaRepository mediaRepository;

    RequestPostProcessor owner;
    RequestPostProcessor outsider;
    String album;
    String page;
    String item;
    String media;

    interface Request {
        MockHttpServletRequestBuilder build(String album, String page, String item, String media);
    }

    record Probe(String name, Request request, String body) {
        @Override
        public String toString() {
            return name;
        }
    }

    static Stream<Probe> probes() {
        return Stream.of(
                new Probe("GET /api/albums/{id}/pages", (a, p, i, m) -> get("/api/albums/" + a + "/pages"), null),
                new Probe("POST /api/albums/{id}/pages/initialize", (a, p, i, m) -> post("/api/albums/" + a + "/pages/initialize"), "{\"pages\":[]}"),
                new Probe("POST /api/albums/{id}/pages", (a, p, i, m) -> post("/api/albums/" + a + "/pages"), "{\"afterPageIndex\":-1,\"template\":\"AUTO\"}"),
                new Probe("POST /api/albums/{id}/pages/reorder", (a, p, i, m) -> post("/api/albums/" + a + "/pages/reorder"), "{\"pageIds\":[]}"),
                new Probe("PATCH /api/pages/{id}", (a, p, i, m) -> patch("/api/pages/" + p), "{\"template\":\"FEATURED\",\"version\":0}"),
                new Probe("DELETE /api/pages/{id}", (a, p, i, m) -> delete("/api/pages/" + p), null),
                new Probe("PATCH /api/page-items/{id}", (a, p, i, m) -> patch("/api/page-items/" + i), "{\"x\":1,\"version\":0}"),
                new Probe("POST /api/page-items/{id}/move", (a, p, i, m) -> post("/api/page-items/" + i + "/move"), null),
                new Probe("POST /api/page-items", (a, p, i, m) -> post("/api/page-items"), null),
                new Probe("DELETE /api/page-items/{id}", (a, p, i, m) -> delete("/api/page-items/" + i), null),
                new Probe("POST /api/media/{id}/feature", (a, p, i, m) -> post("/api/media/" + m + "/feature"), null));
    }

    @BeforeEach
    void setUp() throws Exception {
        String tag = UUID.randomUUID().toString().substring(0, 8);
        String ownerEmail = "pown-" + tag + "@x.io";
        String outsiderEmail = "pout-" + tag + "@x.io";
        UUID space = TenantFixtures.spaceWithOwner(jdbc, "Owner " + tag, TenantFixtures.GIB, ownerEmail);
        TenantFixtures.spaceWithOwner(jdbc, "Outsider " + tag, TenantFixtures.GIB, outsiderEmail);
        UUID userId = jdbc.queryForObject("SELECT id FROM app_user WHERE email = ?", UUID.class, ownerEmail);
        owner = user(ownerEmail);
        outsider = user(outsiderEmail);

        album = JsonPath.read(send(post("/api/albums"), owner, "{\"title\":\"Secret\"}").getResponse().getContentAsString(), "$.id");
        Media m = new Media(UUID.randomUUID(), space, UUID.fromString(album), userId, MediaKind.IMAGE, "s.jpg", "image/jpeg", 10, null, null);
        m.markUploaded(10);
        mediaRepository.saveAndFlush(m);
        media = m.getId().toString();
        send(post("/api/albums/" + album + "/pages/initialize"), owner, "{\"pages\":[{\"template\":\"AUTO\",\"mediaIds\":[\"" + media + "\"]}]}");
        String pages = mvc.perform(get("/api/albums/" + album + "/pages").with(owner)).andReturn().getResponse().getContentAsString();
        page = JsonPath.read(pages, "$.pages[0].id");
        item = JsonPath.read(pages, "$.pages[0].items[0].id");
    }

    MvcResult send(MockHttpServletRequestBuilder request, RequestPostProcessor who, String body) throws Exception {
        MockHttpServletRequestBuilder r = request.with(who).with(csrf()).contentType(MediaType.APPLICATION_JSON);
        if (body != null) r.content(body);
        return mvc.perform(r).andReturn();
    }

    String snapshot() throws Exception {
        return mvc.perform(get("/api/albums/" + album + "/pages").with(owner)).andReturn().getResponse().getContentAsString();
    }

    /** body with the ids of the probed record filled in */
    String bodyFor(Probe probe, String a, String p, String i, String m) {
        String name = probe.name();
        if (name.startsWith("POST /api/page-items/{id}/move")) return "{\"targetPageId\":\"" + p + "\"}";
        if (name.equals("POST /api/page-items")) return "{\"pageId\":\"" + p + "\",\"mediaId\":\"" + m + "\"}";
        return probe.body();
    }

    @ParameterizedTest(name = "{0}: foreign ids -> 404 like missing ids, nothing changes")
    @MethodSource("probes")
    void anotherSpacesPagesAreInvisible(Probe probe) throws Exception {
        String before = snapshot();
        MvcResult foreign = send(probe.request().build(album, page, item, media), outsider, bodyFor(probe, album, page, item, media));
        UUID x = UUID.randomUUID(), y = UUID.randomUUID(), z = UUID.randomUUID(), w = UUID.randomUUID();
        MvcResult missing = send(probe.request().build(x.toString(), y.toString(), z.toString(), w.toString()), outsider,
                bodyFor(probe, x.toString(), y.toString(), z.toString(), w.toString()));

        assertThat(foreign.getResponse().getStatus()).isEqualTo(404);
        assertThat(missing.getResponse().getStatus()).isEqualTo(404);
        assertThat(JsonPath.<String>read(foreign.getResponse().getContentAsString(), "$.title"))
                .isEqualTo(JsonPath.<String>read(missing.getResponse().getContentAsString(), "$.title"));
        assertThat(snapshot()).isEqualTo(before);
    }

    @ParameterizedTest(name = "{0}: unauthenticated -> 401")
    @MethodSource("probes")
    void unauthenticatedCallsAreRejected(Probe probe) throws Exception {
        MockHttpServletRequestBuilder request = probe.request().build(album, page, item, media).with(csrf()).contentType(MediaType.APPLICATION_JSON);
        if (probe.body() != null) request.content(probe.body());
        assertThat(mvc.perform(request).andReturn().getResponse().getStatus()).isEqualTo(401);
    }
}
