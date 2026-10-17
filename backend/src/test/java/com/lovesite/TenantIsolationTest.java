package com.lovesite;

import com.jayway.jsonpath.JsonPath;
import com.lovesite.storage.StorageService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
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

import java.util.List;
import java.util.UUID;
import java.util.function.BiFunction;
import java.util.stream.Stream;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;

/**
 * The IDOR matrix: a user of one space must not be able to see or change anything of another space by guessing or
 * knowing its ids. Every endpoint that takes an id is probed with the ids of a space the caller does not belong to and
 * has to answer exactly as it does for an id that does not exist at all (404, same body), without touching any data.
 */
@SpringBootTest
@AutoConfigureMockMvc
class TenantIsolationTest {

    @DynamicPropertySource
    static void properties(DynamicPropertyRegistry r) {
        TestInfrastructure.register(r);
    }

    @Autowired MockMvc mvc;
    @Autowired JdbcTemplate jdbc;
    @Autowired StorageService storage;

    static final RequestPostProcessor OWNER_A = user("a@test.io");

    String outsiderEmail;
    String adminEmail;
    RequestPostProcessor outsider;
    RequestPostProcessor admin;
    UUID spaceA;
    UUID spaceB;
    String albumA;
    String mediaA;

    @BeforeEach
    void setUp() throws Exception {
        String tag = UUID.randomUUID().toString().substring(0, 8);
        outsiderEmail = "outsider-" + tag + "@x.io";
        adminEmail = "admin-" + tag + "@x.io";
        spaceA = TenantFixtures.spaceOf(jdbc, "a@test.io");
        spaceB = TenantFixtures.spaceWithOwner(jdbc, "Other couple " + tag, 10 * TenantFixtures.GIB, outsiderEmail);
        TenantFixtures.user(jdbc, adminEmail, "Admin", true); // admin without a space
        outsider = user(outsiderEmail);
        admin = user(adminEmail);

        albumA = JsonPath.read(send(post("/api/albums"), OWNER_A, "{\"title\":\"Private A\"}").getResponse().getContentAsString(), "$.id");
        String res = send(post("/api/albums/" + albumA + "/uploads"), OWNER_A,
                "{\"files\":[{\"clientId\":\"c\",\"filename\":\"secret.jpg\",\"contentType\":\"image/jpeg\",\"sizeBytes\":10}]}")
                .getResponse().getContentAsString();
        mediaA = JsonPath.read(res, "$.items[0].mediaId");
        jdbc.update("UPDATE media SET status = 'READY', thumb_key = 'x/thumb.webp' WHERE id = ?::uuid", mediaA);
    }

    MvcResult send(MockHttpServletRequestBuilder request, RequestPostProcessor who, String body) throws Exception {
        return mvc.perform(request.with(who).with(csrf()).contentType(MediaType.APPLICATION_JSON).content(body)).andReturn();
    }

    // ---- the matrix

    record Probe(String name, BiFunction<String, String, MockHttpServletRequestBuilder> request) {
        @Override
        public String toString() {
            return name;
        }
    }

    static Stream<Probe> idEndpoints() {
        String upload = "{\"files\":[{\"clientId\":\"c\",\"filename\":\"a.jpg\",\"contentType\":\"image/jpeg\",\"sizeBytes\":10}]}";
        return Stream.of(
                new Probe("GET /api/albums/{id}/media", (album, media) -> get("/api/albums/" + album + "/media")),
                new Probe("POST /api/albums/{id}/uploads", (album, media) -> post("/api/albums/" + album + "/uploads").content(upload)),
                new Probe("PATCH /api/albums/{id}", (album, media) -> patch("/api/albums/" + album).content("{\"title\":\"hacked\"}")),
                new Probe("DELETE /api/albums/{id}", (album, media) -> delete("/api/albums/" + album)),
                new Probe("POST /api/media/{id}/complete", (album, media) -> post("/api/media/" + media + "/complete")),
                new Probe("POST /api/media/{id}/reprocess", (album, media) -> post("/api/media/" + media + "/reprocess")),
                new Probe("PATCH /api/media/{id}", (album, media) -> patch("/api/media/" + media).content("{\"caption\":\"hacked\"}")),
                new Probe("DELETE /api/media/{id}", (album, media) -> delete("/api/media/" + media)));
    }

