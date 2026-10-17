package com.lovesite;

import ch.qos.logback.classic.Level;
import ch.qos.logback.classic.Logger;
import ch.qos.logback.classic.spi.ILoggingEvent;
import ch.qos.logback.core.read.ListAppender;
import com.jayway.jsonpath.JsonPath;
import org.junit.jupiter.api.Test;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.servlet.MockMvc;

import java.util.List;
import java.util.UUID;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;

/**
 * Walks through the flows that handle secrets (login, invitation, session cookie, presigned upload URLs, errors) with
 * the application's own loggers at DEBUG and checks that none of the secrets shows up in a log line, message or stack trace.
 */
@SpringBootTest
@AutoConfigureMockMvc
class LogHygieneTest {

    static final String PASSWORD = "Gizli-Sifre-Hijyen-4711";
    static final String WRONG_PASSWORD = "Yanlis-Sifre-Hijyen-0815";

    @DynamicPropertySource
    static void properties(DynamicPropertyRegistry r) {
        TestInfrastructure.register(r);
    }

    @Autowired MockMvc mvc;
    @Autowired JdbcTemplate jdbc;

    String all(ListAppender<ILoggingEvent> appender) {
        StringBuilder text = new StringBuilder();
        for (ILoggingEvent e : List.copyOf(appender.list)) {
            text.append(e.getFormattedMessage()).append('\n');
            text.append(e.getMDCPropertyMap()).append('\n');
            var t = e.getThrowableProxy();
            while (t != null) {
                text.append(t.getClassName()).append(": ").append(t.getMessage()).append('\n');
                t = t.getCause();
            }
        }
        return text.toString();
    }

    @Test
    void passwordsTokensCookiesAndPresignedSignaturesNeverReachTheLog() throws Exception {
        Logger root = (Logger) LoggerFactory.getLogger(Logger.ROOT_LOGGER_NAME);
        Logger app = (Logger) LoggerFactory.getLogger("com.lovesite");
        Level oldLevel = app.getLevel();
        ListAppender<ILoggingEvent> appender = new ListAppender<>();
        appender.start();
        root.addAppender(appender);
        app.setLevel(Level.DEBUG);
        try {
            String tag = UUID.randomUUID().toString().substring(0, 8);
            String adminEmail = "admin-" + tag + "@x.io";
            TenantFixtures.user(jdbc, adminEmail, "Admin", true);

            // an invitation, accepted: token + new password + session cookie
            var created = mvc.perform(post("/api/admin/spaces").contentType(MediaType.APPLICATION_JSON).with(csrf()).with(user(adminEmail))
                    .content("{\"name\":\"Hijyen\",\"limitGb\":5}")).andReturn().getResponse().getContentAsString();
            String token = JsonPath.read(created, "$.invitation.token");
            mvc.perform(get("/api/invites/" + token));
            String email = "kisi-" + tag + "@x.io";
            MockHttpServletResponse accepted = mvc.perform(post("/api/invites/" + token + "/accept").contentType(MediaType.APPLICATION_JSON).with(csrf())
                    .content("{\"displayName\":\"Kisi\",\"email\":\"" + email + "\",\"password\":\"" + PASSWORD + "\"}")).andReturn().getResponse();
            assertThat(accepted.getStatus()).isEqualTo(200);
            String sessionValue = accepted.getCookie("SESSION").getValue();

            // wrong and right login
            for (String pw : new String[] {WRONG_PASSWORD, PASSWORD}) {
                mvc.perform(post("/api/auth/login").contentType(MediaType.APPLICATION_JSON).with(csrf())
                        .content("{\"email\":\"" + email + "\",\"password\":\"" + pw + "\"}"));
            }
            // a bad invitation token
            mvc.perform(get("/api/invites/not-a-real-token-" + tag));

            // upload start gives presigned URLs
            var me = user(email);
            String album = JsonPath.read(mvc.perform(post("/api/albums").with(me).with(csrf()).contentType(MediaType.APPLICATION_JSON)
                    .content("{\"title\":\"H\"}")).andReturn().getResponse().getContentAsString(), "$.id");
            String uploads = mvc.perform(post("/api/albums/" + album + "/uploads").with(me).with(csrf()).contentType(MediaType.APPLICATION_JSON)
                    .content("{\"files\":[{\"clientId\":\"c1\",\"filename\":\"a.jpg\",\"contentType\":\"image/jpeg\",\"sizeBytes\":100,\"sha256\":\"" + "ab".repeat(32) + "\"}]}"))
                    .andReturn().getResponse().getContentAsString();
            String uploadUrl = JsonPath.read(uploads, "$.items[0].uploadUrl");
            Matcher signature = Pattern.compile("X-Amz-Signature=([0-9a-f]+)").matcher(uploadUrl);
            assertThat(signature.find()).as("the test URL is really presigned").isTrue();

            // completing something that was never uploaded and a request that blows up
            mvc.perform(post("/api/media/" + UUID.randomUUID() + "/complete").with(me).with(csrf()));
            mvc.perform(post("/api/albums").with(me).with(csrf()).contentType(MediaType.APPLICATION_JSON).content("{ not json"));

            LoggerFactory.getLogger("com.lovesite.hygiene").debug("canary line to prove the capture works");
            String logs = all(appender);
            assertThat(logs).as("the capture works").contains("canary line");
            assertThat(logs).doesNotContain(PASSWORD).doesNotContain(WRONG_PASSWORD);
            assertThat(logs).doesNotContain(token);
            assertThat(logs).doesNotContain(sessionValue);
            assertThat(logs).doesNotContain(signature.group(1)).doesNotContain("X-Amz-Signature").doesNotContain("X-Amz-Credential");
            assertThat(logs).doesNotContain(TestInfrastructure.S3_SECRET);
            assertThat(logs).doesNotContain("SESSION=").doesNotContain("XSRF-TOKEN=").doesNotContain("Authorization");
            assertThat(logs).doesNotContain("$2a$").doesNotContain("$2b$"); // bcrypt hashes
        } finally {
            root.detachAppender(appender);
            app.setLevel(oldLevel);
        }
    }

    /** Static guard next to the runtime one: no log statement in the code may pass a secret as an argument. */
    @Test
    void noLogStatementInTheSourceMentionsASecret() throws Exception {
        Pattern statement = Pattern.compile("\\blog\\.(?:trace|debug|info|warn|error)\\((.*?)\\);", Pattern.DOTALL);
        Pattern forbidden = Pattern.compile("password|passwd|secret|token|signature|cookie|presign|uploadUrl|authorization|credential|sha256",
                Pattern.CASE_INSENSITIVE);
        List<String> offenders = new java.util.ArrayList<>();
        try (var files = java.nio.file.Files.walk(java.nio.file.Path.of("src/main/java"))) {
            for (var file : files.filter(f -> f.toString().endsWith(".java")).toList()) {
                String source = java.nio.file.Files.readString(file);
                Matcher m = statement.matcher(source);
                while (m.find()) {
                    // the words of the message text are fine; what must not appear are variables / calls that carry a secret
                    String arguments = m.group(1).replaceAll("\"(?:[^\"\\\\]|\\\\.)*\"", "\"\"");
                    Matcher bad = forbidden.matcher(arguments);
                    if (bad.find()) offenders.add(file.getFileName() + ": " + m.group(1).strip().replaceAll("\\s+", " ") + "  <- " + bad.group());
                }
            }
        }
        assertThat(offenders).isEmpty();
    }
}
