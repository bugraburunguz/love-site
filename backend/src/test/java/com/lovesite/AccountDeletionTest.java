package com.lovesite;

import com.jayway.jsonpath.JsonPath;
import com.lovesite.account.AccountService;
import com.lovesite.role.Roles;
import com.lovesite.space.SpaceProperties;
import com.lovesite.user.AppUserRepository;
import com.lovesite.user.SeedProperties;
import com.lovesite.user.UserSeeder;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import software.amazon.awssdk.core.sync.RequestBody;
import software.amazon.awssdk.services.s3.model.PutObjectRequest;

import java.sql.Timestamp;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;

/** "Delete my account": the last member takes the space with them, a member with a partner only leaves. */
@SpringBootTest
@AutoConfigureMockMvc
class AccountDeletionTest {

    static final String PASSWORD = "Hesap-Silme-Sifresi-2026";
    static final String APP = "love-site-app";

    @DynamicPropertySource
    static void properties(DynamicPropertyRegistry r) {
        TestInfrastructure.register(r);
    }

    @Autowired MockMvc mvc;
    @Autowired JdbcTemplate jdbc;
    @Autowired PasswordEncoder encoder;
    @Autowired AppUserRepository users;
    @Autowired SpaceProperties spaceProperties;
    @Autowired Roles roles;

    String tag;

    @BeforeEach
    void setUp() {
        tag = UUID.randomUUID().toString().substring(0, 8);
    }

    // ---- helpers

    UUID userWithPassword(String email, String name) {
        UUID id = TenantFixtures.user(jdbc, email, name, false);
        jdbc.update("UPDATE app_user SET password_hash = ? WHERE id = ?", encoder.encode(PASSWORD), id);
        return id;
    }

    static void put(String key) {
        TestInfrastructure.ADMIN.putObject(PutObjectRequest.builder().bucket(TestInfrastructure.BUCKET).key(key).build(), RequestBody.fromBytes(new byte[] {1, 2, 3}));
    }

    static List<String> keys(String prefix) {
        return TestInfrastructure.ADMIN.listObjectsV2(b -> b.bucket(TestInfrastructure.BUCKET).prefix(prefix)).contents().stream()
                .map(o -> o.key()).toList();
    }

    UUID album(UUID space, UUID by) {
        UUID id = UUID.randomUUID();
        jdbc.update("INSERT INTO album (id, title, created_by, space_id) VALUES (?, 'Albüm', ?, ?)", id, by, space);
        return id;
    }

    /** a READY media row with its original and a thumbnail in the bucket; returns the original's key */
    String media(UUID space, UUID album, UUID by, boolean trashed) {
        UUID id = UUID.randomUUID();
        String original = "spaces/" + space + "/albums/" + album + "/media/" + id + "/original";
        String thumb = "spaces/" + space + "/albums/" + album + "/media/" + id + "/v1/thumb.webp";
        put(original);
        put(thumb);
        jdbc.update("INSERT INTO media (id, album_id, space_id, uploaded_by, type, status, original_key, thumb_key, original_filename, content_type, size_bytes, deleted_at) "
                + "VALUES (?, ?, ?, ?, 'IMAGE', 'READY', ?, ?, 'f.jpg', 'image/jpeg', 3, ?)", id, album, space, by, original, thumb,
                trashed ? Timestamp.from(Instant.now().minus(2, ChronoUnit.DAYS)) : null);
        return original;
    }

    int count(String sql, Object... args) {
        return jdbc.queryForObject(sql, Integer.class, args);
    }

    MockHttpServletRequestBuilder deleteRequest(String password) {
        return post("/api/account/delete").contentType(MediaType.APPLICATION_JSON).content("{\"password\":\"" + password + "\"}");
    }

    // ---- the last member

