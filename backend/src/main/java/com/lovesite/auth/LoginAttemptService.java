package com.lovesite.auth;

import org.springframework.stereotype.Service;

import java.time.Duration;
import java.time.Instant;
import java.util.Locale;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/** In-memory brute-force guard: 5 consecutive failures for an email lock it for 15 minutes. */
@Service
public class LoginAttemptService {

    static final int MAX_FAILURES = 5;
    static final Duration LOCK_DURATION = Duration.ofMinutes(15);
    private static final int MAX_TRACKED = 10_000;

    private record Attempt(int failures, Instant lockedUntil) {
    }

    private final Map<String, Attempt> attempts = new ConcurrentHashMap<>();

    public boolean isLocked(String email) {
        Attempt attempt = attempts.get(key(email));
        return attempt != null && attempt.lockedUntil() != null && attempt.lockedUntil().isAfter(Instant.now());
    }

    public void recordFailure(String email) {
        if (attempts.size() > MAX_TRACKED) {
            Instant now = Instant.now();
            attempts.values().removeIf(a -> a.lockedUntil() == null || a.lockedUntil().isBefore(now));
        }
        attempts.compute(key(email), (k, current) -> {
            Instant now = Instant.now();
            if (current != null && current.lockedUntil() != null && current.lockedUntil().isBefore(now)) {
                current = null; // lock expired, start over
            }
            int failures = (current == null ? 0 : current.failures()) + 1;
            return failures >= MAX_FAILURES
                    ? new Attempt(failures, now.plus(LOCK_DURATION))
                    : new Attempt(failures, null);
        });
    }

    public void recordSuccess(String email) {
        attempts.remove(key(email));
    }

    private static String key(String email) {
        return email.trim().toLowerCase(Locale.ROOT);
    }
}
