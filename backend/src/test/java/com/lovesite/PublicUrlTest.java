package com.lovesite;

import com.jayway.jsonpath.JsonPath;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.RequestPostProcessor;

import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;

/** APP_PUBLIC_URL: invite links, the redirect from the platform host, and a CSP that keeps working on the custom domain. */
@SpringBootTest
@AutoConfigureMockMvc
class PublicUrlTest {

    static final String PUBLIC = "https://sevgi.example.test";

    @DynamicPropertySource
    static void properties(DynamicPropertyRegistry r) {
        TestInfrastructure.register(r);
        r.add("app.public-url", () -> PUBLIC + "/");   // trailing slash is tolerated
        r.add("app.redirect-to-public-url", () -> "true");
    }

    @Autowired MockMvc mvc;
    @Autowired JdbcTemplate jdbc;

    static RequestPostProcessor host(String name) {
        return request -> {
            request.setServerName(name);
            return request;
        };
    }

    @Test
    void pageRequestsOnThePlatformHostAreRedirectedPermanently() throws Exception {
        var res = mvc.perform(get("/albums/abc").queryParam("x", "1").with(host("love.up.railway.app"))).andReturn().getResponse();
        assertThat(res.getStatus()).isEqualTo(301);
        assertThat(res.getHeader("Location")).isEqualTo(PUBLIC + "/albums/abc?x=1");
    }

    @Test
    void healthApiAndTheCustomDomainAreNeverRedirected() throws Exception {
        assertThat(mvc.perform(get("/actuator/health/readiness").with(host("love.up.railway.app"))).andReturn().getResponse().getStatus()).isEqualTo(200);
        assertThat(mvc.perform(get("/actuator/health").with(host("love.up.railway.app"))).andReturn().getResponse().getStatus()).isEqualTo(200);
        // API calls keep working on the old host (a 301 would turn a POST into a GET)
        assertThat(mvc.perform(get("/api/auth/me").with(host("love.up.railway.app"))).andReturn().getResponse().getStatus()).isNotEqualTo(301);
        assertThat(mvc.perform(post("/api/auth/logout").with(csrf()).with(host("love.up.railway.app"))).andReturn().getResponse().getStatus()).isNotEqualTo(301);
        // the custom domain itself and unrelated hosts (tests, localhost) are served
        assertThat(mvc.perform(get("/").with(host("sevgi.example.test"))).andReturn().getResponse().getStatus()).isNotEqualTo(301);
        assertThat(mvc.perform(get("/")).andReturn().getResponse().getStatus()).isNotEqualTo(301);
    }

    @Test
    void contentSecurityPolicyIsTheSameOnTheCustomDomain() throws Exception {
        var res = mvc.perform(get("/").secure(true).with(host("sevgi.example.test"))).andReturn().getResponse();
        String csp = res.getHeader("Content-Security-Policy");
        assertThat(csp).contains("default-src 'self'", "connect-src 'self' " + TestInfrastructure.s3Url(), "frame-ancestors 'none'");
        // 'self' is relative to the request origin: no host is written into the policy
        assertThat(csp).doesNotContain("example.test").doesNotContain("railway");
        assertThat(res.getHeader("Strict-Transport-Security")).isEqualTo("max-age=31536000; includeSubDomains");
    }

    @Test
    void inviteLinksCarryTheConfiguredPublicUrl() throws Exception {
        String email = "admin-" + UUID.randomUUID().toString().substring(0, 8) + "@x.io";
        TenantFixtures.user(jdbc, email, "Admin", true);
        var res = mvc.perform(post("/api/admin/spaces").contentType(MediaType.APPLICATION_JSON).with(csrf()).with(user(email))
                .content("{\"name\":\"Alan\",\"limitGb\":5}")).andReturn().getResponse();
        assertThat(res.getStatus()).isEqualTo(201);
        String body = res.getContentAsString();
        String path = JsonPath.read(body, "$.invitation.path");
        assertThat(JsonPath.<String>read(body, "$.invitation.url")).isEqualTo(PUBLIC + path);
    }

    @Test
    void publicUrlIsReducedToAnOrigin() {
        var p = new com.lovesite.config.PublicUrlProperties(" https://Example.test:8443/some/path/ ", false);
        assertThat(p.publicUrl()).isEqualTo("https://Example.test:8443");
        assertThat(new com.lovesite.config.PublicUrlProperties("not a url", true).configured()).isFalse();
        assertThat(new com.lovesite.config.PublicUrlProperties("", true).configured()).isFalse();
        assertThat(new com.lovesite.storage.StorageProperties("", "", "", "", "", false, true,
                java.util.List.of("https://a.test/", " https://b.test "), null, null, 0).allowedOrigins())
                .containsExactly("https://a.test", "https://b.test");
    }
}