    @ParameterizedTest(name = "{0}: other space gets 404, identical to a missing id")
    @MethodSource("idEndpoints")
    void anotherSpacesIdsBehaveLikeMissingOnes(Probe probe) throws Exception {
        MvcResult foreign = perform(probe, outsider, albumA, mediaA);
        MvcResult missing = perform(probe, outsider, UUID.randomUUID().toString(), UUID.randomUUID().toString());

        assertThat(foreign.getResponse().getStatus()).isEqualTo(404);
        assertThat(missing.getResponse().getStatus()).isEqualTo(404);
        // same problem document apart from the echoed request path
        assertThat(JsonPath.<String>read(foreign.getResponse().getContentAsString(), "$.detail"))
                .isEqualTo(JsonPath.<String>read(missing.getResponse().getContentAsString(), "$.detail"));
        assertThat(JsonPath.<String>read(foreign.getResponse().getContentAsString(), "$.title"))
                .isEqualTo(JsonPath.<String>read(missing.getResponse().getContentAsString(), "$.title"));

        // nothing changed
        assertThat(jdbc.queryForObject("SELECT title FROM album WHERE id = ?::uuid", String.class, albumA)).isEqualTo("Private A");
        assertThat(jdbc.queryForObject("SELECT deleted_at IS NULL FROM album WHERE id = ?::uuid", Boolean.class, albumA)).isTrue();
        assertThat(jdbc.queryForObject("SELECT deleted_at IS NULL FROM media WHERE id = ?::uuid", Boolean.class, mediaA)).isTrue();
        assertThat(jdbc.queryForObject("SELECT caption FROM media WHERE id = ?::uuid", String.class, mediaA)).isNull();
        assertThat(jdbc.queryForObject("SELECT status FROM media WHERE id = ?::uuid", String.class, mediaA)).isEqualTo("READY");
        assertThat(jdbc.queryForObject("SELECT count(*) FROM media WHERE album_id = ?::uuid", Integer.class, albumA)).isEqualTo(1);
    }

    @ParameterizedTest(name = "{0}: the owning space is not affected by the probe (control)")
    @MethodSource("idEndpoints")
    void theSameRequestWorksForTheOwningSpace(Probe probe) throws Exception {
        if (probe.name().startsWith("DELETE")) return; // would destroy the fixture; delete is covered by the matrix above
        assertThat(perform(probe, OWNER_A, albumA, mediaA).getResponse().getStatus()).isIn(200, 201);
    }

    MvcResult perform(Probe probe, RequestPostProcessor who, String album, String media) throws Exception {
        MockHttpServletRequestBuilder request = probe.request().apply(album, media);
        return mvc.perform(request.with(who).with(csrf()).contentType(MediaType.APPLICATION_JSON)).andReturn();
    }

    // ---- collections and lookups by id lists

    @Test
    void listsOnlyContainTheCallersOwnSpace() throws Exception {
        String mine = mvc.perform(get("/api/albums").with(OWNER_A)).andReturn().getResponse().getContentAsString();
        assertThat(mine).contains(albumA);
        String theirs = mvc.perform(get("/api/albums").with(outsider)).andReturn().getResponse().getContentAsString();
        assertThat(theirs).isEqualTo("[]");
        assertThat(theirs).doesNotContain(albumA).doesNotContain("Private A");
    }

    @Test
    void statusLookupByIdsIgnoresAnotherSpacesMedia() throws Exception {
        String foreign = mvc.perform(get("/api/media").param("ids", mediaA).with(outsider)).andReturn().getResponse().getContentAsString();
        assertThat(foreign).isEqualTo("[]");
        String own = mvc.perform(get("/api/media").param("ids", mediaA).with(OWNER_A)).andReturn().getResponse().getContentAsString();
        assertThat(JsonPath.<String>read(own, "$[0].id")).isEqualTo(mediaA);
    }

    @Test
    void anotherSpacesMediaIsNeverOfferedInTheOutsidersAlbum() throws Exception {
        // the outsider's own album is empty even though the media table holds A's item
        String albumB = JsonPath.read(send(post("/api/albums"), outsider, "{\"title\":\"B\"}").getResponse().getContentAsString(), "$.id");
        assertThat(mvc.perform(get("/api/albums/" + albumB + "/media").with(outsider)).andReturn().getResponse().getContentAsString())
                .isEqualTo("[]");
        // and a media id of A cannot be attached/uploaded into B's album: uploads create rows in the caller's space only
        String res = send(post("/api/albums/" + albumB + "/uploads"), outsider,
                "{\"files\":[{\"clientId\":\"c\",\"filename\":\"x.jpg\",\"contentType\":\"image/jpeg\",\"sizeBytes\":10}]}").getResponse().getContentAsString();
        String newId = JsonPath.read(res, "$.items[0].mediaId");
        assertThat(jdbc.queryForObject("SELECT space_id FROM media WHERE id = ?::uuid", UUID.class, newId)).isEqualTo(spaceB);
        assertThat(jdbc.queryForObject("SELECT original_key FROM media WHERE id = ?::uuid", String.class, newId))
                .startsWith("spaces/" + spaceB + "/albums/" + albumB + "/");
    }

