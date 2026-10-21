package com.lovesite.export.render;

import com.lovesite.export.ExportProperties;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.json.JsonMapper;

import java.time.Duration;
import java.util.concurrent.TimeUnit;

import static org.assertj.core.api.Assertions.assertThat;

/** The render driver is stopped after a while without exports (it holds Node + Chromium, a few hundred MB). */
class RenderDriverIdleTest {

    /** a stand-in "driver": `sleep 600` keeps running like the real one until it is stopped */
    static ExportProperties props(Duration idle) {
        return new ExportProperties(true, Duration.ofSeconds(3), 1, 3, 40, Duration.ofHours(24), Duration.ofSeconds(60),
                Duration.ofSeconds(300), Duration.ofMinutes(30), 2, "sleep", "600", 0, idle);
    }

    @Test
    void stopsOnlyAfterTheIdleTime() throws Exception {
        RenderDriver driver = new RenderDriver(props(Duration.ofMinutes(2)), JsonMapper.builder().build());
        try {
            assertThat(driver.stopIfIdle(System.nanoTime())).as("nothing to stop yet").isFalse();
            driver.startForTest();
            assertThat(driver.running()).isTrue();
            // one minute later: still kept
            assertThat(driver.stopIfIdle(System.nanoTime() + TimeUnit.MINUTES.toNanos(1))).isFalse();
            assertThat(driver.running()).isTrue();
            // past the idle time: stopped, and a new export would start it again
            assertThat(driver.stopIfIdle(System.nanoTime() + TimeUnit.MINUTES.toNanos(3))).isTrue();
            assertThat(driver.running()).isFalse();
            driver.startForTest();
            assertThat(driver.running()).isTrue();
        } finally {
            driver.stop();
        }
    }
}
