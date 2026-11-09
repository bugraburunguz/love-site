package com.lovesite;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.servlet.MockMvc;

import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;

/** Besides the per-address limit, all signups together are capped per day: many addresses cannot drain the free pool. */
@SpringBootTest
@AutoConfigureMockMvc
class SignupDailyCapTest {

    @DynamicPropertySource
    static void properties(DynamicPropertyRegistry r) {
        TestInfrastructure.register(r);
        r.add("app.signup.per-day", () -> "2");
    }

    @Autowired MockMvc mvc;

    int signup(String ip) throws Exception {
        String email = "cap-" + UUID.randomUUID().toString().substring(0, 8) + "@x.io";
        return mvc.perform(post("/api/signup").contentType(MediaType.APPLICATION_JSON).with(csrf()).header("X-Forwarded-For", ip)
                        .content("{\"displayName\":\"Cap\",\"email\":\"" + email + "\",\"password\":\"uzun-bir-sifre\",\"acceptPrivacy\":true}"))
                .andReturn().getResponse().getStatus();
    }

    @Test
    void signupsFromManyAddressesStopAtTheDailyCap() throws Exception {
        assertThat(signup("203.0.113.71")).isEqualTo(200);
        assertThat(signup("203.0.113.72")).isEqualTo(200);
        assertThat(signup("203.0.113.73")).isEqualTo(429);
    }
}
