package com.lovesite;

import com.lovesite.storage.StorageProperties;
import com.lovesite.storage.StorageService;
import org.junit.jupiter.api.Test;

import java.net.ServerSocket;
import java.time.Duration;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/** A bucket that accepts connections but never answers must not hang a request. */
class StorageTimeoutTest {

    private static StorageService serviceFor(int port, Duration read, int attempts) {
        return new StorageService(new StorageProperties("http://localhost:" + port, "b", "k", "s", "us-east-1", true, false,
                List.of(), Duration.ofSeconds(1), read, attempts));
    }

    @Test
    void readTimeoutAndRetriesAreExplicitAndBounded() throws Exception {
        try (ServerSocket silent = new ServerSocket(0)) {
            var storage = serviceFor(silent.getLocalPort(), Duration.ofSeconds(1), 2);
            long start = System.nanoTime();
            assertThatThrownBy(() -> storage.head("audio/theme")).isInstanceOf(RuntimeException.class);
            // 2 attempts x ~1 s read timeout (+ backoff), far below the SDK default of 30 s per attempt
            assertThat(Duration.ofNanos(System.nanoTime() - start)).isLessThan(Duration.ofSeconds(10));
        }
    }

    @Test
    void headWithATotalBudgetGivesUpQuickly() throws Exception {
        try (ServerSocket silent = new ServerSocket(0)) {
            var storage = serviceFor(silent.getLocalPort(), Duration.ofSeconds(10), 3);
            long start = System.nanoTime();
            assertThatThrownBy(() -> storage.head("audio/theme", Duration.ofMillis(800))).isInstanceOf(RuntimeException.class);
            assertThat(Duration.ofNanos(System.nanoTime() - start)).isLessThan(Duration.ofSeconds(4));
        }
    }

    @Test
    void defaultsAreExplicitWhenNothingIsConfigured() {
        var props = new StorageProperties("http://x", "b", "k", "s", null, false, false, null, null, null, 0);
        assertThat(props.connectTimeout()).isEqualTo(Duration.ofSeconds(3));
        assertThat(props.readTimeout()).isEqualTo(Duration.ofSeconds(10));
        assertThat(props.maxAttempts()).isEqualTo(3);
    }
}
