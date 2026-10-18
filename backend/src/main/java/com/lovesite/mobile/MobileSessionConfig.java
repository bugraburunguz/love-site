package com.lovesite.mobile;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Primary;
import org.springframework.session.web.http.CookieHttpSessionIdResolver;
import org.springframework.session.web.http.CookieSerializer;
import org.springframework.session.web.http.HeaderHttpSessionIdResolver;
import org.springframework.session.web.http.HttpSessionIdResolver;

import java.util.List;

/**
 * The SAME server-side session for both clients, carried differently: the website keeps the HttpOnly cookie, the store app
 * sends the session id in X-Auth-Token (WKWebView does not keep third-party cookies of another origin). A request is an app
 * request when it says so in X-Client; for those the cookie is never read, so a session cookie can never authenticate a
 * cross-origin request (which is why CSRF protection is not needed for them, see SecurityConfig).
 */
@Configuration
public class MobileSessionConfig {

    /** The website's cookie resolver, with the cookie Spring Boot builds from server.servlet.session.cookie.* (unchanged). */
    @Bean
    CookieHttpSessionIdResolver cookieHttpSessionIdResolver(CookieSerializer cookieSerializer) {
        CookieHttpSessionIdResolver cookies = new CookieHttpSessionIdResolver();
        cookies.setCookieSerializer(cookieSerializer);
        return cookies;
    }

    @Bean
    @Primary
    HttpSessionIdResolver httpSessionIdResolver(CookieHttpSessionIdResolver cookies) {
        HeaderHttpSessionIdResolver header = new HeaderHttpSessionIdResolver(MobileProperties.TOKEN_HEADER);
        return new HttpSessionIdResolver() {
            private HttpSessionIdResolver pick(HttpServletRequest request) {
                return isApp(request) ? header : cookies;
            }

            @Override
            public List<String> resolveSessionIds(HttpServletRequest request) {
                return pick(request).resolveSessionIds(request);
            }

            @Override
            public void setSessionId(HttpServletRequest request, HttpServletResponse response, String sessionId) {
                pick(request).setSessionId(request, response, sessionId);
            }

            @Override
            public void expireSession(HttpServletRequest request, HttpServletResponse response) {
                pick(request).expireSession(request, response);
            }
        };
    }

    public static boolean isApp(HttpServletRequest request) {
        return MobileProperties.CLIENT.equals(request.getHeader(MobileProperties.CLIENT_HEADER));
    }
}
