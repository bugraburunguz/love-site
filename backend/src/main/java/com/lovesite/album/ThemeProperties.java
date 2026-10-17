package com.lovesite.album;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.boot.context.properties.bind.DefaultValue;

import java.util.List;

/**
 * Theme ids the backend accepts. A theme itself is frontend data (frontend/src/themes/{id}); adding one means adding that
 * folder and its id here (or in app.themes.allowed).
 */
@ConfigurationProperties(prefix = "app.themes")
public record ThemeProperties(
        @DefaultValue({"romantik", "buyulu", "arkadaslar", "seyahat", "yilbasi", "cadilar-bayrami"}) List<String> allowed,
        @DefaultValue("romantik") String defaultTheme) {

    public boolean isAllowed(String id) {
        return id != null && allowed.contains(id);
    }
}
