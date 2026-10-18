package com.lovesite.export.render;

import org.junit.jupiter.api.Test;

import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class RenderTokensTest {

    static final Instant NOW = Instant.parse("2030-01-01T10:00:00Z");
    final byte[] key = "0123456789abcdef0123456789abcdef".getBytes();

    RenderTokens at(Instant now) {
        return new RenderTokens(key, Clock.fixed(now, ZoneOffset.UTC));
    }

    @Test
    void genuineTokenIsAcceptedForItsJobOnly() {
        UUID job = UUID.randomUUID();
        String token = at(NOW).issue(job);
        assertThat(at(NOW.plusSeconds(60)).verify(token, job)).contains(job);
        assertThat(at(NOW).verify(token, UUID.randomUUID())).isEmpty();
    }

    @Test
    void expiredTokenIsRejected() {
        UUID job = UUID.randomUUID();
        String token = at(NOW).issue(job);
        assertThat(at(NOW.plus(RenderTokens.TTL).plusSeconds(1)).verify(token, job)).isEmpty();
    }

    @Test
    void wrongSignatureOrGarbageIsRejected() {
        UUID job = UUID.randomUUID();
        String token = at(NOW).issue(job);
        String tampered = token.substring(0, token.length() - 3) + (token.endsWith("AAA") ? "BBB" : "AAA");
        assertThat(at(NOW).verify(tampered, job)).isEmpty();
        // same token checked with another key (another process) is worthless
        assertThat(new RenderTokens("ffffffffffffffffffffffffffffffff".getBytes(), Clock.fixed(NOW, ZoneOffset.UTC)).verify(token, job)).isEmpty();
        // a body re-signed by nobody: expiry pushed into the future
        String body = java.util.Base64.getUrlEncoder().withoutPadding().encodeToString((job + ".9999999999").getBytes());
        assertThat(at(NOW).verify(body + token.substring(token.indexOf('.')), job)).isEmpty();
        for (String junk : new String[] {null, "", ".", "abc", "a.b", "%%%.%%%"}) assertThat(at(NOW).verify(junk, job)).isEmpty();
    }

    @Test
    void withoutKeyNothingIsIssuedOrAccepted() {
        RenderTokens off = new RenderTokens(null, Clock.systemUTC());
        assertThat(off.enabled()).isFalse();
        assertThatThrownBy(() -> off.issue(UUID.randomUUID())).isInstanceOf(IllegalStateException.class);
        assertThat(off.verify(at(NOW).issue(UUID.randomUUID()), null)).isEmpty();
    }
}
