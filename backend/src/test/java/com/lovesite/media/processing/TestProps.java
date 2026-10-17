package com.lovesite.media.processing;

import java.time.Duration;
import java.time.ZoneId;
import java.util.List;

final class TestProps {

    private TestProps() {
    }

    static ProcessingProperties defaults() {
        return defaults("vips", "ffmpeg", Duration.ofSeconds(60), Duration.ofSeconds(180));
    }

    static ProcessingProperties with(ZoneId zone) {
        return new ProcessingProperties(false, 1, Duration.ofMinutes(15), 3,
                List.of(Duration.ofMinutes(1), Duration.ofMinutes(5), Duration.ofMinutes(15)),
                Duration.ofSeconds(60), Duration.ofSeconds(180), zone, "ffmpeg", "ffprobe", "vips", "vipsheader");
    }

    static ProcessingProperties defaults(String vips, String ffmpeg, Duration photoTimeout, Duration videoTimeout) {
        return new ProcessingProperties(false, 1, Duration.ofMinutes(15), 3,
                List.of(Duration.ofMinutes(1), Duration.ofMinutes(5), Duration.ofMinutes(15)),
                photoTimeout, videoTimeout, ZoneId.of("Europe/Istanbul"), ffmpeg, "ffprobe", vips, "vipsheader");
    }
}
