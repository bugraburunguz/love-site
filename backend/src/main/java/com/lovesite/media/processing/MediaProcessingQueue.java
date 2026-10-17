package com.lovesite.media.processing;

import jakarta.annotation.PreDestroy;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.util.Optional;
import java.util.UUID;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Semaphore;
import java.util.concurrent.ThreadFactory;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;

/**
 * The in-process queue: a poller claims jobs from the database and hands them to a fixed pool. A semaphore with one
 * permit per worker keeps the pool from ever holding more than `concurrency` jobs, so nothing piles up in memory.
 */
@Component
public class MediaProcessingQueue {

    private static final Logger log = LoggerFactory.getLogger(MediaProcessingQueue.class);

    private final MediaProcessingService service;
    private final ProcessingProperties properties;
    private final Semaphore permits;
    private final ExecutorService workers;
    private final ExecutorService kicker = Executors.newSingleThreadExecutor(namedDaemon("media-kick"));

    public MediaProcessingQueue(MediaProcessingService service, ProcessingProperties properties) {
        this.service = service;
        this.properties = properties;
        int concurrency = Math.max(1, properties.concurrency());
        this.permits = new Semaphore(concurrency);
        this.workers = Executors.newFixedThreadPool(concurrency, namedDaemon("media-worker"));
    }

    @Scheduled(initialDelay = 5_000, fixedDelayString = "${app.processing.poll-interval:3s}")
    void scheduledPoll() {
        if (!properties.autoPoll()) return;
        try {
            pollOnce();
        } catch (RuntimeException e) {
            log.warn("Media queue poll failed: {}", e.toString());
        }
    }

    /** Called after an upload is verified so processing starts without waiting for the next poll. */
    public void kick() {
        if (properties.autoPoll()) kicker.execute(this::scheduledPoll);
    }

    /** Claims and starts as many jobs as there are free workers. Returns how many were started. */
    public synchronized int pollOnce() {
        service.reclaimStale();
        int started = 0;
        while (permits.tryAcquire()) {
            Optional<UUID> id;
            try {
                id = service.claimNext();
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
                        service.process(job);
                    } finally {
                        permits.release();
                    }
                });
            } catch (RuntimeException e) { // pool already shut down
                permits.release();
                throw e;
            }
        }
        return started;
    }

    /** True when no worker is busy. */
    public boolean isIdle() {
        return permits.availablePermits() == Math.max(1, properties.concurrency());
    }

    /** Test helper: polls until nothing is claimable and every worker is done (or the timeout passes). */
    public boolean drain(long timeoutMillis) throws InterruptedException {
        long deadline = System.nanoTime() + TimeUnit.MILLISECONDS.toNanos(timeoutMillis);
        while (System.nanoTime() < deadline) {
            int started = pollOnce();
            if (started == 0 && isIdle()) return true;
            Thread.sleep(50);
        }
        return false;
    }

    @PreDestroy
    void shutdown() {
        kicker.shutdownNow();
        workers.shutdown();
        try {
            workers.awaitTermination(5, TimeUnit.SECONDS);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        }
        workers.shutdownNow();
    }

    private static ThreadFactory namedDaemon(String prefix) {
        AtomicInteger counter = new AtomicInteger();
        return runnable -> {
            Thread thread = new Thread(runnable, prefix + "-" + counter.incrementAndGet());
            thread.setDaemon(true);
            return thread;
        };
    }
}
