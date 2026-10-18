package com.lovesite.role;

import java.util.Locale;

/**
 * Which part of the application this process is. The same image runs as two Railway services: `web` (API + SPA) and
 * `worker` (queues, scheduled jobs, the render engine). Without `APP_ROLE` the process is `ALL`: everything in one service,
 * exactly as before (local development, small single-service installs).
 */
public enum AppRole {
    ALL, WEB, WORKER;

    public static AppRole parse(String value) {
        if (value == null || value.isBlank()) return ALL;
        try {
            return valueOf(value.trim().toUpperCase(Locale.ROOT));
        } catch (IllegalArgumentException e) {
            throw new IllegalStateException("APP_ROLE must be empty, 'web' or 'worker' (was '" + value + "')");
        }
    }
}
