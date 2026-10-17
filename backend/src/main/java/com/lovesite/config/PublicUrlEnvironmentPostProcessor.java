package com.lovesite.config;

import org.springframework.boot.EnvironmentPostProcessor;
import org.springframework.boot.SpringApplication;
import org.springframework.core.env.ConfigurableEnvironment;
import org.springframework.core.env.MapPropertySource;

import java.util.Map;

/**
 * The session cookie's Secure flag follows the scheme of APP_PUBLIC_URL: an https address keeps the default (Secure), an
 * http address (local / closed test network) turns it off, because a Secure cookie is never sent back over http and
 * nobody could sign in. An explicit COOKIE_SECURE always wins. The cookie has no Domain attribute, so the host needs no setting.
 */
public class PublicUrlEnvironmentPostProcessor implements EnvironmentPostProcessor {

    static final String SOURCE = "publicUrlCookieDefault";

    @Override
    public void postProcessEnvironment(ConfigurableEnvironment environment, SpringApplication application) {
        if (environment.getProperty("COOKIE_SECURE") != null) return;
        String publicUrl = PublicUrlProperties.normalize(environment.getProperty("APP_PUBLIC_URL", environment.getProperty("app.public-url", "")));
        if (publicUrl.startsWith("http://")) {
            environment.getPropertySources().addFirst(new MapPropertySource(SOURCE, Map.of("server.servlet.session.cookie.secure", "false")));
        }
    }
}
