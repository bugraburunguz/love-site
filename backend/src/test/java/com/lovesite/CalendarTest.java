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

import java.sql.Timestamp;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;

/** Calendar views, hand-set dates and special days; all scoped by space. */
@SpringBootTest
@AutoConfigureMockMvc
class CalendarTest {

    @DynamicPropertySource
    static void properties(DynamicPropertyRegistry r) {
        TestInfrastructure.register(r);
    }

    @Autowired MockMvc mvc;
    @Autowired JdbcTemplate jdbc;

    RequestPostProcessor me;
    RequestPostProcessor outsider;
    UUID space;
    UUID other;
    UUID userId;
    UUID album;
    UUID album2;
    UUID foreignAlbum;

    @BeforeEach
    void setUp() {
        String tag = UUID.randomUUID().toString().substring(0, 8);
        space = TenantFixtures.spaceWithOwner(jdbc, "Cal", TenantFixtures.GIB, "cal-" + tag + "@x.io");
        other = TenantFixtures.spaceWithOwner(jdbc, "Cal other", TenantFixtures.GIB, "cal-out-" + tag + "@x.io");
        userId = jdbc.queryForObject("SELECT user_id FROM space_member WHERE space_id = ?", UUID.class, space);
        me = user("cal-" + tag + "@x.io");
        outsider = user("cal-out-" + tag + "@x.io");
        album = album(space, "Deniz");
        album2 = album(space, "Kar");
        foreignAlbum = album(other, "Gizli");
    }

    UUID album(UUID spaceId, String title) {
        UUID owner = jdbc.queryForObject("SELECT user_id FROM space_member WHERE space_id = ? LIMIT 1", UUID.class, spaceId);
        return jdbc.queryForObject("INSERT INTO album (title, created_by, space_id) VALUES (?, ?, ?) RETURNING id", UUID.class, title, owner, spaceId);
    }

    /** a READY photo with the given dates (null = unknown) */
    UUID media(UUID spaceId, UUID albumId, String takenAt, String clientModified, String created) {
        UUID owner = jdbc.queryForObject("SELECT user_id FROM space_member WHERE space_id = ? LIMIT 1", UUID.class, spaceId);
        return jdbc.queryForObject("INSERT INTO media (album_id, uploaded_by, type, status, original_key, original_filename, content_type, size_bytes, space_id, "
                        + "thumb_key, display_key, taken_at, client_modified_at, created_at) VALUES (?, ?, 'IMAGE', 'READY', 'k', 'f.jpg', 'image/jpeg', 1, ?, "
                        + "'t/thumb.webp', 't/display.webp', ?, ?, ?) RETURNING id", UUID.class,
                albumId, owner, spaceId, ts(takenAt), ts(clientModified), ts(created == null ? "2026-10-01T10:00:00Z" : created));
    }

    static Timestamp ts(String instant) {
        return instant == null ? null : Timestamp.from(Instant.parse(instant));
    }

    MvcResult send(MockHttpServletRequestBuilder request, RequestPostProcessor who, String body) throws Exception {
        MockHttpServletRequestBuilder r = request.with(who).with(csrf()).contentType(MediaType.APPLICATION_JSON);
        if (body != null) r.content(body);
        return mvc.perform(r).andReturn();
    }

    String ok(MockHttpServletRequestBuilder request, String body) throws Exception {
        MvcResult res = send(request, me, body);
        assertThat(res.getResponse().getStatus()).as(res.getResponse().getContentAsString()).isBetween(200, 204);
        return res.getResponse().getContentAsString();
    }

