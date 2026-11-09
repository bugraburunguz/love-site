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
import org.springframework.test.web.servlet.MvcResult;

import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;

/** All free spaces together may only promise a fixed amount of disk; once it is used up, signup closes. */
@SpringBootTest
@AutoConfigureMockMvc
class SignupPoolTest {

    static final long MB = 1024L * 1024L;

    @DynamicPropertySource
    static void properties(DynamicPropertyRegistry r) {
        TestInfrastructure.register(r);
        r.add("app.signup.free-total", () -> "500MB");
    }

    @Autowired MockMvc mvc;
    @Autowired JdbcTemplate jdbc;

    boolean open() throws Exception {
        return JsonPath.read(mvc.perform(get("/api/signup")).andReturn().getResponse().getContentAsString(), "$.open");
    }

    @Test
    void signupClosesWhenTheFreePoolIsFull() throws Exception {
        List<UUID> filler = new ArrayList<>();
        try {
            // other test classes share the database: fill whatever room is left with free spaces of our own
            for (int i = 0; i < 20 && open(); i++) {
                UUID id = UUID.randomUUID();
                jdbc.update("INSERT INTO space (id, name, storage_limit_bytes, kind) VALUES (?, 'Pool', ?, 'FREE')", id, 50 * MB);
                filler.add(id);
            }
            assertThat(open()).isFalse();

            String email = "late-" + UUID.randomUUID().toString().substring(0, 8) + "@x.io";
            MvcResult res = mvc.perform(post("/api/signup").contentType(MediaType.APPLICATION_JSON).with(csrf())
                    .header("X-Forwarded-For", "198.18.0." + (1 + (int) (Math.random() * 250)))
                    .content("{\"displayName\":\"Geç\",\"email\":\"" + email + "\",\"password\":\"uzun-bir-sifre\",\"acceptPrivacy\":true}"))
                    .andReturn();
            assertThat(res.getResponse().getStatus()).isEqualTo(409);
            assertThat(res.getResponse().getContentAsString()).contains("SIGNUP_CLOSED").contains("Şu an yeni kayıt alınmıyor");
            assertThat(jdbc.queryForObject("SELECT count(*) FROM app_user WHERE email = ?", Integer.class, email)).isZero();
        } finally {
            for (UUID id : filler) jdbc.update("DELETE FROM space WHERE id = ?", id);
        }
    }
}