    @Test
    void theLastMemberTakesTheWholeSpaceWithThem() throws Exception {
        String email = "solo-" + tag + "@x.io";
        UUID space = TenantFixtures.space(jdbc, "Solo " + tag, TenantFixtures.GIB);
        UUID me = userWithPassword(email, "Solo");
        TenantFixtures.member(jdbc, space, me, "OWNER");
        UUID album = album(space, me);
        media(space, album, me, false);
        media(space, album, me, true); // in the trash: goes as well
        String song = "spaces/" + space + "/albums/" + album + "/music/" + UUID.randomUUID();
        put(song);
        jdbc.update("UPDATE album SET music_key = ?, music_content_type = 'audio/mpeg', music_size_bytes = 3 WHERE id = ?", song, album);
        jdbc.update("INSERT INTO page (album_id, space_id, page_index, template) VALUES (?, ?, 0, 'AUTO')", album, space);
        UUID export = UUID.randomUUID();
        put("spaces/" + space + "/exports/" + export + "/polaroid.png");
        jdbc.update("INSERT INTO export_job (id, space_id, requested_by, album_id, type, params, payload, fingerprint, status, expires_at) "
                + "VALUES (?, ?, ?, ?, 'POLAROID', '{}', '{}', 'f', 'READY', now() + interval '1 day')", export, space, me, album);
        jdbc.update("INSERT INTO special_day (space_id, title, day, icon, yearly, created_by) VALUES (?, 'Tanıştık', '2020-02-14', 'heart', true, ?)", space, me);
        jdbc.update("INSERT INTO day_note (space_id, author_id, day, body) VALUES (?, ?, '2026-10-01', 'güzel bir gün')", space, me);
        jdbc.update("INSERT INTO invitation (token_hash, space_id, role, created_by, expires_at) VALUES (?, ?, 'MEMBER', ?, now() + interval '7 days')",
                "h" + tag, space, me);
        put("spaces/" + space + "/stray-object");
        // another couple must not lose anything
        UUID otherSpace = TenantFixtures.spaceWithOwner(jdbc, "Diğer " + tag, TenantFixtures.GIB, "other-" + tag + "@x.io");
        UUID otherOwner = jdbc.queryForObject("SELECT user_id FROM space_member WHERE space_id = ?", UUID.class, otherSpace);
        String otherMedia = media(otherSpace, album(otherSpace, otherOwner), otherOwner, false);

        assertThat(mvc.perform(deleteRequest(PASSWORD).with(user(email)).with(csrf())).andReturn().getResponse().getStatus()).isEqualTo(204);

        assertThat(keys("spaces/" + space + "/")).as("every object of the space").isEmpty();
        assertThat(count("SELECT count(*) FROM app_user WHERE id = ?", me)).isZero();
        assertThat(count("SELECT count(*) FROM space WHERE id = ?", space)).isZero();
        for (String table : List.of("album", "media", "page", "export_job", "special_day", "day_note", "invitation", "space_member")) {
            assertThat(count("SELECT count(*) FROM " + table + " WHERE space_id = ?", space)).as(table).isZero();
        }
        assertThat(count("SELECT count(*) FROM deleted_account WHERE email_sha256 = ?", AccountService.emailHash(email))).isEqualTo(1);
        assertThat(keys(otherMedia)).containsExactly(otherMedia);
        assertThat(count("SELECT count(*) FROM media WHERE space_id = ?", otherSpace)).isEqualTo(1);
    }

    @Test
    void aWrongPasswordChangesNothing() throws Exception {
        String email = "wrong-" + tag + "@x.io";
        UUID space = TenantFixtures.space(jdbc, "Wrong " + tag, TenantFixtures.GIB);
        UUID me = userWithPassword(email, "Wrong");
        TenantFixtures.member(jdbc, space, me, "OWNER");
        String original = media(space, album(space, me), me, false);

        MvcResult wrong = mvc.perform(deleteRequest("yanlis").with(user(email)).with(csrf())).andReturn();
        assertThat(wrong.getResponse().getStatus()).isEqualTo(403);
        assertThat(wrong.getResponse().getContentAsString()).contains("Şifre hatalı").doesNotContain("yanlis");
        assertThat(mvc.perform(deleteRequest("").with(user(email)).with(csrf())).andReturn().getResponse().getStatus()).isEqualTo(403);
        assertThat(count("SELECT count(*) FROM app_user WHERE id = ?", me)).isEqualTo(1);
        assertThat(keys(original)).containsExactly(original);
    }

