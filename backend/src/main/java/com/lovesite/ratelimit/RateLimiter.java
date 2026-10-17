package com.lovesite.ratelimit;

import com.lovesite.system.ApiException;
import org.springframework.stereotype.Component;

import java.time.Duration;
import java.time.Instant;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/** Fixed-window counter per key. Cheap, in memory, and good enough to stop scripted abuse of a two-person app. */
@Component
public class RateLimiter {

    private static final int MAX_TRACKED = 20_000;

    private record Window(Instant start, int count) {
    }

    private final Map<String, Window> windows = new ConcurrentHashMap<>();

    /** Counts one request for the key and throws 429 once the window is full. */
    public void check(String key, int limit, Duration window) {
        Instant now = Instant.now();
        if (windows.size() > MAX_TRACKED) {
            windows.values().removeIf(w -> w.start().plus(window).isBefore(now));
        }
        Window current = windows.compute(key, (k, old) ->
                old == null || old.start().plus(window).isBefore(now) ? new Window(now, 1) : new Window(old.start(), old.count() + 1));
        if (current.count() > limit) {
            throw ApiException.tooManyRequests("Çok fazla istek. Lütfen biraz bekleyip tekrar deneyin.");
        }
    }
}
