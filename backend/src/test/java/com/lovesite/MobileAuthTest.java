package com.lovesite;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.options;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;

/** The store apps: the session id travels in X-Auth-Token, CORS only for the app origins, the website flow is unchanged. */
@SpringBootTest
@AutoConfigureMockMvc
class MobileAuthTest {

    static final String APP = "love-site-app";
    static final String LOGIN = "{\"email\":\"a@test.io\",\"password\":\"pw1\"}";

    @DynamicPropertySource
    static void properties(DynamicPropertyRegistry r) {
        TestInfrastructure.register(r);
    }

    @Autowired MockMvc mvc;

    MvcResult appLogin() throws Exception {
        return mvc.perform(post("/api/auth/login").header("X-Client", APP).header("Origin", "capacitor://localhost")
                .contentType(MediaType.APPLICATION_JSON).content(LOGIN)).andReturn();
    }

    @Test
    void appSignsInWithoutCsrfAndGetsTheSessionInAHeader() throws Exception {
        MvcResult login = appLogin();
        assertThat(login.getResponse().getStatus()).isEqualTo(200);
        String token = login.getResponse().getHeader("X-Auth-Token");
        assertThat(token).isNotBlank();
        assertThat(login.getResponse().getCookie("SESSION")).as("no cookie for the app").isNull();
        assertThat(login.getResponse().getCookie("XSRF-TOKEN")).as("no CSRF cookie for the app").isNull();
        assertThat(login.getResponse().getHeader("Access-Control-Allow-Origin")).isEqualTo("capacitor://localhost");
        assertThat(login.getResponse().getHeader("Access-Control-Expose-Headers")).contains("X-Auth-Token");

        // the token opens the API for app requests ...
        assertThat(mvc.perform(get("/api/albums").header("X-Client", APP).header("X-Auth-Token", token)).andReturn().getResponse().getStatus())
                .isEqualTo(200);
        assertThat(mvc.perform(post("/api/albums").header("X-Client", APP).header("X-Auth-Token", token)
                .contentType(MediaType.APPLICATION_JSON).content("{\"title\":\"Telefondan\"}")).andReturn().getResponse().getStatus()).isEqualTo(201);
        // ... but never as a web request (a web request reads only the cookie)
        assertThat(mvc.perform(get("/api/albums").header("X-Auth-Token", token)).andReturn().getResponse().getStatus()).isEqualTo(401);

        // logout ends that session
        assertThat(mvc.perform(post("/api/auth/logout").header("X-Client", APP).header("X-Auth-Token", token)).andReturn().getResponse().getStatus())
                .isEqualTo(204);
        assertThat(mvc.perform(get("/api/albums").header("X-Client", APP).header("X-Auth-Token", token)).andReturn().getResponse().getStatus())
                .isEqualTo(401);
    }

    @Test
    void anAppRequestIsNeverAuthenticatedByTheCookie() throws Exception {
        MvcResult web = mvc.perform(post("/api/auth/login").with(csrf()).contentType(MediaType.APPLICATION_JSON).content(LOGIN)).andReturn();
        assertThat(web.getResponse().getStatus()).isEqualTo(200);
        jakarta.servlet.http.Cookie session = web.getResponse().getCookie("SESSION");
        assertThat(session).isNotNull();
        assertThat(web.getResponse().getHeader("X-Auth-Token")).isNull();
        assertThat(mvc.perform(get("/api/albums").cookie(session)).andReturn().getResponse().getStatus()).isEqualTo(200);
        // the same cookie on a request that claims to be the app: not authenticated, so skipping CSRF there forges nothing
        assertThat(mvc.perform(get("/api/albums").cookie(session).header("X-Client", APP)).andReturn().getResponse().getStatus()).isEqualTo(401);
        assertThat(mvc.perform(post("/api/albums").cookie(session).header("X-Client", APP).contentType(MediaType.APPLICATION_JSON)
                .content("{\"title\":\"x\"}")).andReturn().getResponse().getStatus()).isEqualTo(401);
    }

    @Test
    void websiteStillNeedsCsrf() throws Exception {
        assertThat(mvc.perform(post("/api/auth/login").contentType(MediaType.APPLICATION_JSON).content(LOGIN)).andReturn().getResponse().getStatus())
                .isEqualTo(403);
    }

    @Test
    void corsOnlyForTheAppOrigins() throws Exception {
        for (String origin : new String[] {"capacitor://localhost", "https://localhost"}) {
            MvcResult pre = mvc.perform(options("/api/albums").header("Origin", origin).header("Access-Control-Request-Method", "POST")
                    .header("Access-Control-Request-Headers", "content-type,x-client,x-auth-token")).andReturn();
            assertThat(pre.getResponse().getStatus()).as(origin).isEqualTo(200);
            assertThat(pre.getResponse().getHeader("Access-Control-Allow-Origin")).isEqualTo(origin);
            assertThat(pre.getResponse().getHeader("Access-Control-Allow-Credentials")).isNull();
        }
        MvcResult evil = mvc.perform(options("/api/albums").header("Origin", "https://evil.example").header("Access-Control-Request-Method", "POST")
                .header("Access-Control-Request-Headers", "x-client")).andReturn();
        assertThat(evil.getResponse().getStatus()).isEqualTo(403);
        assertThat(evil.getResponse().getHeader("Access-Control-Allow-Origin")).isNull();
    }
}
