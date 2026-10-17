package com.lovesite.space;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.boot.context.properties.bind.DefaultValue;

import java.time.Duration;

@ConfigurationProperties(prefix = "app.space")
public record SpaceProperties(
        /** members per space, owner included; checked in the application layer */
        @DefaultValue("2") int maxMembers,
        @DefaultValue("Bizim Alanımız") String initialName,
        @DefaultValue("400") double initialLimitGb,
        @DefaultValue("7d") Duration inviteTtl,
        @DefaultValue("30d") Duration trashRetention) {

    public static final long GIB = 1024L * 1024L * 1024L;

    public long initialLimitBytes() {
        return (long) (initialLimitGb * GIB);
    }
}
