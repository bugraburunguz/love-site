package com.lovesite.space;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.boot.context.properties.bind.DefaultValue;
import org.springframework.util.unit.DataSize;

import java.time.Duration;

/**
 * Public signup. Every signup opens a FREE space with a small allowance; the free spaces together may only promise
 * freeTotal of disk (counted as number of free spaces x freeLimit, so raising one space's limit by hand does not close
 * signup). Without e-mail verification, perIp is what stops one script from opening hundreds of accounts.
 */
@ConfigurationProperties(prefix = "app.signup")
public record SignupProperties(
        @DefaultValue("true") boolean enabled,
        @DefaultValue("50MB") DataSize freeLimit,
        @DefaultValue("3GB") DataSize freeTotal,
        /** largest single video a free space may upload */
        @DefaultValue("20MB") DataSize freeMaxVideoSize,
        /** signups per address (IPv6: per /64 network) per window */
        @DefaultValue("3") int perIp,
        @DefaultValue("1h") Duration window,
        /** all signups together per day: many addresses cannot drain the free pool in one go */
        @DefaultValue("10") int perDay,
        /** a free space that is still empty this long after signup is removed (FreeSpaceCleanupJob) */
        @DefaultValue("30d") Duration freeEmptyTtl) {
}
