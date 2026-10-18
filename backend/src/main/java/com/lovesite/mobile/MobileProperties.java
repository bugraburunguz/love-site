package com.lovesite.mobile;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.boot.context.properties.bind.DefaultValue;

import java.util.List;

/**
 * The store apps (Capacitor) load the SPA from inside the app (iOS: capacitor://localhost, Android: https://localhost) and
 * call this API across origins. Those origins are allowed by CORS (API) and by the bucket CORS rule (direct uploads).
 */
@ConfigurationProperties(prefix = "app.mobile")
public record MobileProperties(
        @DefaultValue({"capacitor://localhost", "https://localhost"}) List<String> origins) {

    /** Value of the X-Client header the app sends on every request. */
    public static final String CLIENT = "love-site-app";
    public static final String CLIENT_HEADER = "X-Client";
    /** The session id travels in this header instead of a cookie. */
    public static final String TOKEN_HEADER = "X-Auth-Token";
}
