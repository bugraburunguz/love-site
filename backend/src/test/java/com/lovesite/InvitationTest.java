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
import org.springframework.test.web.servlet.request.RequestPostProcessor;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.sql.Timestamp;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.HexFormat;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;

/** Invitation-only onboarding: admin creates a space, its owner invites the partner, nobody can sign up on their own. */
@SpringBootTest
@AutoConfigureMockMvc
class InvitationTest {

    @DynamicPropertySource
    static void properties(DynamicPropertyRegistry r) {
        TestInfrastructure.register(r);
    }

    @Autowired MockMvc mvc;
    @Autowired JdbcTemplate jdbc;

    RequestPostProcessor admin;
    String tag;

    @BeforeEach
    void setUp() {
        tag = UUID.randomUUID().toString().substring(0, 8);
        String adminEmail = "admin-" + tag + "@x.io";
        TenantFixtures.user(jdbc, adminEmail, "Admin", true);
        admin = user(adminEmail);
    }

    MvcResult json(MockHttpServletRequestBuilder request, RequestPostProcessor who, String body) throws Exception {
        MockHttpServletRequestBuilder r = request.contentType(MediaType.APPLICATION_JSON).with(csrf());
        if (who != null) r.with(who);
        if (body != null) r.content(body);
        return mvc.perform(r).andReturn();
    }

    String accept(String token, String email, String password, String ip) throws Exception {
        return json(post("/api/invites/" + token + "/accept").header("X-Forwarded-For", ip), null,
                "{\"displayName\":\"Yeni\",\"email\":\"" + email + "\",\"password\":\"" + password + "\"}").getResponse().getContentAsString();
    }

    int acceptStatus(String token, String email, String password, String ip) throws Exception {
        return json(post("/api/invites/" + token + "/accept").header("X-Forwarded-For", ip), null,
                "{\"displayName\":\"Yeni\",\"email\":\"" + email + "\",\"password\":\"" + password + "\"}").getResponse().getStatus();
    }

    String token(String path) {
        return path.substring(path.lastIndexOf('/') + 1);
    }

    String ip() {
        return "203.0.113." + (1 + (int) (Math.random() * 250));
    }

    /** admin creates a space; returns the owner invitation token */
    String newSpace(String name, double gb) throws Exception {
        MvcResult res = json(post("/api/admin/spaces"), admin, "{\"name\":\"" + name + "\",\"limitGb\":" + gb + "}");
        assertThat(res.getResponse().getStatus()).isEqualTo(201);
        return token(JsonPath.read(res.getResponse().getContentAsString(), "$.invitation.path"));
    }

    // ---- full flow

    @Test
    void adminCreatesASpaceTheOwnerJoinsAndInvitesThePartner() throws Exception {
        MvcResult created = json(post("/api/admin/spaces"), admin, "{\"name\":\"Ayşe ve Ali\",\"limitGb\":50}");
        String body = created.getResponse().getContentAsString();
        assertThat(JsonPath.<Number>read(body, "$.space.limitBytes").longValue()).isEqualTo(50 * TenantFixtures.GIB);
        String ownerToken = token(JsonPath.read(body, "$.invitation.path"));
        assertThat(JsonPath.<String>read(body, "$.invitation.path")).startsWith("/invite/");

        // the public page can look the link up without a session
        String preview = mvc.perform(get("/api/invites/" + ownerToken)).andReturn().getResponse().getContentAsString();
        assertThat(JsonPath.<String>read(preview, "$.spaceName")).isEqualTo("Ayşe ve Ali");
        assertThat(JsonPath.<String>read(preview, "$.role")).isEqualTo("OWNER");

        // accepting creates the account and signs it in
        String ownerEmail = "ayse-" + tag + "@x.io";
        MvcResult accepted = json(post("/api/invites/" + ownerToken + "/accept"), null,
                "{\"displayName\":\"Ayşe\",\"email\":\"" + ownerEmail.toUpperCase() + "\",\"password\":\"uzun-bir-sifre\"}");
        assertThat(accepted.getResponse().getStatus()).isEqualTo(200);
        assertThat(JsonPath.<String>read(accepted.getResponse().getContentAsString(), "$.role")).isEqualTo("OWNER");
        assertThat(JsonPath.<String>read(accepted.getResponse().getContentAsString(), "$.spaceName")).isEqualTo("Ayşe ve Ali");
        assertThat(jdbc.queryForObject("SELECT email FROM app_user WHERE lower(email) = ?", String.class, ownerEmail)).isEqualTo(ownerEmail); // stored lower-case
        jakarta.servlet.http.Cookie session = accepted.getResponse().getCookie("SESSION");
        assertThat(session).as("session cookie").isNotNull();
        String me = mvc.perform(get("/api/auth/me").cookie(session)).andReturn().getResponse().getContentAsString();
        assertThat(JsonPath.<String>read(me, "$.email")).isEqualTo(ownerEmail);

        // the password really works for a regular login afterwards
        MvcResult login = json(post("/api/auth/login"), null, "{\"email\":\"" + ownerEmail + "\",\"password\":\"uzun-bir-sifre\"}");
        assertThat(login.getResponse().getStatus()).isEqualTo(200);

        // the owner invites the partner
        MvcResult invite = json(post("/api/space/invites"), user(ownerEmail), null);
        assertThat(invite.getResponse().getStatus()).isEqualTo(201);
        String partnerToken = token(JsonPath.read(invite.getResponse().getContentAsString(), "$.path"));
        String partnerEmail = "ali-" + tag + "@x.io";
        assertThat(acceptStatus(partnerToken, partnerEmail, "partner-sifresi", ip())).isEqualTo(200);

        String space = mvc.perform(get("/api/space").with(user(partnerEmail))).andReturn().getResponse().getContentAsString();
        assertThat(JsonPath.<String>read(space, "$.role")).isEqualTo("MEMBER");
        assertThat(JsonPath.<Integer>read(space, "$.members.length()")).isEqualTo(2);
        assertThat(JsonPath.<Boolean>read(space, "$.canInvite")).isFalse();
        // and now the space is full: a third person cannot be invited
        assertThat(json(post("/api/space/invites"), user(ownerEmail), null).getResponse().getStatus()).isEqualTo(409);
        // the partner (a MEMBER) cannot invite either
        assertThat(json(post("/api/space/invites"), user(partnerEmail), null).getResponse().getStatus()).isEqualTo(403);
    }

