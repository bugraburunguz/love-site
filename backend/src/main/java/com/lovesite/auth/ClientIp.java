package com.lovesite.auth;

import jakarta.servlet.ServletRequest;
import jakarta.servlet.ServletRequestWrapper;
import jakarta.servlet.http.HttpServletRequest;

/**
 * The address of the caller as seen by the closest trusted proxy: the platform router appends the real client address
 * to X-Forwarded-For, so the rightmost entry is the one that cannot be forged by the client (anything to its left is
 * whatever the client sent).
 *
 * Spring's ForwardedHeaderFilter (server.forward-headers-strategy=framework) hides X-Forwarded-For from the
 * application and makes getRemoteAddr() return the LEFTMOST entry, which a client can choose freely. So the header is
 * read from the innermost, unwrapped request instead.
 */
public final class ClientIp {

    private ClientIp() {
    }

    public static String of(HttpServletRequest request) {
        HttpServletRequest raw = unwrap(request);
        String forwarded = raw.getHeader("X-Forwarded-For");
        if (forwarded != null && !forwarded.isBlank()) {
            String[] parts = forwarded.split(",");
            String last = parts[parts.length - 1].trim();
            if (!last.isEmpty()) return last;
        }
        return raw.getRemoteAddr();
    }

    private static HttpServletRequest unwrap(HttpServletRequest request) {
        ServletRequest current = request;
        while (current instanceof ServletRequestWrapper wrapper && wrapper.getRequest() instanceof HttpServletRequest inner) {
            current = inner;
        }
        return (HttpServletRequest) current;
    }
}
