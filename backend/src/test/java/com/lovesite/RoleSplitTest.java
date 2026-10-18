package com.lovesite;

import com.lovesite.export.ExportQueue;
import com.lovesite.export.render.RenderTokens;
import com.lovesite.media.processing.MediaProcessingQueue;
import com.lovesite.role.AppRole;
import com.lovesite.role.RenderPort;
import com.lovesite.role.Roles;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/** web / worker split: what each role runs and answers, over real HTTP on both connectors. */
class RoleSplitTest {

    static final HttpClient HTTP = HttpClient.newHttpClient();

    static int status(String url) throws Exception {
        return HTTP.send(HttpRequest.newBuilder(URI.create(url)).GET().build(), HttpResponse.BodyHandlers.discarding()).statusCode();
    }

    @Test
    void roleParsing() {
        assertThat(AppRole.parse(null)).isEqualTo(AppRole.ALL);
        assertThat(AppRole.parse(" ")).isEqualTo(AppRole.ALL);
        assertThat(AppRole.parse("Worker")).isEqualTo(AppRole.WORKER);
        assertThatThrownBy(() -> AppRole.parse("both")).isInstanceOf(IllegalStateException.class);
        for (Roles.Job job : Roles.Job.values()) {
            assertThat(job.runsIn(AppRole.ALL)).as(job.name()).isTrue();
            // every job runs in exactly one of the two services
            assertThat(job.runsIn(AppRole.WEB) ^ job.runsIn(AppRole.WORKER)).as(job.name()).isTrue();
        }
    }

    @Nested
    @SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
    class Web {
        @DynamicPropertySource
        static void properties(DynamicPropertyRegistry r) {
            TestInfrastructure.register(r);
            r.add("app.role", () -> "web");
            // the pollers would run if the role allowed them
            r.add("app.processing.auto-poll", () -> "true");
            r.add("app.export.auto-poll", () -> "true");
        }

        @LocalServerPort int port;
        @Autowired MediaProcessingQueue media;
        @Autowired ExportQueue exports;
        @Autowired RenderTokens tokens;
        @Autowired RenderPort renderPort;
        @Autowired JdbcTemplate jdbc;

        @Test
        void noPollerNoRenderEndpointNoToken() throws Exception {
            assertThat(media.enabled()).isFalse();
            assertThat(exports.enabled()).isFalse();
            assertThat(tokens.enabled()).isFalse();
            assertThat(renderPort.actual()).isEqualTo(-1);
            assertThat(status("http://localhost:" + port + "/internal/render/" + UUID.randomUUID() + "?token=x")).isEqualTo(404);
            assertThat(status("http://localhost:" + port + "/render/" + UUID.randomUUID())).isEqualTo(404);
            // the public API is here
            assertThat(status("http://localhost:" + port + "/api/auth/me")).isEqualTo(401);
            assertThat(status("http://localhost:" + port + "/actuator/health/liveness")).isEqualTo(200);
        }

        @Test
        void uploadedMediaStaysQueuedForTheWorker() throws Exception {
            UUID space = TenantFixtures.spaceWithOwner(jdbc, "web-role", TenantFixtures.GIB, "web-" + UUID.randomUUID() + "@x.io");
            UUID user = jdbc.queryForObject("SELECT user_id FROM space_member WHERE space_id = ?", UUID.class, space);
            UUID album = jdbc.queryForObject("INSERT INTO album (title, created_by, space_id) VALUES ('a', ?, ?) RETURNING id", UUID.class, user, space);
            UUID m = jdbc.queryForObject("INSERT INTO media (album_id, uploaded_by, type, status, original_key, original_filename, content_type, size_bytes, space_id) "
                    + "VALUES (?, ?, 'IMAGE', 'UPLOADED', 'k', 'f.jpg', 'image/jpeg', 1, ?) RETURNING id", UUID.class, album, user, space);
            media.kick();
            Thread.sleep(4_000); // longer than the poll interval
            assertThat(jdbc.queryForObject("SELECT status FROM media WHERE id = ?", String.class, m)).isEqualTo("UPLOADED");
        }
    }

    @Nested
    @SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
    class Worker {
        @DynamicPropertySource
        static void properties(DynamicPropertyRegistry r) {
            TestInfrastructure.register(r);
            r.add("app.role", () -> "worker");
        }

        @LocalServerPort int port;
        @Autowired RenderTokens tokens;
        @Autowired RenderPort renderPort;
        @Autowired MediaProcessingQueue media;

        @Test
        void publicPortOnlyAnswersTheHealthCheck() throws Exception {
            assertThat(status("http://localhost:" + port + "/actuator/health/liveness")).isEqualTo(200);
            assertThat(status("http://localhost:" + port + "/api/auth/me")).isEqualTo(404);
            assertThat(status("http://localhost:" + port + "/api/albums")).isEqualTo(404);
            assertThat(status("http://localhost:" + port + "/")).isEqualTo(404);
            assertThat(status("http://localhost:" + port + "/internal/render/" + UUID.randomUUID() + "?token=x")).isEqualTo(404);
        }

        @Test
        void renderEndpointOnLoopbackWantsAValidToken() throws Exception {
            assertThat(renderPort.actual()).isPositive();
            assertThat(tokens.enabled()).isTrue();
            String base = renderPort.baseUrl();
            assertThat(base).startsWith("http://127.0.0.1:");
            UUID job = UUID.randomUUID();
            assertThat(status(base + "/internal/render/" + job + "?token=garbage")).isEqualTo(403);
            assertThat(status(base + "/internal/render/" + job)).isEqualTo(403);
            // a genuine token for a job that does not exist
            assertThat(status(base + "/internal/render/" + job + "?token=" + tokens.issue(job))).isEqualTo(404);
            // a token for another job does not open this one
            assertThat(status(base + "/internal/render/" + job + "?token=" + tokens.issue(UUID.randomUUID()))).isEqualTo(403);
            // the API does not exist on the render port either
            assertThat(status(base + "/api/auth/me")).isEqualTo(404);
            assertThat(status(base + "/actuator/health")).isEqualTo(404);
        }
    }
}
