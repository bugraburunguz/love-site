package com.lovesite.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

import java.net.URI;

/**
 * The one place that knows the app's public address (APP_PUBLIC_URL, e.g. https://example.com). Invite links, the default
 * bucket CORS origin and the optional redirect from the platform host are all derived from it; no domain is written in code.
 * Empty means "not configured": links stay relative and nothing is redirected.
 */
@ConfigurationProperties(prefix = "app")
public record PublicUrlProperties(String publicUrl, boolean redirectToPublicUrl) {

    public PublicUrlProperties {
        publicUrl = normalize(publicUrl);
    }

    /** scheme://host[:port] without path or trailing slash, or "" when blank / not an absolute http(s) URL. */
    static String normalize(String raw) {
        if (raw == null || raw.isBlank()) return "";
        try {
            URI uri = URI.create(raw.trim());
            if (uri.getHost() == null || uri.getScheme() == null) return "";
            if (!uri.getScheme().equals("http") && !uri.getScheme().equals("https")) return "";
            return uri.getScheme() + "://" + uri.getHost() + (uri.getPort() > 0 ? ":" + uri.getPort() : "");
        } catch (IllegalArgumentException e) {
            return "";
        }
    }

    public boolean configured() {
        return !publicUrl.isEmpty();
    }

    public String host() {
        return configured() ? URI.create(publicUrl).getHost() : "";
    }

    public boolean https() {
        return publicUrl.startsWith("https://");
    }
}
