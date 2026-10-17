package com.lovesite.ratelimit;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.boot.context.properties.bind.DefaultValue;

import java.time.Duration;

/**
 * Request limits that complement the failure-based locks (5 wrong passwords lock an e-mail, 5 wrong invitation tokens
 * lock an address). Fixed windows, kept in memory: the app runs as one instance.
 */
@ConfigurationProperties(prefix = "app.rate-limit")
public record RateLimitProperties(
        /** login attempts (right or wrong) from one address per window */
        @DefaultValue("30") int loginPerIp,
        @DefaultValue("10m") Duration loginWindow,
        /** "I want to upload these files" requests per signed-in user and per address, per window (each request may carry 50 files) */
        @DefaultValue("120") int uploadStartPerUser,
        @DefaultValue("300") int uploadStartPerIp,
        @DefaultValue("1h") Duration uploadWindow) {
}
