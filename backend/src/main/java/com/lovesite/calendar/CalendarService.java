package com.lovesite.calendar;

import com.lovesite.calendar.SpecialDayService.Occurrence;
import com.lovesite.media.Media;
import com.lovesite.media.MediaDtos.MediaResponse;
import com.lovesite.media.MediaRepository;
import com.lovesite.media.MediaService;
import com.lovesite.media.MediaStatus;
import com.lovesite.media.processing.ProcessingProperties;
import com.lovesite.storage.StorageService;
import com.lovesite.system.ApiException;
import com.lovesite.user.CurrentUser;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

import java.sql.Timestamp;
import java.time.Instant;
import java.time.LocalDate;
import java.time.YearMonth;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * The calendar: photos and videos of all albums of the caller's space (or of one album) by the date the app shows for them
 * (hand-set > capture > device file time > upload). A day is a calendar day in the app's time zone (Europe/Istanbul), so a
 * photo taken at 00:30 in Istanbul is on that day, not on the UTC day before. Everything is scoped by space in the query;
 * an album id of another space is a 404 like everywhere.
 */
@Service
public class CalendarService {

    static final String SHOWN = "coalesce(m.date_override, m.taken_at, m.client_modified_at, m.created_at)";
    private static final String LISTED = "('UPLOADED','PROCESSING','READY','FAILED')";
    private static final List<MediaStatus> LISTED_STATUSES =
            List.of(MediaStatus.UPLOADED, MediaStatus.PROCESSING, MediaStatus.READY, MediaStatus.FAILED);

    public record MonthCount(String month, int count) {
    }

    public record Cover(UUID id, String type, String thumbUrl) {
    }

    public record DaySummary(LocalDate date, int count, boolean uncertain, Cover cover) {
    }

    public record MonthView(String month, List<DaySummary> days, List<Occurrence> specialDays) {
    }

    public record YearView(int year, Map<LocalDate, Integer> days, List<Occurrence> specialDays) {
    }

    public record DayMedia(MediaResponse media, String albumTitle) {
    }

    public record DayView(LocalDate date, List<DayMedia> media, List<Occurrence> specialDays) {
    }

    /** "n years ago today": a few photos of that day, how many there are in total */
    public record PastDay(int yearsAgo, LocalDate date, int count, List<DayMedia> media) {
    }

    public record OnThisDay(LocalDate date, List<PastDay> past, List<Occurrence> specialDays) {
    }

    private record Row(UUID id, UUID albumId, Instant shown, String type, String status, String thumbKey, String posterKey, boolean uncertain) {
    }

    private final JdbcTemplate jdbc;
    private final MediaRepository mediaRepository;
    private final MediaService mediaService;
    private final StorageService storage;
    private final SpecialDayService specialDays;
    private final ZoneId zone;

    public CalendarService(JdbcTemplate jdbc, MediaRepository mediaRepository, MediaService mediaService, StorageService storage,
                           SpecialDayService specialDays, ProcessingProperties processing) {
        this.jdbc = jdbc;
        this.mediaRepository = mediaRepository;
        this.mediaService = mediaService;
        this.storage = storage;
        this.specialDays = specialDays;
        this.zone = processing.defaultTimezone();
    }

    public ZoneId zone() {
        return zone;
    }

    // ------------------------------------------------------------------ views

    /** Every month that has photos (for the "previous / next memory" buttons and the year list). */
    public List<MonthCount> months(CurrentUser me, UUID albumId) {
        UUID spaceId = me.requireSpace();
        Filter f = filter(spaceId, albumId);
        return jdbc.query("SELECT to_char(" + SHOWN + " AT TIME ZONE ?, 'YYYY-MM') AS month, count(*) " + from(f) + " GROUP BY 1 ORDER BY 1",
                (rs, i) -> new MonthCount(rs.getString(1), rs.getInt(2)), args(f, zone.getId()));
    }

