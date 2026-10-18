package com.lovesite.export.render;

import com.lovesite.export.ExportProperties;
import jakarta.annotation.PreDestroy;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;
import tools.jackson.core.type.TypeReference;
import tools.jackson.databind.json.JsonMapper;

import java.io.BufferedReader;
import java.io.BufferedWriter;
import java.io.IOException;
import java.io.InputStreamReader;
import java.io.OutputStreamWriter;
import java.nio.charset.StandardCharsets;
import java.nio.file.Path;
import java.time.Duration;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.TimeoutException;
import java.util.concurrent.atomic.AtomicLong;

/**
 * The bridge to the render driver (renderer/driver.mjs): ONE long-lived Node process holding ONE headless Chromium, reused for
 * every export. Started on first use with a higher niceness (Chromium inherits it), so rendering never takes CPU from the web
 * requests or the media queue. A request that times out kills the driver (and with it a stuck Chromium); the next export
 * starts a fresh one.
 */
@Component
public class RenderDriver {

    private static final Logger log = LoggerFactory.getLogger(RenderDriver.class);
    private static final TypeReference<Map<String, Object>> MAP = new TypeReference<>() { };

    /** What the render page reported for one scene (CSS px of the scene; multiply by dpr for image pixels). */
    public record SceneInfo(Path png, Map<String, Object> info) {
        public double width() {
            return ((Number) info.get("width")).doubleValue();
        }

        public double height() {
            return ((Number) info.get("height")).doubleValue();
        }

        @SuppressWarnings("unchecked")
        public List<Map<String, Object>> videos() {
            Object v = info.get("videos");
            return v instanceof List<?> l ? (List<Map<String, Object>>) l : List.of();
        }

        public boolean overflow() {
            return Boolean.TRUE.equals(info.get("overflow"));
        }
    }

    private final ExportProperties properties;
    private final JsonMapper json;
    private final AtomicLong ids = new AtomicLong();
    private final Map<Long, CompletableFuture<Map<String, Object>>> pending = new ConcurrentHashMap<>();
    private Process process;
    private BufferedWriter stdin;

    public RenderDriver(ExportProperties properties, JsonMapper json) {
        this.properties = properties;
        this.json = json;
    }

    /** Renders the scenes of one job, one PNG per scene. */
    public List<SceneInfo> render(String url, double dpr, List<Path> outputs, Duration perScene) throws IOException, InterruptedException {
        List<Map<String, Object>> scenes = new ArrayList<>();
        for (int i = 0; i < outputs.size(); i++) scenes.add(Map.of("index", i, "out", outputs.get(i).toString()));
        Map<String, Object> request = new LinkedHashMap<>();
        request.put("op", "render");
        request.put("url", url);
        request.put("dpr", dpr);
        request.put("timeoutMs", perScene.toMillis());
        request.put("scenes", scenes);
        // page load + every scene, plus a margin for starting Chromium
        Duration total = perScene.multipliedBy(outputs.size() + 1).plusSeconds(30);
        Map<String, Object> answer = call(request, total);
        @SuppressWarnings("unchecked")
        List<Map<String, Object>> infos = (List<Map<String, Object>>) answer.get("scenes");
        if (infos == null || infos.size() != outputs.size()) throw new IOException("render driver returned " + (infos == null ? 0 : infos.size()) + " scenes");
        List<SceneInfo> result = new ArrayList<>();
        for (int i = 0; i < outputs.size(); i++) result.add(new SceneInfo(outputs.get(i), infos.get(i)));
        return result;
    }

    private Map<String, Object> call(Map<String, Object> request, Duration timeout) throws IOException, InterruptedException {
        long id = ids.incrementAndGet();
        CompletableFuture<Map<String, Object>> future = new CompletableFuture<>();
        pending.put(id, future);
        try {
            Map<String, Object> withId = new LinkedHashMap<>(request);
            withId.put("id", id);
            synchronized (this) {
                ensureStarted();
                stdin.write(json.writeValueAsString(withId));
                stdin.write('\n');
                stdin.flush();
            }
            Map<String, Object> answer = future.get(timeout.toMillis(), TimeUnit.MILLISECONDS);
            if (!Boolean.TRUE.equals(answer.get("ok"))) throw new IOException("render failed: " + answer.get("error"));
            return answer;
        } catch (TimeoutException e) {
            log.warn("Render driver did not answer within {} s, restarting it", timeout.toSeconds());
            stop();
            throw new IOException("render timed out after " + timeout.toSeconds() + " s");
        } catch (ExecutionException e) {
            throw new IOException("render driver failed: " + e.getCause());
        } finally {
            pending.remove(id);
        }
    }

    private void ensureStarted() throws IOException {
        if (process != null && process.isAlive()) return;
        List<String> command = new ArrayList<>();
        if (properties.nice() > 0 && niceAvailable()) command.addAll(List.of("nice", "-n", String.valueOf(properties.nice())));
        command.addAll(List.of(properties.node(), properties.driver()));
        ProcessBuilder builder = new ProcessBuilder(command).redirectError(ProcessBuilder.Redirect.INHERIT);
        process = builder.start();
        stdin = new BufferedWriter(new OutputStreamWriter(process.getOutputStream(), StandardCharsets.UTF_8));
        Process started = process;
        Thread.ofVirtual().name("render-driver-out").start(() -> readAnswers(started));
        log.info("Render driver started (pid {}): {}", process.pid(), String.join(" ", command));
    }

    private static Boolean nice;

    static synchronized boolean niceAvailable() {
        if (nice == null) {
            try {
                nice = new ProcessBuilder("nice", "-n", "0", "true").start().waitFor(5, TimeUnit.SECONDS);
            } catch (IOException | InterruptedException e) {
                nice = false;
            }
        }
        return nice;
    }

    private void readAnswers(Process p) {
        try (BufferedReader reader = new BufferedReader(new InputStreamReader(p.getInputStream(), StandardCharsets.UTF_8))) {
            String line;
            while ((line = reader.readLine()) != null) {
                if (!line.startsWith("{")) continue;
                try {
                    Map<String, Object> answer = json.readValue(line, MAP);
                    Object id = answer.get("id");
                    if (id instanceof Number n) {
                        CompletableFuture<Map<String, Object>> f = pending.get(n.longValue());
                        if (f != null) f.complete(answer);
                    }
                } catch (RuntimeException e) {
                    log.warn("Unreadable answer from the render driver: {}", e.toString());
                }
            }
        } catch (IOException ignored) {
            // the process ended
        }
        // the driver is gone: every open request fails now instead of waiting for its timeout
        pending.values().forEach(f -> f.completeExceptionally(new IOException("render driver exited")));
    }

    /** Memory of the driver process tree (Node + Chromium), for the log / report. -1 when unknown. */
    public long residentKb() {
        Process p = process;
        if (p == null || !p.isAlive()) return -1;
        long total = 0;
        List<ProcessHandle> all = new ArrayList<>();
        all.add(p.toHandle());
        p.toHandle().descendants().forEach(all::add);
        for (ProcessHandle h : all) {
            try {
                for (String line : java.nio.file.Files.readAllLines(Path.of("/proc/" + h.pid() + "/status"))) {
                    if (line.startsWith("VmRSS:")) total += Long.parseLong(line.replaceAll("\\D", ""));
                }
            } catch (IOException | RuntimeException e) {
                return -1; // not Linux
            }
        }
        return total;
    }

    @PreDestroy
    public synchronized void stop() {
        if (process == null) return;
        process.descendants().forEach(ProcessHandle::destroyForcibly);
        process.destroyForcibly();
        process = null;
        stdin = null;
    }
}
