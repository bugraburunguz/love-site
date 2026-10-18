package com.lovesite.export;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.boot.context.properties.bind.DefaultValue;

import java.time.Duration;

@ConfigurationProperties(prefix = "app.export")
public record ExportProperties(
        /** false stops the export poller (tests drive the queue by hand) */
        @DefaultValue("true") boolean autoPoll,
        @DefaultValue("3s") Duration pollInterval,
        /** exports rendered at the same time; Chromium + ffmpeg are heavy, so one unless configured otherwise */
        @DefaultValue("1") int concurrency,
        /** exports of one space that may be queued or running at the same time */
        @DefaultValue("3") int maxActivePerSpace,
        /** exports one space may start per 24 h (repeats of an existing result do not count) */
        @DefaultValue("40") int dailyLimit,
        /** results are deleted this long after they were made; they never count against the quota */
        @DefaultValue("24h") Duration ttl,
        /** time limit for one page load + screenshot in Chromium */
        @DefaultValue("60s") Duration pageTimeout,
        /** time limit for one ffmpeg / vips run */
        @DefaultValue("300s") Duration toolTimeout,
        /** a RUNNING export older than this belongs to a dead worker and goes back to the queue */
        @DefaultValue("30m") Duration staleAfter,
        @DefaultValue("2") int maxAttempts,
        /** the render driver (Node + Playwright); see renderer/ in the repository */
        @DefaultValue("node") String node,
        @DefaultValue("/app/renderer/driver.mjs") String driver,
        /** niceness of Chromium and the export ffmpeg runs: exports must never slow down the site or the media queue */
        @DefaultValue("10") int nice) {
}