    @Test
    void daysFollowIstanbulTimeAndTheDatePriority() throws Exception {
        // 21:30 UTC on 14 March is 00:30 on 15 March in Istanbul
        UUID late = media(space, album, "2026-03-14T21:30:00Z", null, null);
        // no EXIF: the device time decides, and it is marked uncertain
        UUID device = media(space, album, null, "2026-03-20T09:00:00Z", null);
        // nothing but the upload time
        UUID upload = media(space, album2, null, null, "2026-03-20T12:00:00Z");
        String month = ok(get("/api/calendar/month?month=2026-03"), null);
        assertThat((List<String>) JsonPath.read(month, "$.days[*].date")).containsExactly("2026-03-15", "2026-03-20");
        assertThat((Integer) JsonPath.read(month, "$.days[0].count")).isEqualTo(1);
        assertThat((Boolean) JsonPath.read(month, "$.days[0].uncertain")).isFalse();
        assertThat((Integer) JsonPath.read(month, "$.days[1].count")).isEqualTo(2);
        assertThat((Boolean) JsonPath.read(month, "$.days[1].uncertain")).isTrue();
        assertThat((String) JsonPath.read(month, "$.days[0].cover.id")).isEqualTo(late.toString());
        assertThat((String) JsonPath.read(month, "$.days[0].cover.thumbUrl")).contains("thumb.webp");

        String day = ok(get("/api/calendar/day?date=2026-03-20"), null);
        assertThat((List<String>) JsonPath.read(day, "$.media[*].media.id")).containsExactly(device.toString(), upload.toString());
        assertThat((List<String>) JsonPath.read(day, "$.media[*].albumTitle")).containsExactly("Deniz", "Kar");
        assertThat((Boolean) JsonPath.read(day, "$.media[0].media.dateUncertain")).isTrue();

        // album filter
        assertThat((List<String>) JsonPath.read(ok(get("/api/calendar/day?date=2026-03-20&albumId=" + album2), null), "$.media[*].media.id"))
                .containsExactly(upload.toString());
        // year and month list
        String year = ok(get("/api/calendar/year?year=2026"), null);
        assertThat((Integer) JsonPath.read(year, "$.days['2026-03-20']")).isEqualTo(2);
        assertThat((Integer) JsonPath.read(year, "$.days['2026-03-15']")).isEqualTo(1);
        assertThat((List<String>) JsonPath.read(ok(get("/api/calendar/months"), null), "$[*].month")).contains("2026-03");
    }

    @Test
    void aHandSetDateWinsAndCanBeUndone() throws Exception {
        UUID m = media(space, album, null, null, "2026-03-20T12:00:00Z");
        String set = ok(put("/api/media/" + m + "/date"), "{\"takenAt\":\"2024-07-01T16:45:00Z\"}");
        assertThat((String) JsonPath.read(set, "$.displayDate")).startsWith("2024-07-01T16:45");
        assertThat((Boolean) JsonPath.read(set, "$.dateUncertain")).isFalse();
        assertThat((Boolean) JsonPath.read(set, "$.dateOverridden")).isTrue();
        assertThat((String) JsonPath.read(set, "$.originalDate")).startsWith("2026-03-20T12:00");
        assertThat((List<String>) JsonPath.read(ok(get("/api/calendar/day?date=2024-07-01"), null), "$.media[*].media.id")).containsExactly(m.toString());
        assertThat((List<Object>) JsonPath.read(ok(get("/api/calendar/day?date=2026-03-20"), null), "$.media")).isEmpty();
        // the album shows the same date
        assertThat((String) JsonPath.read(ok(get("/api/albums/" + album + "/media"), null), "$[0].displayDate")).startsWith("2024-07-01T16:45");

        String undone = ok(put("/api/media/" + m + "/date"), "{\"takenAt\":null}");
        assertThat((String) JsonPath.read(undone, "$.displayDate")).startsWith("2026-03-20T12:00");
        assertThat((Boolean) JsonPath.read(undone, "$.dateOverridden")).isFalse();

        assertThat(send(put("/api/media/" + m + "/date"), me, "{\"takenAt\":\"2999-01-01T00:00:00Z\"}").getResponse().getStatus()).isEqualTo(400);
    }

    @Test
    void anotherSpaceSeesNothingAndChangesNothing() throws Exception {
        UUID mine = media(space, album, "2026-05-05T10:00:00Z", null, null);
        UUID theirs = media(other, foreignAlbum, "2026-05-05T11:00:00Z", null, null);
        assertThat((List<String>) JsonPath.read(ok(get("/api/calendar/day?date=2026-05-05"), null), "$.media[*].media.id"))
                .containsExactly(mine.toString());
        assertThat(send(get("/api/calendar/month?month=2026-05&albumId=" + foreignAlbum), me, null).getResponse().getStatus()).isEqualTo(404);
        assertThat(send(get("/api/calendar/day?date=2026-05-05&albumId=" + foreignAlbum), me, null).getResponse().getStatus()).isEqualTo(404);
        assertThat(send(put("/api/media/" + theirs + "/date"), me, "{\"takenAt\":\"2020-01-01T00:00:00Z\"}").getResponse().getStatus()).isEqualTo(404);
        assertThat(jdbc.queryForObject("SELECT date_override FROM media WHERE id = ?", Timestamp.class, theirs)).isNull();
        // deleted media and deleted albums are not in the calendar
        jdbc.update("UPDATE media SET deleted_at = now() WHERE id = ?", mine);
        assertThat((List<Object>) JsonPath.read(ok(get("/api/calendar/day?date=2026-05-05"), null), "$.media")).isEmpty();
        assertThat(send(get("/api/calendar/month?month=2026-13"), me, null).getResponse().getStatus()).isEqualTo(400);
        assertThat(send(get("/api/calendar/day?date=yarin"), me, null).getResponse().getStatus()).isEqualTo(400);
    }

