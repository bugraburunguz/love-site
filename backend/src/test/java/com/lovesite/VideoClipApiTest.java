package com.lovesite;

import com.jayway.jsonpath.JsonPath;
import com.lovesite.media.Media;
import com.lovesite.media.MediaKind;
import com.lovesite.media.MediaRepository;
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

import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;

/** LS-22: the user picks where a video's 3-second living photo starts, when uploading and afterwards. */
@SpringBootTest
@AutoConfigureMockMvc
class VideoClipApiTest {

    @DynamicPropertySource
    static void properties(DynamicPropertyRegistry r) {
        TestInfrastructure.register(r);
    }

    @Autowired MockMvc mvc;
    @Autowired JdbcTemplate jdbc;
    @Autowired MediaRepository mediaRepository;

    RequestPostProcessor me;
    UUID space;
    UUID userId;
    String album;

    @BeforeEach
    void setUp() throws Exception {
        String email = "clip-" + UUID.randomUUID().toString().substring(0, 8) + "@x.io";
        space = TenantFixtures.spaceWithOwner(jdbc, "Clip", 50 * TenantFixtures.GIB, email);
        userId = jdbc.queryForObject("SELECT id FROM app_user WHERE email = ?", UUID.class, email);
        me = user(email);
        album = JsonPath.read(send(post("/api/albums"), "{\"title\":\"V\"}").getResponse().getContentAsString(), "$.id");
    }

    MvcResult send(MockHttpServletRequestBuilder request, String body) throws Exception {
        MockHttpServletRequestBuilder r = request.with(me).with(csrf()).contentType(MediaType.APPLICATION_JSON);
        if (body != null) r.content(body);
        return mvc.perform(r).andReturn();
    }

    Long clipOf(String mediaId) {
        return jdbc.queryForObject("SELECT clip_start_ms FROM media WHERE id = ?::uuid", Long.class, mediaId);
    }

    String upload(String name, String contentType, String clip) throws Exception {
        String sha = String.format("%064x", new java.math.BigInteger(1,
                java.security.MessageDigest.getInstance("SHA-256").digest(name.getBytes())));
        String res = send(post("/api/albums/" + album + "/uploads"), "{\"files\":[{\"clientId\":\"c\",\"filename\":\"" + name
                + "\",\"contentType\":\"" + contentType + "\",\"sizeBytes\":1000,\"sha256\":\"" + sha + "\""
                + (clip == null ? "" : ",\"clipStartMs\":" + clip) + "}]}").getResponse().getContentAsString();
        return JsonPath.read(res, "$.items[0].mediaId");
    }

    /** A processed video (as after the worker finished it). */
    UUID readyVideo() {
        Media m = new Media(UUID.randomUUID(), space, UUID.fromString(album), userId, MediaKind.VIDEO, "v.mov", "video/quicktime", 10, null, null);
        m.markUploaded(10);
        mediaRepository.saveAndFlush(m);
        jdbc.update("UPDATE media SET status = 'READY', duration_ms = 12000 WHERE id = ?", m.getId());
        return m.getId();
    }

    @Test
    void theStartChosenWhenUploadingIsKeptForVideosOnly() throws Exception {
        assertThat(clipOf(upload("a.mov", "video/quicktime", "4250"))).isEqualTo(4250L);
        assertThat(clipOf(upload("b.mov", "video/quicktime", null))).isNull();
        assertThat(clipOf(upload("c.jpg", "image/jpeg", "4250"))).isNull();
    }

    @Test
    void changingTheClipOfAProcessedVideoMakesTheWorkerCutItAgain() throws Exception {
        UUID video = readyVideo();
        MvcResult res = send(put("/api/media/" + video + "/clip"), "{\"startMs\":6000}");
        assertThat(res.getResponse().getStatus()).isEqualTo(200);
        assertThat(clipOf(video.toString())).isEqualTo(6000L);
        assertThat(JsonPath.<String>read(res.getResponse().getContentAsString(), "$.status")).isEqualTo("UPLOADED");

        // while it waits for the worker, another change is refused (the clip being cut would not match)
        assertThat(send(put("/api/media/" + video + "/clip"), "{\"startMs\":1000}").getResponse().getStatus()).isEqualTo(409);
    }

    @Test
    void back_toTheBeginningWithNull() throws Exception {
        UUID video = readyVideo();
        jdbc.update("UPDATE media SET clip_start_ms = 3000 WHERE id = ?", video);
        assertThat(send(put("/api/media/" + video + "/clip"), "{\"startMs\":null}").getResponse().getStatus()).isEqualTo(200);
        assertThat(clipOf(video.toString())).isNull();
    }

    @Test
    void photosAndUnknownMediaHaveNoClip() throws Exception {
        Media photo = new Media(UUID.randomUUID(), space, UUID.fromString(album), userId, MediaKind.IMAGE, "p.jpg", "image/jpeg", 10, null, null);
        photo.markUploaded(10);
        mediaRepository.saveAndFlush(photo);
        jdbc.update("UPDATE media SET status = 'READY' WHERE id = ?", photo.getId());
        assertThat(send(put("/api/media/" + photo.getId() + "/clip"), "{\"startMs\":1000}").getResponse().getStatus()).isEqualTo(400);
        assertThat(send(put("/api/media/" + UUID.randomUUID() + "/clip"), "{\"startMs\":1000}").getResponse().getStatus()).isEqualTo(404);
    }

    @Test
    void aStartPastTheEndOfTheVideoIsRefused() throws Exception {
        UUID video = readyVideo(); // 12 s long
        assertThat(send(put("/api/media/" + video + "/clip"), "{\"startMs\":12001}").getResponse().getStatus()).isEqualTo(400);
        assertThat(send(put("/api/media/" + video + "/clip"), "{\"startMs\":-1}").getResponse().getStatus()).isEqualTo(400);
    }
}