    @Test
    void musicIsPerSpaceAndTheLegacyFileOnlyBelongsToTheInitialSpace() throws Exception {
        String legacy = "audio/theme";
        String keyA = "spaces/" + spaceA + "/audio/theme";
        String keyB = "spaces/" + spaceB + "/audio/theme";
        try {
            storage.putObject(legacy, "audio/mpeg", "legacy".getBytes());
            // the initial space (a/b) still plays the old global file, a newer space does not
            mvc.perform(get("/api/settings/music").with(OWNER_A)).andExpect(r -> assertThat(r.getResponse().getStatus()).isEqualTo(200));
            mvc.perform(get("/api/settings/music").with(outsider)).andExpect(r -> assertThat(r.getResponse().getStatus()).isEqualTo(204));

            storage.putObject(keyB, "audio/mpeg", "theirs".getBytes());
            String theirs = mvc.perform(get("/api/settings/music").with(outsider)).andReturn().getResponse().getContentAsString();
            assertThat(theirs).contains(keyB);
            // A prefers its own file once it exists, and never sees B's
            storage.putObject(keyA, "audio/mpeg", "mine".getBytes());
            String mine = mvc.perform(get("/api/settings/music").with(OWNER_A)).andReturn().getResponse().getContentAsString();
            assertThat(mine).contains(keyA).doesNotContain(spaceB.toString());
        } finally {
            storage.delete(legacy);
            storage.delete(keyA);
            storage.delete(keyB);
        }
    }

    // ---- who may call what

    @Test
    void aUserWithoutASpaceHasNoContentAndAnAdminIsNoExceptionToThat() throws Exception {
        for (String url : List.of("/api/albums", "/api/albums/" + albumA + "/media", "/api/space", "/api/settings/music")) {
            assertThat(mvc.perform(get(url).with(admin)).andReturn().getResponse().getStatus()).as(url).isEqualTo(403);
        }
        assertThat(send(post("/api/albums"), admin, "{\"title\":\"x\"}").getResponse().getStatus()).isEqualTo(403);
    }

    @Test
    void anAdminWhoIsAlsoAMemberOfAnotherSpaceCannotReachForeignContent() throws Exception {
        String email = "admin-member-" + UUID.randomUUID().toString().substring(0, 8) + "@x.io";
        UUID adminUser = TenantFixtures.user(jdbc, email, "Admin Member", true);
        TenantFixtures.member(jdbc, spaceB, adminUser, "MEMBER");
        RequestPostProcessor who = user(email);
        assertThat(mvc.perform(get("/api/albums/" + albumA + "/media").with(who)).andReturn().getResponse().getStatus()).isEqualTo(404);
        assertThat(mvc.perform(get("/api/media").param("ids", mediaA).with(who)).andReturn().getResponse().getContentAsString()).isEqualTo("[]");
    }

    @Test
    void adminEndpointsAreForAdminsOnlyAndShowNoContent() throws Exception {
        String space = spaceB.toString();
        for (MockHttpServletRequestBuilder request : List.of(
                get("/api/admin/spaces"),
                post("/api/admin/spaces").content("{\"name\":\"x\",\"limitGb\":1}"),
                patch("/api/admin/spaces/" + space).content("{\"name\":\"x\"}"),
                post("/api/admin/spaces/" + space + "/invites"))) {
            assertThat(mvc.perform(request.with(OWNER_A).with(csrf()).contentType(MediaType.APPLICATION_JSON)).andReturn().getResponse().getStatus())
                    .as("owner of a space is not an admin").isEqualTo(403);
        }
        String body = mvc.perform(get("/api/admin/spaces").with(admin)).andExpect(r -> assertThat(r.getResponse().getStatus()).isEqualTo(200))
                .andReturn().getResponse().getContentAsString();
        assertThat(body).contains("Other couple");
        assertThat(body).doesNotContain("Private A").doesNotContain("secret.jpg").doesNotContain(albumA).doesNotContain(mediaA)
                .doesNotContain("originalFilename").doesNotContain("Url");
    }

    @Test
    void unauthenticatedCallsAreRejected() throws Exception {
        for (String url : List.of("/api/space", "/api/admin/spaces", "/api/albums", "/api/settings/music")) {
            assertThat(mvc.perform(get(url)).andReturn().getResponse().getStatus()).as(url).isEqualTo(401);
        }
    }

    @Test
    void spaceInfoDescribesOnlyTheCallersSpace() throws Exception {
        String body = mvc.perform(get("/api/space").with(outsider)).andReturn().getResponse().getContentAsString();
        assertThat(JsonPath.<String>read(body, "$.id")).isEqualTo(spaceB.toString());
        assertThat(JsonPath.<String>read(body, "$.role")).isEqualTo("OWNER");
        assertThat(JsonPath.<Integer>read(body, "$.members.length()")).isEqualTo(1);
        assertThat(JsonPath.<Number>read(body, "$.usedBytes").longValue()).isZero();
        assertThat(body).doesNotContain(spaceA.toString());
    }
}
