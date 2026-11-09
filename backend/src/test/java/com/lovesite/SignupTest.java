package com.lovesite;

import com.jayway.jsonpath.JsonPath;
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

import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;

/** Public signup: a free 50 MB space of one's own, limited per address; invited spaces keep their own (larger) limits. */
@SpringBootTest
@AutoConfigureMockMvc
class SignupTest {

    static final long MB = 1024L * 1024L;

    @DynamicPropertySource
    static void properties(DynamicPropertyRegistry r) {
        TestInfrastructure.register(r);
        r.add("app.signup.per-ip", () -> "3");
    }

    @Autowired MockMvc mvc;
    @Autowired JdbcTemplate jdbc;

    String tag;

    @BeforeEach
    void setUp() {
        tag = UUID.randomUUID().toString().substring(0, 8);
    }

    static String ip() {
        return "198.51.100." + (1 + (int) (Math.random() * 250));
    }

    MvcResult signup(String email, boolean privacy, String ip) throws Exception {
        MockHttpServletRequestBuilder r = post("/api/signup").contentType(MediaType.APPLICATION_JSON).with(csrf())
                .header("X-Forwarded-For", ip)
                .content("{\"displayName\":\"Deniz\",\"email\":\"" + email + "\",\"password\":\"uzun-bir-sifre\",\"acceptPrivacy\":" + privacy + "}");
        return mvc.perform(r).andReturn();
    }

    @Test
    void signupOpensAFreeSpaceOfOnesOwnAndSignsIn() throws Exception {
        String status = mvc.perform(get("/api/signup")).andReturn().getResponse().getContentAsString();
        assertThat(JsonPath.<Boolean>read(status, "$.open")).isTrue();
        assertThat(JsonPath.<Number>read(status, "$.freeLimitBytes").longValue()).isEqualTo(50 * MB);

        String email = "deniz-" + tag + "@x.io";
        MvcResult res = signup(email.toUpperCase(java.util.Locale.ROOT), true, ip());
        assertThat(res.getResponse().getStatus()).isEqualTo(200);
        assertThat(JsonPath.<String>read(res.getResponse().getContentAsString(), "$.role")).isEqualTo("OWNER");

        UUID space = TenantFixtures.spaceOf(jdbc, email);
        assertThat(jdbc.queryForObject("SELECT kind FROM space WHERE id = ?", String.class, space)).isEqualTo("FREE");
        assertThat(jdbc.queryForObject("SELECT storage_limit_bytes FROM space WHERE id = ?", Long.class, space)).isEqualTo(50 * MB);

        jakarta.servlet.http.Cookie session = res.getResponse().getCookie("SESSION");
        assertThat(session).as("session cookie").isNotNull();
        String info = mvc.perform(get("/api/space").cookie(session)).andReturn().getResponse().getContentAsString();
        assertThat(JsonPath.<String>read(info, "$.kind")).isEqualTo("FREE");
        assertThat(JsonPath.<Boolean>read(info, "$.canInvite")).as("the partner can still be invited").isTrue();
    }

    @Test
    void privacyConsentIsRequired() throws Exception {
        String email = "nope-" + tag + "@x.io";
        assertThat(signup(email, false, ip()).getResponse().getStatus()).isEqualTo(400);
        assertThat(jdbc.queryForObject("SELECT count(*) FROM app_user WHERE email = ?", Integer.class, email)).isZero();
    }

    @Test
    void aTakenEmailGetsTheSameAnswerAsAnInvitation() throws Exception {
        String email = "taken-" + tag + "@x.io";
        assertThat(signup(email, true, ip()).getResponse().getStatus()).isEqualTo(200);
        MvcResult again = signup(email, true, ip());
        assertThat(again.getResponse().getStatus()).isEqualTo(409);
        assertThat(again.getResponse().getContentAsString()).contains("Bu e-posta adresi kullanılamıyor");
    }

    @Test
    void oneAddressCanOnlyOpenAFewAccountsPerWindow() throws Exception {
        String same = "192.0.2." + (1 + (int) (Math.random() * 250));
        for (int i = 0; i < 3; i++) {
            assertThat(signup("burst" + i + "-" + tag + "@x.io", true, same).getResponse().getStatus()).isEqualTo(200);
        }
        assertThat(signup("burst3-" + tag + "@x.io", true, same).getResponse().getStatus()).isEqualTo(429);
        assertThat(signup("other-" + tag + "@x.io", true, ip()).getResponse().getStatus()).isEqualTo(200);
    }