    @Test
    void theWebsiteNeedsItsCsrfToken() throws Exception {
        String email = "csrf-" + tag + "@x.io";
        UUID me = userWithPassword(email, "Csrf");
        TenantFixtures.member(jdbc, TenantFixtures.space(jdbc, "Csrf " + tag, TenantFixtures.GIB), me, "OWNER");
        assertThat(mvc.perform(deleteRequest(PASSWORD).with(user(email))).andReturn().getResponse().getStatus()).isEqualTo(403);
        assertThat(count("SELECT count(*) FROM app_user WHERE id = ?", me)).isEqualTo(1);
    }

    @Test
    void wrongPasswordsAreLimited() throws Exception {
        String email = "limit-" + tag + "@x.io";
        UUID me = userWithPassword(email, "Limit");
        TenantFixtures.member(jdbc, TenantFixtures.space(jdbc, "Limit " + tag, TenantFixtures.GIB), me, "OWNER");
        for (int i = 0; i < 5; i++) {
            assertThat(mvc.perform(deleteRequest("x" + i).with(user(email)).with(csrf())).andReturn().getResponse().getStatus()).isEqualTo(403);
        }
        assertThat(mvc.perform(deleteRequest(PASSWORD).with(user(email)).with(csrf())).andReturn().getResponse().getStatus()).isEqualTo(429);
        assertThat(count("SELECT count(*) FROM app_user WHERE id = ?", me)).isEqualTo(1);
    }

    @Test
    void thePlatformAdminCannotDeleteItself() throws Exception {
        String email = "admin-" + tag + "@x.io";
        UUID me = userWithPassword(email, "Admin");
        jdbc.update("UPDATE app_user SET is_admin = true WHERE id = ?", me);
        assertThat(mvc.perform(deleteRequest(PASSWORD).with(user(email)).with(csrf())).andReturn().getResponse().getStatus()).isEqualTo(409);
        assertThat(count("SELECT count(*) FROM app_user WHERE id = ?", me)).isEqualTo(1);
    }

    // ---- a member with a partner

    @Test
    void withAPartnerTheUserOnlyLeavesAndTheContentStays() throws Exception {
        String email = "leaver-" + tag + "@x.io";
        UUID space = TenantFixtures.space(jdbc, "Çift " + tag, TenantFixtures.GIB);
        UUID me = userWithPassword(email, "Giden");
        UUID partner = userWithPassword("stayer-" + tag + "@x.io", "Kalan");
        TenantFixtures.member(jdbc, space, me, "OWNER");
        TenantFixtures.member(jdbc, space, partner, "MEMBER");
        UUID album = album(space, me);
        String mine = media(space, album, me, false);
        String theirs = media(space, album, partner, false);
        jdbc.update("INSERT INTO special_day (space_id, title, day, icon, yearly, created_by) VALUES (?, 'Yıl dönümü', '2021-05-01', 'ring', true, ?)", space, me);
        jdbc.update("INSERT INTO day_note (space_id, author_id, day, body) VALUES (?, ?, '2026-10-01', 'benim notum')", space, me);
        jdbc.update("INSERT INTO day_note (space_id, author_id, day, body) VALUES (?, ?, '2026-10-01', 'onun notu')", space, partner);
        jdbc.update("INSERT INTO invitation (token_hash, space_id, role, created_by, expires_at, used_at, used_by) "
                + "VALUES (?, ?, 'MEMBER', ?, now(), now(), ?)", "u" + tag, space, me, partner);

        assertThat(mvc.perform(deleteRequest(PASSWORD).with(user(email)).with(csrf())).andReturn().getResponse().getStatus()).isEqualTo(204);

        assertThat(count("SELECT count(*) FROM app_user WHERE id = ?", me)).isZero();
        assertThat(jdbc.queryForObject("SELECT role FROM space_member WHERE space_id = ? AND user_id = ?", String.class, space, partner)).isEqualTo("OWNER");
        assertThat(count("SELECT count(*) FROM space_member WHERE space_id = ?", space)).isEqualTo(1);
        assertThat(jdbc.queryForObject("SELECT created_by FROM album WHERE id = ?", UUID.class, album)).isEqualTo(partner);
        assertThat(count("SELECT count(*) FROM media WHERE space_id = ? AND uploaded_by = ?", space, partner)).isEqualTo(2);
        assertThat(keys(mine)).containsExactly(mine);
        assertThat(keys(theirs)).containsExactly(theirs);
        assertThat(count("SELECT count(*) FROM special_day WHERE space_id = ? AND created_by = ?", space, partner)).isEqualTo(1);
        assertThat(jdbc.queryForList("SELECT body FROM day_note WHERE space_id = ?", String.class, space)).containsExactly("onun notu");
        assertThat(jdbc.queryForObject("SELECT created_by FROM invitation WHERE token_hash = ?", UUID.class, "u" + tag)).isEqualTo(partner);

        // the partner, now owner, still sees the album
        String albums = mvc.perform(get("/api/albums").with(user("stayer-" + tag + "@x.io"))).andReturn().getResponse().getContentAsString();
        assertThat(JsonPath.<List<String>>read(albums, "$[*].id")).contains(album.toString());
    }

