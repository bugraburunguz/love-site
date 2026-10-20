package com.lovesite.calendar;

import com.lovesite.calendar.SpecialDayService.SpecialDay;
import com.lovesite.calendar.SpecialDayService.SpecialDayRequest;
import com.lovesite.system.ApiException;
import com.lovesite.user.CurrentUser;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

@RestController
public class CalendarController {

    private final CalendarService calendar;
    private final SpecialDayService specialDays;

    public CalendarController(CalendarService calendar, SpecialDayService specialDays) {
        this.calendar = calendar;
        this.specialDays = specialDays;
    }

    @GetMapping("/api/calendar/months")
    public List<CalendarService.MonthCount> months(CurrentUser me, @RequestParam(required = false) UUID albumId) {
        return calendar.months(me, albumId);
    }

    @GetMapping("/api/calendar/month")
    public CalendarService.MonthView month(CurrentUser me, @RequestParam String month, @RequestParam(required = false) UUID albumId) {
        return calendar.month(me, month, albumId);
    }

    @GetMapping("/api/calendar/year")
    public CalendarService.YearView year(CurrentUser me, @RequestParam int year, @RequestParam(required = false) UUID albumId) {
        return calendar.year(me, year, albumId);
    }

    @GetMapping("/api/calendar/day")
    public CalendarService.DayView day(CurrentUser me, @RequestParam String date, @RequestParam(required = false) UUID albumId) {
        return calendar.day(me, parse(date), albumId);
    }

    /** date defaults to today in the app's time zone */
    @GetMapping("/api/calendar/on-this-day")
    public CalendarService.OnThisDay onThisDay(CurrentUser me, @RequestParam(required = false) String date,
                                               @RequestParam(required = false) UUID albumId) {
        return calendar.onThisDay(me, date == null ? LocalDate.now(calendar.zone()) : parse(date), albumId);
    }

    @GetMapping("/api/special-days")
    public List<SpecialDay> list(CurrentUser me) {
        return specialDays.list(me);
    }

    @PostMapping("/api/special-days")
    @ResponseStatus(HttpStatus.CREATED)
    public SpecialDay create(CurrentUser me, @RequestBody SpecialDayRequest request) {
        return specialDays.create(me, request);
    }

    @PutMapping("/api/special-days/{id}")
    public SpecialDay update(CurrentUser me, @PathVariable UUID id, @RequestBody SpecialDayRequest request) {
        return specialDays.update(me, id, request);
    }

    @DeleteMapping("/api/special-days/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void delete(CurrentUser me, @PathVariable UUID id) {
        specialDays.delete(me, id);
    }

    private static LocalDate parse(String date) {
        try {
            LocalDate d = LocalDate.parse(date);
            if (d.getYear() < 1900 || d.getYear() > 2100) throw ApiException.badRequest("Geçersiz tarih");
            return d;
        } catch (java.time.format.DateTimeParseException e) {
            throw ApiException.badRequest("Geçersiz tarih");
        }
    }
}
