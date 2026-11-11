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

    /** The caller's network ({@link #network(String)}): the key every per-address limit counts by. */
    public static String networkOf(HttpServletRequest request) {
        return network(of(request));
    }

    /**
     * The unit a caller controls: an IPv4 address, or the /64 network of an IPv6 address (one home or server usually
     * gets a whole /64, so counting single IPv6 addresses would let it rotate addresses endlessly).
     */
    private static final java.util.regex.Pattern IPV6_LITERAL = java.util.regex.Pattern.compile("[0-9A-Fa-f:.]+");

    public static String network(String clientIp) {
        if (clientIp == null || clientIp.indexOf(':') < 0) return String.valueOf(clientIp);
        // only hex digits, ':' and '.' (an IPv6 literal, maybe with an IPv4 tail): InetAddress then parses it as a
        // literal; anything else could make it ask DNS, so it is kept as it is
        if (!IPV6_LITERAL.matcher(clientIp).matches()) return clientIp;
        try {
            java.net.InetAddress address = java.net.InetAddress.getByName(clientIp);
            byte[] bytes = address.getAddress();
            // an IPv4-mapped address (::ffff:1.2.3.4) counts as the IPv4 address itself
            if (bytes.length == 4) return address.getHostAddress();
            if (bytes.length != 16) return clientIp;
            return java.util.HexFormat.of().formatHex(bytes, 0, 8) + "::/64";
        } catch (java.net.UnknownHostException e) {
            return clientIp;
        }
    }

    private static HttpServletRequest unwrap(HttpServletRequest request) {
        ServletRequest current = request;
        while (current instanceof ServletRequestWrapper wrapper && wrapper.getRequest() instanceof HttpServletRequest inner) {
            current = inner;
        }
        return (HttpServletRequest) current;
    }
}
