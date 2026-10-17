package com.lovesite.media.processing;

import org.junit.jupiter.api.Test;

import java.time.Duration;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.junit.jupiter.api.Assumptions.assumeTrue;

class ProcessRunnerTest {

    private static boolean posix() {
        return !System.getProperty("os.name").toLowerCase().contains("win");
    }

    @Test
    void aProcessThatOutlivesItsTimeoutIsKilledTogetherWithItsChildren() throws Exception {
        assumeTrue(posix(), "needs a POSIX shell");
        long start = System.nanoTime();
        // sh starts a child (sleep); both must die
        assertThatThrownBy(() -> ProcessRunner.run(List.of("sh", "-c", "sleep 60 & sleep 60"), Duration.ofMillis(600)))
                .isInstanceOf(ProcessRunner.ProcessTimeoutException.class)
                .hasMessageContaining("was killed");
        assertThat(Duration.ofNanos(System.nanoTime() - start)).isLessThan(Duration.ofSeconds(10));
        // no leftover "sleep 60" from this test
        Thread.sleep(300);
        assertThat(ProcessHandle.allProcesses()
                .filter(p -> p.info().commandLine().map(c -> c.contains("sleep 60")).orElse(false))
                .count()).isZero();
    }

    @Test
    void largeOutputOnBothStreamsDoesNotBlockTheProcess() throws Exception {
        assumeTrue(posix(), "needs a POSIX shell");
        // 20 MB on stdout and 5 MB on stderr: would deadlock if the pipes were not drained while it runs
        var result = ProcessRunner.run(List.of("sh", "-c",
                "head -c 20000000 /dev/zero | tr '\\0' 'x'; head -c 5000000 /dev/zero | tr '\\0' 'e' 1>&2; echo done 1>&2"),
                Duration.ofSeconds(30));
        assertThat(result.exitCode()).isZero();
        assertThat(result.stdout().length()).isLessThanOrEqualTo(8 * 1024 * 1024);
        assertThat(result.stderr()).endsWith("done\n");
    }

    @Test
    void nonZeroExitIsReportedAndCheckedRunThrowsWithTheErrorOutput() throws Exception {
        assumeTrue(posix(), "needs a POSIX shell");
        assertThat(ProcessRunner.run(List.of("sh", "-c", "echo oops 1>&2; exit 3"), Duration.ofSeconds(5)).exitCode()).isEqualTo(3);
        assertThatThrownBy(() -> ProcessRunner.runChecked(List.of("sh", "-c", "echo oops 1>&2; exit 3"), Duration.ofSeconds(5)))
                .isInstanceOf(ProcessRunner.ProcessFailedException.class)
                .hasMessageContaining("exited with 3")
                .hasMessageContaining("oops");
    }

    @Test
    void argumentsAreNotInterpretedByAShell() throws Exception {
        assumeTrue(posix(), "needs a POSIX shell");
        var result = ProcessRunner.run(List.of("echo", "$(touch /tmp/should-not-exist); `id` ; &&"), Duration.ofSeconds(5));
        assertThat(result.stdout().trim()).isEqualTo("$(touch /tmp/should-not-exist); `id` ; &&");
    }
}
