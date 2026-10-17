package com.lovesite.system;

import org.springframework.boot.health.contributor.Health;
import org.springframework.boot.health.contributor.HealthIndicator;
import org.springframework.stereotype.Component;

import java.util.List;
import java.util.Optional;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.TimeUnit;

/** Reports whether the CLI tools needed for media processing (next phase) are available. */
@Component("mediaTools")
public class MediaToolsHealthIndicator implements HealthIndicator {

    private static final long TIMEOUT_SECONDS = 5;

    @Override
    public Health health() {
        Health.Builder builder = Health.up();
        boolean ok = true;

        Optional<String> ffmpeg = run("ffmpeg", "-version");
        ok &= report(builder, "ffmpeg", ffmpeg.map(MediaToolsHealthIndicator::firstLine));

        Optional<String> vips = run("vips", "--version");
        ok &= report(builder, "vips", vips.map(MediaToolsHealthIndicator::firstLine));

        if (vips.isPresent()) {
            boolean heif = run("vips", "-l").map(out -> out.contains("heifload")).orElse(false);
            builder.withDetail("vipsHeif", heif ? "heifload available" : "heifload missing");
            ok &= heif;
        } else {
            builder.withDetail("vipsHeif", "unknown (vips missing)");
        }

        return ok ? builder.build() : builder.down().build();
    }

    private static boolean report(Health.Builder builder, String name, Optional<String> version) {
        builder.withDetail(name, version.orElse("not available"));
        return version.isPresent();
    }

    private static String firstLine(String output) {
        return output.lines().findFirst().orElse("").trim();
    }

    /** Runs a command; empty if it is missing, exits non-zero, or times out. */
    private static Optional<String> run(String... command) {
        Process process = null;
        try {
            process = new ProcessBuilder(List.of(command)).redirectErrorStream(true).start();
            Process p = process;
            CompletableFuture<String> output = CompletableFuture.supplyAsync(() -> {
                try {
                    return new String(p.getInputStream().readAllBytes());
                } catch (Exception e) {
                    return "";
                }
            });
            if (!p.waitFor(TIMEOUT_SECONDS, TimeUnit.SECONDS)) {
                return Optional.empty();
            }
            String text = output.get(TIMEOUT_SECONDS, TimeUnit.SECONDS);
            return p.exitValue() == 0 ? Optional.of(text) : Optional.empty();
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            return Optional.empty();
        } catch (Exception e) {
            return Optional.empty();
        } finally {
            if (process != null && process.isAlive()) {
                process.destroyForcibly();
            }
        }
    }
}