    @Test
    void anInvitationWorksOnceAndOnlyUntilItExpires() throws Exception {
        String token = newSpace("Tek kullanımlık", 10);
        String first = "one-" + tag + "@x.io";
        assertThat(acceptStatus(token, first, "yeterince-uzun", ip())).isEqualTo(200);

        // used: the same answer as for an unknown token
        MvcResult used = mvc.perform(get("/api/invites/" + token).header("X-Forwarded-For", ip())).andReturn();
        MvcResult unknown = mvc.perform(get("/api/invites/" + "x".repeat(43)).header("X-Forwarded-For", ip())).andReturn();
        assertThat(used.getResponse().getStatus()).isEqualTo(404);
        assertThat(detail(used)).isEqualTo(detail(unknown));
        assertThat(acceptStatus(token, "two-" + tag + "@x.io", "yeterince-uzun", ip())).isEqualTo(404);

        // expired: also identical
        String expiring = newSpace("Süresi dolacak", 10);
        jdbc.update("UPDATE invitation SET expires_at = ? WHERE token_hash = ?", Timestamp.from(Instant.now().minus(1, ChronoUnit.MINUTES)), sha256(expiring));
        MvcResult expired = mvc.perform(get("/api/invites/" + expiring).header("X-Forwarded-For", ip())).andReturn();
        assertThat(expired.getResponse().getStatus()).isEqualTo(404);
        assertThat(detail(expired)).isEqualTo(detail(unknown));
        assertThat(acceptStatus(expiring, "three-" + tag + "@x.io", "yeterince-uzun", ip())).isEqualTo(404);
        assertThat(jdbc.queryForObject("SELECT count(*) FROM app_user WHERE email = ?", Integer.class, "three-" + tag + "@x.io")).isZero();
    }

    @Test
    void validityIsSevenDays() throws Exception {
        String token = newSpace("Yedi gün", 10);
        Timestamp expires = jdbc.queryForObject("SELECT expires_at FROM invitation WHERE token_hash = ?", Timestamp.class, sha256(token));
        long hours = ChronoUnit.HOURS.between(Instant.now(), expires.toInstant());
        assertThat(hours).isBetween(7 * 24 - 1L, 7 * 24L);
    }

    @Test
    void onlyTheHashOfTheTokenIsStored() throws Exception {
        String token = newSpace("Hash", 10);
        assertThat(token).hasSizeGreaterThanOrEqualTo(43); // 32 random bytes, base64url
        assertThat(jdbc.queryForObject("SELECT count(*) FROM invitation WHERE token_hash = ?", Integer.class, sha256(token))).isEqualTo(1);
        // the plain token is nowhere in the table
        assertThat(jdbc.queryForObject("SELECT count(*) FROM invitation i WHERE i::text LIKE ?", Integer.class, "%" + token + "%")).isZero();
    }

