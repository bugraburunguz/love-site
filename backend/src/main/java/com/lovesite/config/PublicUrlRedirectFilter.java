package com.lovesite.config;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;

/**
 * After the custom domain is live, page requests that still arrive on the platform host (*.up.railway.app) get a 301 to
 * APP_PUBLIC_URL. Only GET/HEAD page requests are redirected: the API, health probes and anything else stay untouched, so
 * an old bookmark works but a probe on the platform host never breaks. Off unless REDIRECT_TO_PUBLIC_URL=true.
 */
public class PublicUrlRedirectFilter extends OncePerRequestFilter {

    static final String PLATFORM_HOST_SUFFIX = ".up.railway.app";
    private static final Logger log = LoggerFactory.getLogger(PublicUrlRedirectFilter.class);

    private final PublicUrlProperties properties;

    public PublicUrlRedirectFilter(PublicUrlProperties properties) {
        this.properties = properties;
        if (properties.redirectToPublicUrl() && !properties.configured()) {
            log.warn("REDIRECT_TO_PUBLIC_URL is true but APP_PUBLIC_URL is not set: redirect disabled");
        }
    }

    @Override
    protected boolean shouldNotFilter(HttpServletRequest request) {
        if (!properties.redirectToPublicUrl() || !properties.configured()) return true;
        String method = request.getMethod();
        if (!method.equals("GET") && !method.equals("HEAD")) return true;
        String path = request.getRequestURI();
        if (path.startsWith("/actuator/health") || path.startsWith("/api/")) return true;
        String host = request.getServerName();
        return host == null || !host.toLowerCase().endsWith(PLATFORM_HOST_SUFFIX) || host.equalsIgnoreCase(properties.host());
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
            throws ServletException, IOException {
        String query = request.getQueryString();
        response.setStatus(HttpServletResponse.SC_MOVED_PERMANENTLY);
        response.setHeader("Location", properties.publicUrl() + request.getRequestURI() + (query == null ? "" : "?" + query));
    }
}
