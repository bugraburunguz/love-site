package com.lovesite.calendar;

import com.lovesite.system.ApiException;
import com.lovesite.user.CurrentUser;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

import java.time.LocalDate;
import java.time.MonthDay;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Set;
import java.util.UUID;

/**
 * The couple's special days (first meeting, anniversary, moving day ...): either yearly (same month and day every year from
 * the first one on; 29 February falls on 28 February in other years) or once. Scoped by space in every query.
 */
@Service
public class SpecialDayService {

    public static final Set<String> ICONS = Set.of("heart", "ring", "cake", "plane", "star", "home");
    static final LocalDate MIN = LocalDate.of(1900, 1, 1);
    static final LocalDate MAX = LocalDate.of(2100, 12, 31);

    public record SpecialDay(UUID id, String title, LocalDate day, String icon, boolean yearly) {
    }

    /** One occurrence on a calendar day; `years` = how many years since the first one (0 on the first day itself). */
    public record Occurrence(UUID id, String title, String icon, LocalDate date, boolean yearly, int years) {
    }

    public record SpecialDayRequest(String title, LocalDate day, String icon, Boolean yearly) {
    }

    private final JdbcTemplate jdbc;

    public SpecialDayService(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public List<SpecialDay> list(CurrentUser me) {
        return all(me.requireSpace());
    }

    List<SpecialDay> all(UUID spaceId) {
        return jdbc.query("SELECT id, title, day, icon, yearly FROM special_day WHERE space_id = ? ORDER BY to_char(day, 'MM-DD'), title",
                (rs, i) -> new SpecialDay(rs.getObject(1, UUID.class), rs.getString(2), rs.getObject(3, LocalDate.class), rs.getString(4),
                        rs.getBoolean(5)), spaceId);
    }

    public SpecialDay create(CurrentUser me, SpecialDayRequest r) {
        UUID spaceId = me.requireSpace();
        Valid v = validate(r);
        Integer count = jdbc.queryForObject("SELECT count(*) FROM special_day WHERE space_id = ?", Integer.class, spaceId);
        if (count != null && count >= 200) throw ApiException.badRequest("En fazla 200 özel gün eklenebilir");
        UUID id = jdbc.queryForObject("INSERT INTO special_day (space_id, title, day, icon, yearly, created_by) VALUES (?, ?, ?, ?, ?, ?) RETURNING id",
                UUID.class, spaceId, v.title, v.day, v.icon, v.yearly, me.userId());
        return new SpecialDay(id, v.title, v.day, v.icon, v.yearly);
    }

    public SpecialDay update(CurrentUser me, UUID id, SpecialDayRequest r) {
        UUID spaceId = me.requireSpace();
        Valid v = validate(r);
        int n = jdbc.update("UPDATE special_day SET title = ?, day = ?, icon = ?, yearly = ? WHERE id = ? AND space_id = ?",
                v.title, v.day, v.icon, v.yearly, id, spaceId);
        if (n == 0) throw ApiException.notFound("Özel gün bulunamadı");
        return new SpecialDay(id, v.title, v.day, v.icon, v.yearly);
    }

    public void delete(CurrentUser me, UUID id) {
        if (jdbc.update("DELETE FROM special_day WHERE id = ? AND space_id = ?", id, me.requireSpace()) == 0) {
            throw ApiException.notFound("Özel gün bulunamadı");
        }
    }

    private record Valid(String title, LocalDate day, String icon, boolean yearly) {
    }

    private static Valid validate(SpecialDayRequest r) {
        String title = r == null || r.title() == null ? "" : r.title().trim();
        if (title.isEmpty()) throw ApiException.badRequest("Bir ad yazın");
        if (title.length() > 80) throw ApiException.badRequest("Ad en fazla 80 karakter olabilir");
        if (r.day() == null || r.day().isBefore(MIN) || r.day().isAfter(MAX)) throw ApiException.badRequest("Geçersiz tarih");
        String icon = r.icon() == null ? "heart" : r.icon();
        if (!ICONS.contains(icon)) throw ApiException.badRequest("Geçersiz simge");
        return new Valid(title, r.day(), icon, r.yearly() == null || r.yearly());
    }

    /** Every occurrence between from and to (both included). */
    static List<Occurrence> occurrences(List<SpecialDay> days, LocalDate from, LocalDate to) {
        List<Occurrence> out = new ArrayList<>();
        for (SpecialDay d : days) {
            if (!d.yearly()) {
                if (!d.day().isBefore(from) && !d.day().isAfter(to)) out.add(new Occurrence(d.id(), d.title(), d.icon(), d.day(), false, 0));
                continue;
            }
            MonthDay md = MonthDay.from(d.day());
            for (int year = Math.max(from.getYear(), d.day().getYear()); year <= to.getYear(); year++) {
                LocalDate on = md.isValidYear(year) ? md.atYear(year) : LocalDate.of(year, 2, 28); // 29 Feb in other years
                if (on.isBefore(from) || on.isAfter(to) || on.isBefore(d.day())) continue;
                out.add(new Occurrence(d.id(), d.title(), d.icon(), on, true, year - d.day().getYear()));
            }
        }
        out.sort(Comparator.comparing(Occurrence::date).thenComparing(Occurrence::title));
        return out;
    }
}