    @Test
    void aSignedInUserCannotSignUpAgain() throws Exception {
        String email = "member-" + tag + "@x.io";
        TenantFixtures.spaceWithOwner(jdbc, "S " + tag, TenantFixtures.GIB, email);
        MvcResult res = mvc.perform(post("/api/signup").with(user(email)).with(csrf()).contentType(MediaType.APPLICATION_JSON)
                .header("X-Forwarded-For", ip())
                .content("{\"displayName\":\"x\",\"email\":\"second-" + tag + "@x.io\",\"password\":\"uzun-bir-sifre\",\"acceptPrivacy\":true}"))
                .andReturn();
        assertThat(res.getResponse().getStatus()).isEqualTo(409);
    }

    @Test
    void freeSpacesTakeOnlyShortVideos() throws Exception {
        String email = "video-" + tag + "@x.io";
        assertThat(signup(email, true, ip()).getResponse().getStatus()).isEqualTo(200);
        UUID album = album(email, TenantFixtures.spaceOf(jdbc, email));

        assertThat(uploadResult(email, album, "big.mp4", "video/mp4", 25 * MB)).isEqualTo("ERROR");
        assertThat(uploadResult(email, album, "short.mp4", "video/mp4", 15 * MB)).isEqualTo("PRESIGNED");
    }

    @Test
    void invitedSpacesKeepTheGeneralVideoLimit() throws Exception {
        String email = "inv-" + tag + "@x.io";
        UUID space = TenantFixtures.spaceWithOwner(jdbc, "Inv " + tag, TenantFixtures.GIB, email);
        UUID album = album(email, space);
        assertThat(uploadResult(email, album, "big.mp4", "video/mp4", 25 * MB)).isEqualTo("PRESIGNED");
    }

    UUID album(String ownerEmail, UUID space) {
        UUID owner = jdbc.queryForObject("SELECT id FROM app_user WHERE email = ?", UUID.class, ownerEmail);
        UUID album = UUID.randomUUID();
        jdbc.update("INSERT INTO album (id, title, created_by, space_id) VALUES (?, 'A', ?, ?)", album, owner, space);
        return album;
    }

    @Test
    void theAdminSeesWhichSpacesAreFree() throws Exception {
        String adminEmail = "admin-" + tag + "@x.io";
        TenantFixtures.user(jdbc, adminEmail, "Admin", true);
        String email = "listed-" + tag + "@x.io";
        assertThat(signup(email, true, ip()).getResponse().getStatus()).isEqualTo(200);
        UUID space = TenantFixtures.spaceOf(jdbc, email);

        String list = mvc.perform(get("/api/admin/spaces").with(user(adminEmail))).andReturn().getResponse().getContentAsString();
        assertThat(JsonPath.<java.util.List<String>>read(list, "$[?(@.id == '" + space + "')].kind")).containsExactly("FREE");
        String summary = mvc.perform(get("/api/admin/signup").with(user(adminEmail))).andReturn().getResponse().getContentAsString();
        assertThat(JsonPath.<Number>read(summary, "$.freeSpaces").intValue()).isPositive();
        assertThat(JsonPath.<Number>read(summary, "$.freeTotalBytes").longValue()).isEqualTo(3 * TenantFixtures.GIB);
    }

    String uploadResult(String email, UUID album, String name, String type, long size) throws Exception {
        String body = "{\"files\":[{\"clientId\":\"c1\",\"filename\":\"" + name + "\",\"contentType\":\"" + type + "\",\"sizeBytes\":" + size
                + ",\"sha256\":\"" + UUID.randomUUID().toString().replace("-", "").repeat(2) + "\"}]}";
        String res = mvc.perform(post("/api/albums/" + album + "/uploads").with(user(email)).with(csrf()).header("X-Forwarded-For", ip())
                .contentType(MediaType.APPLICATION_JSON).content(body)).andReturn().getResponse().getContentAsString();
        return JsonPath.read(res, "$.items[0].result");
    }
}
