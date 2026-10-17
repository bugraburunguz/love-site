package com.lovesite;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.servlet.MockMvc;

import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;

/** Login (per address and per account) and upload start (per user and per address) are limited. Invitations: see InvitationTest. */
@SpringBootTest
@AutoConfigureMockMvc
class RateLimitTest {

    @DynamicPropertySource
    static void properties(DynamicPropertyRegistry r) {
        TestInfrastructure.register(r);
        r.add("app.rate-limit.login-per-ip", () -> "6");
        r.add("app.rate-limit.upload-start-per-user", () -> "3");
        r.add("app.rate-limit.upload-start-per-ip", () -> "5");
    }

    static final String FILE = "{\"files\":[{\"clientId\":\"c1\",\"filename\":\"a.jpg\",\"contentType\":\"image/jpeg\",\"sizeBytes\":100,\"sha256\":\"" + "ab".repeat(32) + "\"}]}";

    @Autowired MockMvc mvc;
    @Autowired JdbcTemplate jdbc;

    int login(String email, String password, String ip) throws Exception {
        return mvc.perform(post("/api/auth/login").contentType(MediaType.APPLICATION_JSON).with(csrf())
                .header("X-Forwarded-For", ip).content("{\"email\":\"" + email + "\",\"password\":\"" + password + "\"}"))
                .andReturn().getResponse().getStatus();
    }

    int uploadStart(String email, String ip) throws Exception {
        return mvc.perform(post("/api/albums/" + UUID.randomUUID() + "/uploads").with(user(email)).with(csrf())
                .header("X-Forwarded-For", ip).contentType(MediaType.APPLICATION_JSON).content(FILE))
                .andReturn().getResponse().getStatus();
    }

    String newUser(String prefix) {
        String email = prefix + "-" + UUID.randomUUID().toString().substring(0, 6) + "@x.io";
        TenantFixtures.spaceWithOwner(jdbc, "S " + email, TenantFixtures.GIB, email);
        return email;
    }

    @Test
    void oneAddressCannotTryEndlessEmailsAtTheLoginForm() throws Exception {
        String ip = "198.51.100.7";
        for (int i = 1; i <= 6; i++) {
            assertThat(login("nobody" + i + "@x.io", "wrong-password", ip)).as("attempt " + i).isEqualTo(401);
        }
        assertThat(login("nobody7@x.io", "wrong-password", ip)).isEqualTo(429);
        // even the right credentials are refused while the address is over its limit
        assertThat(login("a@test.io", "pw1", ip)).isEqualTo(429);
        // another address is unaffected
        assertThat(login("a@test.io", "pw1", "198.51.100.8")).isEqualTo(200);
    }

    @Test
    void anAccountIsLockedAfterFiveWrongPasswordsNoMatterWhereTheyComeFrom() throws Exception {
        for (int i = 1; i <= 5; i++) {
            assertThat(login("b@test.io", "wrong-" + i, "203.0.113." + i)).isEqualTo(401);
        }
        // a sixth address with the right password still meets the lock
        assertThat(login("b@test.io", "pw2", "203.0.113.50")).isEqualTo(429);
    }

    @Test
    void uploadStartsAreLimitedPerUser() throws Exception {
        String one = newUser("upload");
        String two = newUser("upload");
        // the album does not exist: the limiter sits in front of everything else and counts the request anyway
        for (int i = 1; i <= 3; i++) assertThat(uploadStart(one, "192.0.2.10")).as("request " + i).isEqualTo(404);
        assertThat(uploadStart(one, "192.0.2.10")).isEqualTo(429);
        // another user from another address is not affected
        assertThat(uploadStart(two, "192.0.2.11")).isEqualTo(404);
    }

    @Test
    void uploadStartsAreLimitedPerAddressAcrossUsers() throws Exception {
        String ip = "192.0.2.99";
        String a = newUser("ipa");
        String b = newUser("ipb");
        assertThat(uploadStart(a, ip)).isEqualTo(404);
        assertThat(uploadStart(a, ip)).isEqualTo(404);
        assertThat(uploadStart(b, ip)).isEqualTo(404);
        assertThat(uploadStart(b, ip)).isEqualTo(404);
        assertThat(uploadStart(b, ip)).isEqualTo(404);
        assertThat(uploadStart(a, ip)).isEqualTo(429);
    }
}