    @Test
    void passwordMustHaveTenCharactersAndTheEmailMustBeFree() throws Exception {
        String token = newSpace("Doğrulama", 10);
        assertThat(acceptStatus(token, "short-" + tag + "@x.io", "kisa", ip())).isEqualTo(400);
        assertThat(acceptStatus(token, "not-an-email", "yeterince-uzun", ip())).isEqualTo(400);
        // an existing account (here: the seeded one) cannot be taken over through an invitation
        assertThat(acceptStatus(token, "a@test.io", "yeterince-uzun", ip())).isEqualTo(409);
        // none of the failed attempts burned the link
        assertThat(acceptStatus(token, "fine-" + tag + "@x.io", "yeterince-uzun", ip())).isEqualTo(200);
    }

    @Test
    void aSignedInMemberCannotAcceptAnInvitation() throws Exception {
        String token = newSpace("Zaten üye", 10);
        MvcResult res = json(post("/api/invites/" + token + "/accept"), user("a@test.io"),
                "{\"displayName\":\"A\",\"email\":\"zzz-" + tag + "@x.io\",\"password\":\"yeterince-uzun\"}");
        assertThat(res.getResponse().getStatus()).isEqualTo(409);
        assertThat(JsonPath.<String>read(res.getResponse().getContentAsString(), "$.detail")).isEqualTo("Zaten bir alana üyesin");
        assertThat(jdbc.queryForObject("SELECT used_at IS NULL FROM invitation WHERE token_hash = ?", Boolean.class, sha256(token))).isTrue();
    }

    // ---- replacement and capacity

    @Test
    void aNewPartnerInvitationReplacesTheOldOne() throws Exception {
        String ownerToken = newSpace("Yenileme", 10);
        String ownerEmail = "owner-" + tag + "@x.io";
        assertThat(acceptStatus(ownerToken, ownerEmail, "yeterince-uzun", ip())).isEqualTo(200);

        String first = token(JsonPath.read(json(post("/api/space/invites"), user(ownerEmail), null).getResponse().getContentAsString(), "$.path"));
        String second = token(JsonPath.read(json(post("/api/space/invites"), user(ownerEmail), null).getResponse().getContentAsString(), "$.path"));

        assertThat(mvc.perform(get("/api/invites/" + first).header("X-Forwarded-For", ip())).andReturn().getResponse().getStatus()).isEqualTo(404);
        assertThat(mvc.perform(get("/api/invites/" + second).header("X-Forwarded-For", ip())).andReturn().getResponse().getStatus()).isEqualTo(200);
        assertThat(acceptStatus(first, "late-" + tag + "@x.io", "yeterince-uzun", ip())).isEqualTo(404);
        assertThat(acceptStatus(second, "partner-" + tag + "@x.io", "yeterince-uzun", ip())).isEqualTo(200);
    }

    @Test
    void aFullSpaceCannotTakeAnotherMemberEvenWithAnOutstandingLink() throws Exception {
        String ownerToken = newSpace("Dolu", 10);
        String ownerEmail = "full-" + tag + "@x.io";
        acceptStatus(ownerToken, ownerEmail, "yeterince-uzun", ip());
        String partnerToken = token(JsonPath.read(json(post("/api/space/invites"), user(ownerEmail), null).getResponse().getContentAsString(), "$.path"));
        // somebody else fills the seat in the meantime (e.g. through the database / an earlier link)
        UUID space = TenantFixtures.spaceOf(jdbc, ownerEmail);
        TenantFixtures.member(jdbc, space, TenantFixtures.user(jdbc, "filler-" + tag + "@x.io", "F", false), "MEMBER");

        assertThat(acceptStatus(partnerToken, "late-" + tag + "@x.io", "yeterince-uzun", ip())).isEqualTo(404);
        assertThat(jdbc.queryForObject("SELECT count(*) FROM space_member WHERE space_id = ?", Integer.class, space)).isEqualTo(2);
    }

