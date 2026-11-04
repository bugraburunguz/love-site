package com.lovesite.media.processing;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.List;
import java.util.concurrent.TimeUnit;

/**
 * Runs an external tool with an argument list (never a shell string). Both output streams are drained while the
 * process runs, so a chatty tool cannot block on a full pipe, and a process that outlives its timeout is killed
 * together with its children.
 */
public final class ProcessRunner {

    private static final int MAX_STDOUT = 8 * 1024 * 1024;
    private static final int STDERR_TAIL = 16 * 1024;

    public record Result(int exitCode, String stdout, String stderr) {
    }

    public static class ProcessTimeoutException extends IOException {
        public ProcessTimeoutException(String command, Duration timeout) {
            super(command + " did not finish within " + timeout.toSeconds() + " s and was killed");
        }
    }

    public static class ProcessFailedException extends IOException {
        public ProcessFailedException(String command, int exitCode, String stderr) {
            super(command + " exited with " + exitCode + ": " + tail(stderr, 400));
        }
    }

    /**
     * The tool died of SIGKILL (exit 137) without a timeout: in a container that is the kernel's OOM killer. Retrying the same
     * file only kills the tool again, so the caller fails the item at once.
     */
    public static class ProcessKilledException extends ProcessFailedException {
        public ProcessKilledException(String command, String stderr) {
            super(command + " was killed, out of memory?", 137, stderr);
        }
    }

    private static final int SIGKILL_EXIT = 137;

    /**
     * Starts a command with the highest OOM score (oom_score_adj 1000; raising it needs no privileges, and children inherit
     * it). When the container's memory limit is hit (a 48 MP HEIC alone needs ~430 MB in vips), the kernel kills the tool
     * instead of the JVM: the item fails, the site stays up. Where /proc is missing (macOS) the wrapper only execs the command.
     */
    public static List<String> expendable(List<String> command) {
        List<String> c = new java.util.ArrayList<>(List.of("sh", "-c", "{ echo 1000 > /proc/self/oom_score_adj; } 2>/dev/null; exec \"$@\"", "sh"));
        c.addAll(command);
        return c;
    }

    private ProcessRunner() {
    }

    /** Never throws for a non-zero exit code; the caller decides. */
    public static Result run(List<String> command, Duration timeout) throws IOException, InterruptedException {
        return run(command, java.util.Map.of(), timeout);
    }

    /** `env` is added to the inherited environment (used to hand a password to a tool without putting it on the command line). */
    public static Result run(List<String> command, java.util.Map<String, String> env, Duration timeout) throws IOException, InterruptedException {
        ProcessBuilder builder = new ProcessBuilder(expendable(command));
        builder.environment().putAll(env);
        Process process = builder.start();
        process.getOutputStream().close(); // nothing is ever written to stdin
        Collector stdout = new Collector(process.getInputStream(), MAX_STDOUT, false);
        Collector stderr = new Collector(process.getErrorStream(), STDERR_TAIL, true);
        Thread outThread = Thread.ofVirtual().name("proc-out").start(stdout);
        Thread errThread = Thread.ofVirtual().name("proc-err").start(stderr);
        try {
            if (!process.waitFor(timeout.toMillis(), TimeUnit.MILLISECONDS)) {
                kill(process);
                throw new ProcessTimeoutException(command.get(0), timeout);
            }
            outThread.join(5_000);
            errThread.join(5_000);
            return new Result(process.exitValue(), stdout.text(), stderr.text());
        } catch (InterruptedException e) {
            kill(process);
            throw e;
        }
    }

    /** Like run, but a non-zero exit code is an error. */
    public static Result runChecked(List<String> command, Duration timeout) throws IOException, InterruptedException {
        Result result = run(command, timeout);
        if (result.exitCode() == SIGKILL_EXIT) throw new ProcessKilledException(command.get(0), result.stderr());
        if (result.exitCode() != 0) {
            throw new ProcessFailedException(command.get(0), result.exitCode(), result.stderr());
        }
        return result;
    }

    private static void kill(Process process) throws InterruptedException {
        process.descendants().forEach(ProcessHandle::destroyForcibly);
        process.destroyForcibly();
        process.waitFor(5, TimeUnit.SECONDS);
    }

    static String tail(String text, int max) {
        String trimmed = text == null ? "" : text.trim();
        return trimmed.length() <= max ? trimmed : "..." + trimmed.substring(trimmed.length() - max);
    }

    /** Reads a stream to the end, keeping the head (stdout) or the tail (stderr) when it gets large. */
    private static final class Collector implements Runnable {
        private final InputStream in;
        private final int limit;
        private final boolean keepTail;
        private final ByteArrayOutputStream buffer = new ByteArrayOutputStream();

        Collector(InputStream in, int limit, boolean keepTail) {
            this.in = in;
            this.limit = limit;
            this.keepTail = keepTail;
        }

        @Override
        public void run() {
            byte[] chunk = new byte[8192];
            try {
                int read;
                while ((read = in.read(chunk)) != -1) {
                    synchronized (buffer) {
                        if (keepTail) {
                            buffer.write(chunk, 0, read);
                            if (buffer.size() > limit * 4) {
                                byte[] all = buffer.toByteArray();
                                buffer.reset();
                                buffer.write(all, all.length - limit, limit);
                            }
                        } else if (buffer.size() < limit) {
                            buffer.write(chunk, 0, Math.min(read, limit - buffer.size()));
                        } // beyond the limit the stream is still drained, just not stored
                    }
                }
            } catch (IOException ignored) {
                // the process was killed or closed its streams
            }
        }

        String text() {
            synchronized (buffer) {
                byte[] bytes = buffer.toByteArray();
                if (keepTail && bytes.length > limit) {
                    bytes = java.util.Arrays.copyOfRange(bytes, bytes.length - limit, bytes.length);
                }
                return new String(bytes, StandardCharsets.UTF_8);
            }
        }
    }
}
