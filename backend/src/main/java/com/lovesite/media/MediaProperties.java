package com.lovesite.media;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.boot.context.properties.bind.DefaultValue;
import org.springframework.util.unit.DataSize;

import java.time.Duration;

@ConfigurationProperties(prefix = "app.media")
public record MediaProperties(
        @DefaultValue("30MB") DataSize maxImageSize,
        @DefaultValue("300MB") DataSize maxVideoSize,
        @DefaultValue("50") int maxBatchSize,
        @DefaultValue("15m") Duration uploadUrlTtl,
        @DefaultValue("24h") Duration pendingTtl) {

    public long limitBytes(MediaKind kind) {
        return (kind == MediaKind.IMAGE ? maxImageSize : maxVideoSize).toBytes();
    }
}
