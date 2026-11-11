package com.lovesite.ratelimit;

import com.lovesite.system.ApiException;
import org.junit.jupiter.api.Test;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneOffset;

import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class RateLimiterTest {

    static final class MutableClock extends Clock {
        Instant now = Instant.parse("2026-11-11T10:00:00Z");

        @Override public ZoneOffset getZone() { return ZoneOffset.UTC; }
        @Override public Clock withZone(java.time.ZoneId zone) { return this; }
        @Override public Instant instant() { return now; }
    }

    @Test
    void cleanupKeepsAKeyWhoseOwnWindowIsStillOpen() {
        MutableClock clock = new MutableClock();
        RateLimiter limiter = new RateLimiter(clock, 3);
        limiter.check("signup-all", 1, Duration.ofDays(1));

        // an hour later a flood of short-window keys pushes the map over its size and starts a cleanup
        clock.now = clock.now.plus(Duration.ofHours(1));
        for (int i = 0; i < 5; i++) limiter.check("login-ip:" + i, 10, Duration.ofMinutes(10));

        // the day counter must still be full: a cleanup with the caller's 10-minute window must not reset it
        assertThatThrownBy(() -> limiter.check("signup-all", 1, Duration.ofDays(1))).isInstanceOf(ApiException.class);
    }

    @Test
    void cleanupDropsKeysWhoseOwnWindowHasClosed() {
        MutableClock clock = new MutableClock();
        RateLimiter limiter = new RateLimiter(clock, 3);
        limiter.check("short", 1, Duration.ofMinutes(1));
        clock.now = clock.now.plus(Duration.ofMinutes(2));
        for (int i = 0; i < 5; i++) limiter.check("k" + i, 10, Duration.ofDays(1));
        assertThatCode(() -> limiter.check("short", 1, Duration.ofMinutes(1))).doesNotThrowAnyException();
    }
}