    @Test
    void twoPeopleRacingForTheSameLinkProduceExactlyOneAccount() throws Exception {
        String token = newSpace("Yarış", 10);
        java.util.concurrent.ExecutorService pool = java.util.concurrent.Executors.newFixedThreadPool(6);
        try {
            java.util.concurrent.CountDownLatch start = new java.util.concurrent.CountDownLatch(1);
            java.util.List<java.util.concurrent.Future<Integer>> results = new java.util.ArrayList<>();
            for (int i = 0; i < 6; i++) {
                String email = "race" + i + "-" + tag + "@x.io";
                String ip = "198.51.100." + (10 + i);
                results.add(pool.submit(() -> {
                    start.await();
                    return acceptStatus(token, email, "yeterince-uzun", ip);
                }));
            }
            start.countDown();
            int ok = 0;
            for (var f : results) if (f.get() == 200) ok++;
            assertThat(ok).isEqualTo(1);
            assertThat(jdbc.queryForObject("SELECT count(*) FROM app_user WHERE email LIKE ?", Integer.class, "race%-" + tag + "@x.io")).isEqualTo(1);
        } finally {
            pool.shutdownNow();
        }
    }

    // ---- brute force protection

    @Test
    void guessingTokensIsThrottledPerAddressUsingTheRightmostForwardedEntry() throws Exception {
        String attackerIp = "192.0.2." + (1 + (int) (Math.random() * 200));
        for (int i = 0; i < 5; i++) {
            // the client controls the left part of X-Forwarded-For: it must not help to vary it
            MvcResult res = mvc.perform(get("/api/invites/" + "guess" + i).header("X-Forwarded-For", "10.0.0." + i + ", " + attackerIp)).andReturn();
            assertThat(res.getResponse().getStatus()).isEqualTo(404);
        }
        MvcResult blocked = mvc.perform(get("/api/invites/another-guess").header("X-Forwarded-For", "10.9.9.9, " + attackerIp)).andReturn();
        assertThat(blocked.getResponse().getStatus()).isEqualTo(429);
        // other addresses are not affected
        assertThat(mvc.perform(get("/api/invites/another-guess").header("X-Forwarded-For", ip())).andReturn().getResponse().getStatus()).isEqualTo(404);
    }

    @Test
    void thereIsNoPublicSignup() throws Exception {
        assertThat(json(post("/api/auth/register"), null, "{\"email\":\"x@x.io\",\"password\":\"yeterince-uzun\"}").getResponse().getStatus()).isIn(401, 404, 405);
        assertThat(json(post("/api/invites/yok/accept"), null,
                "{\"displayName\":\"x\",\"email\":\"nobody-" + tag + "@x.io\",\"password\":\"yeterince-uzun\"}").getResponse().getStatus()).isEqualTo(404);
        assertThat(jdbc.queryForObject("SELECT count(*) FROM app_user WHERE email = ?", Integer.class, "nobody-" + tag + "@x.io")).isZero();
    }

    // ---- admin

    @Test
    void adminCanRenameAResizeASpaceAndReissueAnOwnerLink() throws Exception {
        String token = newSpace("İlk ad", 5);
        UUID space = jdbc.queryForObject("SELECT space_id FROM invitation WHERE token_hash = ?", UUID.class, sha256(token));

        String updated = json(patch("/api/admin/spaces/" + space), admin, "{\"name\":\"Yeni ad\",\"limitGb\":20}").getResponse().getContentAsString();
        assertThat(JsonPath.<String>read(updated, "$.name")).isEqualTo("Yeni ad");
        assertThat(JsonPath.<Number>read(updated, "$.limitBytes").longValue()).isEqualTo(20 * TenantFixtures.GIB);
        assertThat(json(patch("/api/admin/spaces/" + space), admin, "{\"limitGb\":-1}").getResponse().getStatus()).isEqualTo(400);
        assertThat(json(patch("/api/admin/spaces/" + UUID.randomUUID()), admin, "{\"name\":\"x\"}").getResponse().getStatus()).isEqualTo(404);

        // nobody joined yet: a new owner link replaces the old one
        String again = token(JsonPath.read(json(post("/api/admin/spaces/" + space + "/invites"), admin, null).getResponse().getContentAsString(), "$.path"));
        assertThat(mvc.perform(get("/api/invites/" + token).header("X-Forwarded-For", ip())).andReturn().getResponse().getStatus()).isEqualTo(404);
        assertThat(acceptStatus(again, "owner2-" + tag + "@x.io", "yeterince-uzun", ip())).isEqualTo(200);
        // an owner exists now: no second owner link
        assertThat(json(post("/api/admin/spaces/" + space + "/invites"), admin, null).getResponse().getStatus()).isEqualTo(409);
    }

    static String detail(MvcResult result) throws Exception {
        return JsonPath.read(result.getResponse().getContentAsString(), "$.detail");
    }

    static String sha256(String token) throws Exception {
        return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(token.getBytes(StandardCharsets.UTF_8)));
    }
}
