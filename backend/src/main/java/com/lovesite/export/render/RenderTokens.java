package com.lovesite.export.render;

import com.lovesite.role.Roles;
import org.springframework.stereotype.Component;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;
import java.security.GeneralSecurityException;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.time.Clock;
import java.time.Duration;
import java.util.Base64;
import java.util.Optional;
import java.util.UUID;

/**
 * Short-lived credential for the render data of ONE export: `base64url(jobId.expiry).base64url(HMAC-SHA256)`, valid for 2
 * minutes. Only the process that renders mints and checks it, so the key is random per process and never configured or
 * stored anywhere. The web role has no key at all: it can neither issue nor accept a token.
 */
@Component
public class RenderTokens {

    public static final Duration TTL = Duration.ofMinutes(2);
    private static final Base64.Encoder ENC = Base64.getUrlEncoder().withoutPadding();
    private static final Base64.Decoder DEC = Base64.getUrlDecoder();

    private final byte[] key;
    private final Clock clock;

    @org.springframework.beans.factory.annotation.Autowired
    public RenderTokens(Roles roles) {
        this(roles.runs(Roles.Job.RENDER_ENDPOINT) ? randomKey() : null, Clock.systemUTC());
    }

    RenderTokens(byte[] key, Clock clock) {
        this.key = key;
        this.clock = clock;
    }

    private static byte[] randomKey() {
        byte[] k = new byte[32];
        new SecureRandom().nextBytes(k);
        return k;
    }

    public boolean enabled() {
        return key != null;
    }

    public String issue(UUID jobId) {
        if (key == null) throw new IllegalStateException("render tokens are off in this role");
        long expires = clock.instant().plus(TTL).getEpochSecond();
        String body = jobId + "." + expires;
        return ENC.encodeToString(body.getBytes(StandardCharsets.UTF_8)) + "." + ENC.encodeToString(mac(body));
    }

    /** The job id when the token is genuine, unexpired and for this job; empty otherwise (never throws on bad input). */
    public Optional<UUID> verify(String token, UUID expectedJob) {
        if (key == null || token == null || token.length() > 300) return Optional.empty();
        try {
            int dot = token.indexOf('.');
            if (dot <= 0) return Optional.empty();
            String body = new String(DEC.decode(token.substring(0, dot)), StandardCharsets.UTF_8);
            byte[] given = DEC.decode(token.substring(dot + 1));
            if (!MessageDigest.isEqual(given, mac(body))) return Optional.empty();
            int sep = body.lastIndexOf('.');
            UUID job = UUID.fromString(body.substring(0, sep));
            long expires = Long.parseLong(body.substring(sep + 1));
            if (clock.instant().getEpochSecond() > expires) return Optional.empty();
            if (expectedJob != null && !expectedJob.equals(job)) return Optional.empty();
            return Optional.of(job);
        } catch (IllegalArgumentException | IndexOutOfBoundsException e) {
            return Optional.empty();
        }
    }

    private byte[] mac(String body) {
        try {
            Mac mac = Mac.getInstance("HmacSHA256");
            mac.init(new SecretKeySpec(key, "HmacSHA256"));
            return mac.doFinal(body.getBytes(StandardCharsets.UTF_8));
        } catch (GeneralSecurityException e) {
            throw new IllegalStateException(e);
        }
    }
}