    public MonthView month(CurrentUser me, String month, UUID albumId) {
        UUID spaceId = me.requireSpace();
        YearMonth ym = parseMonth(month);
        Filter f = filter(spaceId, albumId);
        List<Row> rows = rows(f, ym.atDay(1), ym.atEndOfMonth());
        Map<LocalDate, List<Row>> byDay = new LinkedHashMap<>();
        for (Row r : rows) byDay.computeIfAbsent(r.shown().atZone(zone).toLocalDate(), d -> new ArrayList<>()).add(r);
        List<DaySummary> days = new ArrayList<>();
        byDay.forEach((date, list) -> days.add(new DaySummary(date, list.size(), list.stream().anyMatch(Row::uncertain), cover(list))));
        days.sort(Comparator.comparing(DaySummary::date));
        return new MonthView(ym.toString(), days, SpecialDayService.occurrences(specialDays.all(spaceId), ym.atDay(1), ym.atEndOfMonth()));
    }

    public YearView year(CurrentUser me, int year, UUID albumId) {
        UUID spaceId = me.requireSpace();
        if (year < 1900 || year > 2100) throw ApiException.badRequest("Geçersiz yıl");
        Filter f = filter(spaceId, albumId);
        LocalDate first = LocalDate.of(year, 1, 1);
        LocalDate last = LocalDate.of(year, 12, 31);
        Map<LocalDate, Integer> days = new LinkedHashMap<>();
        jdbc.query("SELECT (" + SHOWN + " AT TIME ZONE ?)::date AS d, count(*) " + from(f) + " AND " + SHOWN + " >= ? AND " + SHOWN + " < ? GROUP BY 1 ORDER BY 1",
                rs -> { days.put(rs.getObject(1, LocalDate.class), rs.getInt(2)); },
                args(f, zone.getId(), start(first), start(last.plusDays(1))));
        return new YearView(year, days, SpecialDayService.occurrences(specialDays.all(spaceId), first, last));
    }

    public DayView day(CurrentUser me, LocalDate date, UUID albumId) {
        UUID spaceId = me.requireSpace();
        Filter f = filter(spaceId, albumId);
        List<DayMedia> media = mediaOf(spaceId, rows(f, date, date), Integer.MAX_VALUE);
        return new DayView(date, media, SpecialDayService.occurrences(specialDays.all(spaceId), date, date));
    }

    /** The same month and day in earlier years (29 February also shows on 28 February in other years). */
    public OnThisDay onThisDay(CurrentUser me, LocalDate today, UUID albumId) {
        UUID spaceId = me.requireSpace();
        Filter f = filter(spaceId, albumId);
        List<Row> rows = jdbc.query("SELECT " + ROW_COLUMNS + " " + from(f)
                        + " AND to_char(" + SHOWN + " AT TIME ZONE ?, 'MM-DD') = ? AND " + SHOWN + " < ? ORDER BY " + SHOWN,
                (rs, i) -> row(rs), args(f, null, zone.getId(), String.format("%02d-%02d", today.getMonthValue(), today.getDayOfMonth()), start(today.withDayOfYear(1))));
        Map<Integer, List<Row>> byYear = new LinkedHashMap<>();
        for (Row r : rows) byYear.computeIfAbsent(r.shown().atZone(zone).getYear(), y -> new ArrayList<>()).add(r);
        List<PastDay> past = new ArrayList<>();
        byYear.entrySet().stream().sorted(Map.Entry.<Integer, List<Row>>comparingByKey().reversed()).forEach(e -> {
            LocalDate on = today.withYear(e.getKey());
            past.add(new PastDay(today.getYear() - e.getKey(), on, e.getValue().size(), mediaOf(spaceId, e.getValue(), 8)));
        });
        return new OnThisDay(today, past, SpecialDayService.occurrences(specialDays.all(spaceId), today, today));
    }

    // ------------------------------------------------------------------ helpers

    private record Filter(UUID spaceId, UUID albumId) {
    }

    /** Arguments in placeholder order: the SELECT's time zone (when it has one), the space (and album), then the rest. */
    private static Object[] args(Filter f, Object selectZone, Object... rest) {
        List<Object> all = new ArrayList<>();
        if (selectZone != null) all.add(selectZone);
        all.add(f.spaceId());
        if (f.albumId() != null) all.add(f.albumId());
        all.addAll(List.of(rest));
        return all.toArray();
    }

