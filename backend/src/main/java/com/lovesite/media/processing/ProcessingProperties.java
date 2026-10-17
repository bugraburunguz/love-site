package com.lovesite.media.processing;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.boot.context.properties.bind.DefaultValue;

import java.time.Duration;
import java.time.ZoneId;
import java.util.List;

@ConfigurationProperties(prefix = "app.processing")
public record ProcessingProperties(
        /** false stops the scheduled poller and the post-upload kick (tests drive the queue by hand). */
        @DefaultValue("true") boolean autoPoll,
        /** ffmpeg is heavy and the host is small: one job at a time unless configured otherwise. */
        @DefaultValue("1") int concurrency,
        /** A job that stays PROCESSING this long (crash, restart) is put back in the queue. */
        @DefaultValue("15m") Duration staleAfter,
        @DefaultValue("3") int maxAttempts,
        /** Wait before the next attempt, indexed by the number of failures so far (the last entry repeats). */
        @DefaultValue({"1m", "5m", "15m"}) List<Duration> backoff,
        @DefaultValue("60s") Duration photoTimeout,
        @DefaultValue("180s") Duration videoTimeout,
        /** Used for EXIF dates that carry no UTC offset. */
        @DefaultValue("Europe/Istanbul") ZoneId defaultTimezone,
        @DefaultValue("ffmpeg") String ffmpeg,
        @DefaultValue("ffprobe") String ffprobe,
        @DefaultValue("vips") String vips,
        @DefaultValue("vipsheader") String vipsheader) {

    public Duration backoffAfter(int failures) {
        if (backoff.isEmpty()) return Duration.ofMinutes(1);
        return backoff.get(Math.min(Math.max(failures, 1), backoff.size()) - 1);
    }
}
