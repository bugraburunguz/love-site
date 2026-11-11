package com.lovesite.ratelimit;

import com.lovesite.system.ApiException;
import org.springframework.stereotype.Component;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/** Fixed-window counter per key. Cheap, in memory, and good enough to stop scripted abuse of a two-person app. */
@Component
public class RateLimiter {

    private static final int MAX_TRACKED = 20_000;

    /** Each window keeps its own length, so a cleanup started by a short-window key never resets a longer one. */
    private record Window(Instant start, Duration length, int count) {
        boolean closedAt(Instant now) {
            return start.plus(length).isBefore(now);
        }
    }

    private final Map<String, Window> windows = new ConcurrentHashMap<>();
    private final Clock clock;
    private final int maxTracked;

    public RateLimiter() {
        this(Clock.systemUTC(), MAX_TRACKED);
    }

    RateLimiter(Clock clock, int maxTracked) {
        this.clock = clock;
        this.maxTracked = maxTracked;
    }

    /** Counts one request for the key and throws 429 once the window is full. */
    public void check(String key, int limit, Duration window) {
        Instant now = clock.instant();
        if (windows.size() > maxTracked) {
            windows.values().removeIf(w -> w.closedAt(now));
        }
        Window current = windows.compute(key, (k, old) ->
                old == null || old.closedAt(now) ? new Window(now, window, 1) : new Window(old.start(), old.length(), old.count() + 1));
        if (current.count() > limit) {
            throw ApiException.tooManyRequests("Çok fazla istek. Lütfen biraz bekleyip tekrar deneyin.");
        }
    }
}