    /** An album filter must be an album of this space (404 otherwise). */
    private Filter filter(UUID spaceId, UUID albumId) {
        if (albumId != null) {
            Integer found = jdbc.queryForObject("SELECT count(*) FROM album WHERE id = ? AND space_id = ? AND deleted_at IS NULL", Integer.class, albumId, spaceId);
            if (found == null || found == 0) throw ApiException.notFound("Albüm bulunamadı");
        }
        return new Filter(spaceId, albumId);
    }

    /** FROM ... WHERE with the space (and album) placeholders right after the zone placeholder of the SELECT. */
    private static String from(Filter f) {
        return "FROM media m JOIN album a ON a.id = m.album_id AND a.space_id = m.space_id "
                + "WHERE m.space_id = ?" + (f.albumId() != null ? " AND m.album_id = ?" : "")
                + " AND m.deleted_at IS NULL AND a.deleted_at IS NULL AND m.status IN " + LISTED;
    }

    private static final String ROW_COLUMNS = "m.id, m.album_id, " + SHOWN + ", m.type, m.status, m.thumb_key, m.poster_key, "
            + "(m.date_override IS NULL AND m.taken_at IS NULL)";

    private static Row row(java.sql.ResultSet rs) throws java.sql.SQLException {
        return new Row(rs.getObject(1, UUID.class), rs.getObject(2, UUID.class), rs.getTimestamp(3).toInstant(), rs.getString(4),
                rs.getString(5), rs.getString(6), rs.getString(7), rs.getBoolean(8));
    }

    private Timestamp start(LocalDate day) {
        return Timestamp.from(day.atStartOfDay(zone).toInstant());
    }

    /** media whose shown date falls on the days from..to (local), oldest first */
    private List<Row> rows(Filter f, LocalDate from, LocalDate to) {
        return jdbc.query("SELECT " + ROW_COLUMNS + " " + from(f) + " AND " + SHOWN + " >= ? AND " + SHOWN + " < ? ORDER BY " + SHOWN + ", m.id",
                (rs, i) -> row(rs), args(f, null, start(from), start(to.plusDays(1))));
    }

    private Cover cover(List<Row> day) {
        Row pick = day.stream().filter(r -> "READY".equals(r.status()) && (r.thumbKey() != null || r.posterKey() != null)).findFirst()
                .orElse(day.get(0));
        String key = pick.thumbKey() != null ? pick.thumbKey() : pick.posterKey();
        return new Cover(pick.id(), pick.type(), "READY".equals(pick.status()) && key != null ? storage.presignGet(key) : null);
    }

    private List<DayMedia> mediaOf(UUID spaceId, List<Row> rows, int limit) {
        List<UUID> ids = rows.stream().limit(limit).map(Row::id).toList();
        if (ids.isEmpty()) return List.of();
        Map<UUID, Media> byId = new LinkedHashMap<>();
        for (Media m : mediaRepository.findBySpaceIdAndIdInAndStatusInAndDeletedAtIsNull(spaceId, ids, LISTED_STATUSES)) byId.put(m.getId(), m);
        Map<UUID, String> titles = new LinkedHashMap<>();
        jdbc.query("SELECT id, title FROM album WHERE space_id = ? AND id = ANY(?)", rs -> { titles.put(rs.getObject(1, UUID.class), rs.getString(2)); },
                spaceId, rows.stream().map(Row::albumId).distinct().toArray(UUID[]::new));
        List<DayMedia> out = new ArrayList<>();
        for (UUID id : ids) {
            Media m = byId.get(id);
            if (m != null) out.add(new DayMedia(mediaService.toResponse(m), titles.get(m.getAlbumId())));
        }
        return out;
    }

    static YearMonth parseMonth(String month) {
        try {
            YearMonth ym = YearMonth.parse(month);
            if (ym.getYear() < 1900 || ym.getYear() > 2100) throw ApiException.badRequest("Geçersiz ay");
            return ym;
        } catch (java.time.format.DateTimeParseException | NullPointerException e) {
            throw ApiException.badRequest("Geçersiz ay");
        }
    }
}
