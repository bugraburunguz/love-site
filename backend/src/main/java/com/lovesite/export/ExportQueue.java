package com.lovesite.export;

import com.lovesite.role.Roles;
import com.lovesite.storage.StorageService;
import jakarta.annotation.PreDestroy;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.support.TransactionTemplate;
import tools.jackson.databind.json.JsonMapper;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Semaphore;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.stream.Stream;

/**
 * The export queue: same shape as the media queue (claim with FOR UPDATE SKIP LOCKED in a short transaction, work outside
 * any transaction, result in another one) and the same fairness rule between spaces (a space with nothing running first,
 * then the one served least recently, then the oldest job).
 *
 * Exports have LOWER priority than media processing: they run on their own small pool (default one job), so a long render
 * never holds up an upload's processing, and every Chromium / ffmpeg process of an export runs with a higher niceness
 * (ExportProperties.nice), so the operating system gives the media worker and the web requests the CPU first.
 */
@Component
public class ExportQueue {

    private static final Logger log = LoggerFactory.getLogger(ExportQueue.class);
    static final String CACHE_CONTROL = "private, max-age=86400";

    private final JdbcTemplate jdbc;
    private final TransactionTemplate tx;
    private final ExportService exports;
    private final ExportRenderer renderer;
    private final StorageService storage;
    private final ExportProperties properties;
    private final Roles roles;
    private final JsonMapper json;
    private final Semaphore permits;
    private final ExecutorService workers;
    private final ExecutorService kicker = Executors.newSingleThreadExecutor(r -> daemon(r, "export-kick"));

    public ExportQueue(JdbcTemplate jdbc, TransactionTemplate tx, ExportService exports, ExportRenderer renderer, StorageService storage,
                       ExportProperties properties, Roles roles, JsonMapper json) {
        this.jdbc = jdbc;
        this.tx = tx;
        this.exports = exports;
        this.renderer = renderer;
        this.storage = storage;
        this.properties = properties;
        this.roles = roles;
        this.json = json;
        int concurrency = Math.max(1, properties.concurrency());
        this.permits = new Semaphore(concurrency);
        AtomicInteger n = new AtomicInteger();
        this.workers = Executors.newFixedThreadPool(concurrency, r -> daemon(r, "export-worker-" + n.incrementAndGet()));
    }

    private static Thread daemon(Runnable r, String name) {
        Thread t = new Thread(r, name);
        t.setDaemon(true);
        return t;
    }

    public boolean enabled() {
        return properties.autoPoll() && roles.runs(Roles.Job.EXPORT_QUEUE);
    }

    @Scheduled(initialDelay = 7_000, fixedDelayString = "${app.export.poll-interval:3s}")
    void scheduledPoll() {
        if (!enabled()) return;
        try {
            pollOnce();
        } catch (RuntimeException e) {
            log.warn("Export queue poll failed: {}", e.toString());
        }
    }

    /** Right after a request, so a free worker starts without waiting for the next poll (no-op in the web role). */
    public void kick() {
        if (enabled()) kicker.execute(this::scheduledPoll);
    }

    public synchronized int pollOnce() {
        reclaimStale();
        int started = 0;
        while (permits.tryAcquire()) {
            Optional<UUID> id;
            try {
                id = claimNext();
            } catch (RuntimeException e) {
                permits.release();
                throw e;
            }
            if (id.isEmpty()) {
                permits.release();
                break;
            }
            UUID job = id.get();
            started++;
            try {
                workers.execute(() -> {
                    try {
                        run(job);
                    } finally {
                        permits.release();
                    }
                });
            } catch (RuntimeException e) {
                permits.release();
                throw e;
            }
        }
        return started;
    }

    public boolean isIdle() {
        return permits.availablePermits() == Math.max(1, properties.concurrency());
    }

    /** Test helper: polls until nothing is claimable and every worker is done. */
    public boolean drain(long timeoutMillis) throws InterruptedException {
        long deadline = System.nanoTime() + TimeUnit.MILLISECONDS.toNanos(timeoutMillis);
        while (System.nanoTime() < deadline) {
            int started = pollOnce();
            if (started == 0 && isIdle()) return true;
            Thread.sleep(50);
        }
        return false;
    }

    Optional<UUID> claimNext() {
        return tx.execute(status -> {
            List<UUID[]> rows = jdbc.query(
                    "SELECT e.id, e.space_id FROM export_job e JOIN space s ON s.id = e.space_id "
                            + "WHERE e.status = 'QUEUED' AND e.expires_at > now() "
                            + "ORDER BY (EXISTS (SELECT 1 FROM export_job r WHERE r.space_id = e.space_id AND r.status = 'RUNNING')), "
                            + "s.export_served_at ASC NULLS FIRST, e.created_at "
                            + "LIMIT 1 FOR UPDATE OF e SKIP LOCKED",
                    (rs, i) -> new UUID[] {rs.getObject(1, UUID.class), rs.getObject(2, UUID.class)});
            if (rows.isEmpty()) return Optional.<UUID>empty();
            jdbc.update("UPDATE export_job SET status = 'RUNNING', started_at = now(), attempts = attempts + 1 WHERE id = ?", rows.get(0)[0]);
            jdbc.update("UPDATE space SET export_served_at = now() WHERE id = ?", rows.get(0)[1]);
            return Optional.of(rows.get(0)[0]);
        });
    }