    @Test
    void onThisDayAndSpecialDays() throws Exception {
        UUID oneYear = media(space, album, "2025-10-20T08:00:00Z", null, null);
        UUID twoYears = media(space, album, "2024-10-20T08:00:00Z", null, null);
        media(space, album, "2024-10-21T08:00:00Z", null, null); // another day
        media(space, album, "2026-10-20T08:00:00Z", null, null); // this year: not "in the past"
        ok(post("/api/special-days"), "{\"title\":\"Tanışma günümüz\",\"day\":\"2023-10-20\",\"icon\":\"heart\",\"yearly\":true}");
        ok(post("/api/special-days"), "{\"title\":\"Taşınma\",\"day\":\"2026-10-20\",\"icon\":\"home\",\"yearly\":false}");
        String today = ok(get("/api/calendar/on-this-day?date=2026-10-20"), null);
        assertThat((List<Integer>) JsonPath.read(today, "$.past[*].yearsAgo")).containsExactly(1, 2);
        assertThat((List<String>) JsonPath.read(today, "$.past[0].media[*].media.id")).containsExactly(oneYear.toString());
        assertThat((List<String>) JsonPath.read(today, "$.past[1].media[*].media.id")).containsExactly(twoYears.toString());
        assertThat((List<String>) JsonPath.read(today, "$.specialDays[*].title")).containsExactlyInAnyOrder("Tanışma günümüz", "Taşınma");
        assertThat((List<Integer>) JsonPath.read(today, "$.specialDays[?(@.title == 'Tanışma günümüz')].years")).containsExactly(3);

        // yearly days show every year from the first one on, one-off days once; 29 February falls on the 28th in other years
        ok(post("/api/special-days"), "{\"title\":\"Artık gün\",\"day\":\"2024-02-29\",\"icon\":\"star\",\"yearly\":true}");
        assertThat((List<String>) JsonPath.read(ok(get("/api/calendar/month?month=2026-02"), null), "$.specialDays[*].date")).containsExactly("2026-02-28");
        assertThat((List<Object>) JsonPath.read(ok(get("/api/calendar/month?month=2022-10"), null), "$.specialDays")).isEmpty();
        assertThat((List<String>) JsonPath.read(ok(get("/api/calendar/year?year=2027"), null), "$.specialDays[*].title"))
                .containsExactly("Artık gün", "Tanışma günümüz");
    }

    @Test
    void specialDaysCrudValidationAndIdor() throws Exception {
        String created = ok(post("/api/special-days"), "{\"title\":\"Yıldönümü\",\"day\":\"2022-06-12\",\"icon\":\"ring\",\"yearly\":true}");
        String id = JsonPath.read(created, "$.id");
        ok(put("/api/special-days/" + id), "{\"title\":\"Evlilik yıldönümü\",\"day\":\"2022-06-12\",\"icon\":\"ring\",\"yearly\":true}");
        assertThat((List<String>) JsonPath.read(ok(get("/api/special-days"), null), "$[*].title")).containsExactly("Evlilik yıldönümü");

        for (String bad : new String[] {
                "{\"title\":\"\",\"day\":\"2022-06-12\",\"icon\":\"ring\"}",
                "{\"title\":\"x\",\"day\":\"1800-01-01\",\"icon\":\"ring\"}",
                "{\"title\":\"x\",\"day\":\"2022-06-12\",\"icon\":\"skull\"}"}) {
            assertThat(send(post("/api/special-days"), me, bad).getResponse().getStatus()).as(bad).isEqualTo(400);
        }
        // another space: does not see it, cannot change or delete it
        assertThat((List<Object>) JsonPath.read(send(get("/api/special-days"), outsider, null).getResponse().getContentAsString(), "$")).isEmpty();
        assertThat(send(put("/api/special-days/" + id), outsider, "{\"title\":\"x\",\"day\":\"2022-06-12\",\"icon\":\"ring\"}").getResponse().getStatus()).isEqualTo(404);
        assertThat(send(delete("/api/special-days/" + id), outsider, null).getResponse().getStatus()).isEqualTo(404);
        assertThat((List<String>) JsonPath.read(ok(get("/api/special-days"), null), "$[*].title")).containsExactly("Evlilik yıldönümü");
        ok(delete("/api/special-days/" + id), null);
        assertThat((List<Object>) JsonPath.read(ok(get("/api/special-days"), null), "$")).isEmpty();
        assertThat(Map.of()).isEmpty();
    }
}