    // ---- sessions

    @Test
    void everySessionOfTheUserEnds() throws Exception {
        String email = "sessions-" + tag + "@x.io";
        UUID me = userWithPassword(email, "Oturum");
        TenantFixtures.member(jdbc, TenantFixtures.space(jdbc, "Oturum " + tag, TenantFixtures.GIB), me, "OWNER");
        String login = "{\"email\":\"" + email + "\",\"password\":\"" + PASSWORD + "\"}";

        MvcResult web = mvc.perform(post("/api/auth/login").with(csrf()).contentType(MediaType.APPLICATION_JSON).content(login)).andReturn();
        jakarta.servlet.http.Cookie cookie = web.getResponse().getCookie("SESSION");
        assertThat(cookie).isNotNull();
        MvcResult app = mvc.perform(post("/api/auth/login").header("X-Client", APP).contentType(MediaType.APPLICATION_JSON).content(login)).andReturn();
        String token = app.getResponse().getHeader("X-Auth-Token");
        assertThat(token).isNotBlank();

        // deleted from the store app: X-Auth-Token, no CSRF token
        assertThat(mvc.perform(deleteRequest(PASSWORD).header("X-Client", APP).header("X-Auth-Token", token)).andReturn().getResponse().getStatus())
                .isEqualTo(204);

        assertThat(mvc.perform(get("/api/albums").header("X-Client", APP).header("X-Auth-Token", token)).andReturn().getResponse().getStatus()).isEqualTo(401);
        assertThat(mvc.perform(get("/api/albums").cookie(cookie)).andReturn().getResponse().getStatus()).as("the website session too").isEqualTo(401);
        assertThat(mvc.perform(post("/api/auth/login").with(csrf()).contentType(MediaType.APPLICATION_JSON).content(login)).andReturn().getResponse().getStatus())
                .isEqualTo(401);
    }

    // ---- seeding and the public info

    @Test
    void theSeederNeverBringsADeletedAccountBack() {
        String gone = "gone-" + tag + "@x.io";
        String fresh = "fresh-" + tag + "@x.io";
        jdbc.update("INSERT INTO deleted_account (email_sha256) VALUES (?)", AccountService.emailHash(gone.toUpperCase()));
        new UserSeeder(new SeedProperties(new SeedProperties.Seed(gone, "Gone", "pw"), new SeedProperties.Seed(fresh, "Fresh", "pw")),
                users, encoder, jdbc, spaceProperties, "", roles).run(null);
        assertThat(users.findByEmailIgnoreCase(gone)).isEmpty();
        assertThat(users.findByEmailIgnoreCase(fresh)).isPresent();
        jdbc.update("DELETE FROM app_user WHERE email = ?", fresh);
    }

    @Test
    void theLegalInfoIsPublic() throws Exception {
        MvcResult legal = mvc.perform(get("/api/legal")).andReturn();
        assertThat(legal.getResponse().getStatus()).isEqualTo(200);
        assertThat(JsonPath.<String>read(legal.getResponse().getContentAsString(), "$.contactEmail")).isNotNull();
    }
}