    /** A RUNNING export of a worker that died goes back to the queue (or fails after the last attempt). */
    int reclaimStale() {
        Integer n = tx.execute(status -> jdbc.update(
                "UPDATE export_job SET status = CASE WHEN attempts >= ? THEN 'FAILED' ELSE 'QUEUED' END, "
                        + "last_error = 'render did not finish', started_at = NULL "
                        + "WHERE status = 'RUNNING' AND started_at < now() - (? * interval '1 second')",
                properties.maxAttempts(), properties.staleAfter().toSeconds()));
        if (n != null && n > 0) log.warn("Put {} stale export(s) back in the queue", n);
        return n == null ? 0 : n;
    }

    /** Renders one claimed job. Never throws: failures are recorded on the row. */
    void run(UUID id) {
        Optional<ExportService.ExportRow> found = exports.find(id);
        if (found.isEmpty()) return;
        ExportService.ExportRow job = found.get();
        Path tmp = null;
        List<String> uploaded = new ArrayList<>();
        long started = System.nanoTime();
        try {
            tmp = Files.createTempDirectory("export-");
            ExportRenderer.Result result = renderer.render(job, tmp);
            String prefix = prefix(job.spaceId(), job.id());
            List<Map<String, Object>> files = new ArrayList<>();
            for (ExportRenderer.OutputFile f : result.files()) {
                String key = prefix + f.name();
                storage.upload(key, f.path(), f.contentType(), CACHE_CONTROL);
                uploaded.add(key);
                Map<String, Object> entry = new LinkedHashMap<>();
                entry.put("key", key);
                entry.put("name", f.name());
                entry.put("contentType", f.contentType());
                entry.put("size", Files.size(f.path()));
                entry.put("role", f.role());
                files.add(entry);
            }
            Integer updated = tx.execute(status -> jdbc.update(
                    "UPDATE export_job SET status = 'READY', result_keys = cast(? as jsonb), notes = cast(? as jsonb), meta = cast(? as jsonb), "
                            + "finished_at = now(), expires_at = ?, last_error = NULL WHERE id = ? AND status = 'RUNNING'",
                    json.writeValueAsString(files), json.writeValueAsString(result.notes()), json.writeValueAsString(result.meta()),
                    Timestamp.from(Instant.now().plus(properties.ttl())), id));
            if (updated == null || updated == 0) { // reclaimed meanwhile (should not happen): do not leave orphans
                uploaded.forEach(this::deleteQuietly);
                return;
            }
            log.info("Export {} {} ready in {} ms ({} file(s))", job.type(), id, (System.nanoTime() - started) / 1_000_000, files.size());
        } catch (Exception e) {
            if (e instanceof InterruptedException) Thread.currentThread().interrupt();
            uploaded.forEach(this::deleteQuietly);
            String message = String.valueOf(e.getMessage());
            log.warn("Export {} {} failed: {}", job.type(), id, e.toString());
            tx.executeWithoutResult(status -> jdbc.update(
                    "UPDATE export_job SET status = CASE WHEN attempts >= ? THEN 'FAILED' ELSE 'QUEUED' END, last_error = ?, started_at = NULL, "
                            + "finished_at = CASE WHEN attempts >= ? THEN now() ELSE NULL END WHERE id = ?",
                    properties.maxAttempts(), message.length() > 280 ? message.substring(0, 280) : message, properties.maxAttempts(), id));
        } finally {
            deleteRecursively(tmp);
        }
    }

    static String prefix(UUID spaceId, UUID jobId) {
        return "spaces/" + spaceId + "/exports/" + jobId + "/";
    }

    private void deleteQuietly(String key) {
        try {
            storage.delete(key);
        } catch (RuntimeException e) {
            log.warn("Could not delete {}: {}", key, e.toString());
        }
    }

    static void deleteRecursively(Path dir) {
        if (dir == null) return;
        try (Stream<Path> walk = Files.walk(dir)) {
            walk.sorted(java.util.Comparator.reverseOrder()).forEach(p -> {
                try {
                    Files.deleteIfExists(p);
                } catch (IOException ignored) {
                    // best effort
                }
            });
        } catch (IOException ignored) {
            // nothing to clean up
        }
    }

    @PreDestroy
    void shutdown() {
        kicker.shutdownNow();
        workers.shutdownNow();
    }
}
