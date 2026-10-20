package com.lovesite.calendar;

import com.lovesite.system.ApiException;
import com.lovesite.user.CurrentUser;
import com.lovesite.user.DisplayNames;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * Day notes: a diary line for a calendar day, one per person. Everybody writes and changes only their own note and reads the
 * partner's. Notes belong to the day, not to an album, so the album filter of the calendar does not hide them. Space-scoped.
 */
@Service
public class DayNoteService {

    public static final int MAX_LENGTH = 5000;

    /** mine: written by the caller (editable) */
    public record Note(UUID authorId, String authorName, String body, Instant updatedAt, boolean mine) {
    }

    public record NoteRequest(String body) {
    }

    private static final Comparator<Note> MINE_FIRST = Comparator.comparing((Note n) -> !n.mine()).thenComparing(Note::authorName);

    private final JdbcTemplate jdbc;
    private final DisplayNames names;

    public DayNoteService(JdbcTemplate jdbc, DisplayNames names) {
        this.jdbc = jdbc;
        this.names = names;
    }

    /** Notes of the days from..to (both included), mine first on every day. */
    Map<LocalDate, List<Note>> between(CurrentUser me, LocalDate from, LocalDate to) {
        Map<LocalDate, List<Note>> out = new LinkedHashMap<>();
        jdbc.query("SELECT day, author_id, body, updated_at FROM day_note WHERE space_id = ? AND day BETWEEN ? AND ? ORDER BY day",
                rs -> {
                    UUID author = rs.getObject(2, UUID.class);
                    out.computeIfAbsent(rs.getObject(1, LocalDate.class), d -> new ArrayList<>())
                            .add(new Note(author, names.of(author), rs.getString(3), rs.getTimestamp(4).toInstant(), author.equals(me.userId())));
                }, me.requireSpace(), from, to);
        out.values().forEach(list -> list.sort(MINE_FIRST));
        return out;
    }

    List<Note> on(CurrentUser me, LocalDate day) {
        return between(me, day, day).getOrDefault(day, List.of());
    }

    /** Same month and day in earlier years (for "n years ago today"). */
    Map<LocalDate, List<Note>> sameDayBefore(CurrentUser me, LocalDate today) {
        Map<LocalDate, List<Note>> out = new LinkedHashMap<>();
        jdbc.query("SELECT day, author_id, body, updated_at FROM day_note WHERE space_id = ? AND to_char(day, 'MM-DD') = ? AND day < ? ORDER BY day DESC",
                rs -> {
                    UUID author = rs.getObject(2, UUID.class);
                    out.computeIfAbsent(rs.getObject(1, LocalDate.class), d -> new ArrayList<>())
                            .add(new Note(author, names.of(author), rs.getString(3), rs.getTimestamp(4).toInstant(), author.equals(me.userId())));
                }, me.requireSpace(), String.format("%02d-%02d", today.getMonthValue(), today.getDayOfMonth()), today.withDayOfYear(1));
        out.values().forEach(list -> list.sort(MINE_FIRST));
        return out;
    }

    /** Months (YYYY-MM) that have notes. */
    List<String> months(CurrentUser me) {
        return jdbc.query("SELECT DISTINCT to_char(day, 'YYYY-MM') FROM day_note WHERE space_id = ? ORDER BY 1", (rs, i) -> rs.getString(1), me.requireSpace());
    }

    /** Writes (or, with an empty text, removes) the caller's own note of that day. Returns null when it was removed. */
    public Note save(CurrentUser me, LocalDate day, String body) {
        UUID spaceId = me.requireSpace();
        String text = body == null ? "" : body.strip();
        if (text.length() > MAX_LENGTH) throw ApiException.badRequest("Not en fazla " + MAX_LENGTH + " karakter olabilir");
        if (text.isEmpty()) {
            jdbc.update("DELETE FROM day_note WHERE space_id = ? AND author_id = ? AND day = ?", spaceId, me.userId(), day);
            return null;
        }
        Instant at = jdbc.queryForObject("INSERT INTO day_note (space_id, author_id, day, body) VALUES (?, ?, ?, ?) "
                + "ON CONFLICT (space_id, author_id, day) DO UPDATE SET body = excluded.body, updated_at = now() RETURNING updated_at",
                (rs, i) -> rs.getTimestamp(1).toInstant(), spaceId, me.userId(), day, text);
        return new Note(me.userId(), names.of(me.userId()), text, at, true);
    }
}
