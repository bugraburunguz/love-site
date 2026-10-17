package com.lovesite;

import com.lovesite.config.PublicUrlEnvironmentPostProcessor;
import org.junit.jupiter.api.Test;
import org.springframework.mock.env.MockEnvironment;

import static org.assertj.core.api.Assertions.assertThat;

/** The Secure flag of the session cookie follows APP_PUBLIC_URL unless COOKIE_SECURE says otherwise. */
class PublicUrlCookieTest {

    private static String secureFor(MockEnvironment env) {
        new PublicUrlEnvironmentPostProcessor().postProcessEnvironment(env, null);
        return env.getProperty("server.servlet.session.cookie.secure");
    }

    @Test
    void anHttpAddressTurnsSecureOffAnHttpsAddressLeavesTheDefault() {
        assertThat(secureFor(new MockEnvironment().withProperty("APP_PUBLIC_URL", "http://app:8080"))).isEqualTo("false");
        assertThat(secureFor(new MockEnvironment().withProperty("APP_PUBLIC_URL", "https://example.com"))).isNull();
        assertThat(secureFor(new MockEnvironment())).isNull();
    }

    @Test
    void anExplicitCookieSecureAlwaysWins() {
        assertThat(secureFor(new MockEnvironment().withProperty("APP_PUBLIC_URL", "http://app:8080").withProperty("COOKIE_SECURE", "true"))).isNull();
    }
}
