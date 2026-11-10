package com.lovesite;

import com.jayway.jsonpath.JsonPath;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.RequestPostProcessor;

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;

/** The trash: what was deleted in the last 30 days, and putting it back. */
@SpringBootTest
@AutoConfigureMockMvc
class TrashTest {

    @DynamicPropertySource
    static void properties(DynamicPropertyRegistry r) {
        TestInfrastructure.register(r);
    }

    @Autowired MockMvc mvc;
    @Autowired JdbcTemplate jdbc;

    String email;
    RequestPostProcessor me;
    UUID space;
    UUID owner;

    @BeforeEach
    void setUp() {
        email = "trash-" + UUID.randomUUID().toString().substring(0, 8) + "@x.io";
        space = TenantFixtures.spaceWithOwner(jdbc, "Trash", TenantFixtures.GIB, email);
        owner = jdbc.queryForObject("SELECT id FROM app_user WHERE email = ?", UUID.class, email);
        me = user(email);
    }

    UUID album(String title) {
        return jdbc.queryForObject("INSERT INTO album (title, created_by, space_id) VALUES (?, ?, ?) RETURNING id", UUID.class, title, owner, space);
    }

    UUID photo(UUID album, String sha) {
        return jdbc.queryForObject("INSERT INTO media (album_id, uploaded_by, type, status, original_key, original_filename, content_type, size_bytes, "
                        + "space_id, thumb_key, display_key, sha256) VALUES (?, ?, 'IMAGE', 'READY', 'k', 'f.jpg', 'image/jpeg', 1, ?, 't/thumb.webp', "
                        + "'t/display.webp', ?) RETURNING id", UUID.class, album, owner, space, sha);
    }

    String trash(RequestPostProcessor who) throws Exception {
        return mvc.perform(get("/api/trash").with(who)).andReturn().getResponse().getContentAsString();
    }

    int status(org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder r, RequestPostProcessor who) throws Exception {
        return mvc.perform(r.with(who).with(csrf())).andReturn().getResponse().getStatus();
    }

    @Test
    void aDeletedPhotoWaitsInTheTrashAndComesBack() throws Exception {
        UUID album = album("Yaz");
        UUID photo = photo(album, "a".repeat(64));
        assertThat(status(delete("/api/media/" + photo), me)).isEqualTo(204);

        String t = trash(me);
        assertThat(JsonPath.<List<String>>read(t, "$.media[*].media.id")).containsExactly(photo.toString());
        assertThat(JsonPath.<String>read(t, "$.media[0].albumTitle")).isEqualTo("Yaz");
        Instant purgeAt = Instant.parse(JsonPath.read(t, "$.media[0].purgeAt"));
        assertThat(purgeAt).isBetween(Instant.now().plus(29, ChronoUnit.DAYS), Instant.now().plus(31, ChronoUnit.DAYS));
        assertThat(JsonPath.<Number>read(t, "$.retentionDays").intValue()).isEqualTo(30);

        assertThat(status(post("/api/trash/media/" + photo + "/restore"), me)).isEqualTo(204);
        assertThat(JsonPath.<List<String>>read(trash(me), "$.media[*].media.id")).isEmpty();
        String listed = mvc.perform(get("/api/albums/" + album + "/media").with(me)).andReturn().getResponse().getContentAsString();
        assertThat(JsonPath.<List<String>>read(listed, "$[*].id")).contains(photo.toString());
    }

    @Test
    void aDeletedAlbumComesBackWithItsPhotos() throws Exception {
        UUID album = album("Kış");
        UUID photo = photo(album, "b".repeat(64));
        assertThat(status(delete("/api/albums/" + album), me)).isEqualTo(204);

        String t = trash(me);
        assertThat(JsonPath.<List<String>>read(t, "$.albums[*].album.id")).containsExactly(album.toString());
        assertThat(JsonPath.<Number>read(t, "$.albums[0].mediaCount").intValue()).isEqualTo(1);
        // its photos are not listed one by one: they come back with the album
        assertThat(JsonPath.<List<String>>read(t, "$.media[*].media.id")).isEmpty();

        assertThat(status(post("/api/trash/albums/" + album + "/restore"), me)).isEqualTo(204);
        String albums = mvc.perform(get("/api/albums").with(me)).andReturn().getResponse().getContentAsString();
        assertThat(JsonPath.<List<String>>read(albums, "$[*].id")).contains(album.toString());
        String listed = mvc.perform(get("/api/albums/" + album + "/media").with(me)).andReturn().getResponse().getContentAsString();
        assertThat(JsonPath.<List<String>>read(listed, "$[*].id")).contains(photo.toString());
    }

    @Test
    void aPhotoOfADeletedAlbumNeedsTheAlbumBackFirst() throws Exception {
        UUID album = album("Bahar");
        UUID photo = photo(album, "c".repeat(64));
        status(delete("/api/media/" + photo), me);
        status(delete("/api/albums/" + album), me);
        var res = mvc.perform(post("/api/trash/media/" + photo + "/restore").with(me).with(csrf())).andReturn().getResponse();
        assertThat(res.getStatus()).isEqualTo(409);
        assertThat(res.getContentAsString()).contains("Önce albümü");
    }

    @Test
    void aPhotoThatWasUploadedAgainCannotComeBackTwice() throws Exception {
        UUID album = album("Güz");
        UUID photo = photo(album, "d".repeat(64));
        status(delete("/api/media/" + photo), me);
        photo(album, "d".repeat(64)); // the same file again
        var res = mvc.perform(post("/api/trash/media/" + photo + "/restore").with(me).with(csrf())).andReturn().getResponse();
        assertThat(res.getStatus()).isEqualTo(409);
        assertThat(res.getContentAsString()).contains("zaten var");
    }

    @Test
    void anotherSpaceSeesNothingAndRestoresNothing() throws Exception {
        UUID album = album("Gizli");
        UUID photo = photo(album, "e".repeat(64));
        status(delete("/api/media/" + photo), me);
        status(delete("/api/albums/" + album), me);

        String strangerEmail = "stranger-" + UUID.randomUUID().toString().substring(0, 8) + "@x.io";
        TenantFixtures.spaceWithOwner(jdbc, "Other", TenantFixtures.GIB, strangerEmail);
        RequestPostProcessor stranger = user(strangerEmail);
        String t = trash(stranger);
        assertThat(JsonPath.<List<String>>read(t, "$.media[*].media.id")).isEmpty();
        assertThat(JsonPath.<List<String>>read(t, "$.albums[*].album.id")).isEmpty();
        assertThat(status(post("/api/trash/media/" + photo + "/restore"), stranger)).isEqualTo(404);
        assertThat(status(post("/api/trash/albums/" + album + "/restore"), stranger)).isEqualTo(404);
        // and a live (not deleted) item is not "restorable" either
        UUID live = album("Canlı");
        assertThat(status(post("/api/trash/albums/" + live + "/restore"), me)).isEqualTo(404);
    }
}
