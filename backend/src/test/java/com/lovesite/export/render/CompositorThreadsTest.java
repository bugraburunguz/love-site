package com.lovesite.export.render;

import org.junit.jupiter.api.Test;

import java.nio.file.Path;
import java.util.Collections;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * ffmpeg sizes its filter and encoder thread pools by the CPUs it sees, and a platform host shows dozens: every command of the
 * export pipeline caps them at two, or one reel peaks at a gigabyte or more.
 */
public class CompositorThreadsTest {

    static final Path P = Path.of("/tmp/x");
    final Compositor compositor = new Compositor("ffmpeg", List.of());

    /** Filter threads capped globally, and the ENCODER capped too (a -threads after the last input applies to the output). */
    public static void assertCapped(List<String> c) {
        assertThat(Collections.indexOfSubList(c, List.of("-filter_complex_threads", "2"))).as("filter_complex_threads in %s", c).isPositive();
        assertThat(Collections.indexOfSubList(c, List.of("-filter_threads", "2"))).as("filter_threads in %s", c).isPositive();
        int lastInput = c.lastIndexOf("-i");
        assertThat(Collections.lastIndexOfSubList(c, List.of("-threads", "2"))).as("encoder threads in %s", c).isGreaterThan(lastInput);
    }

    @Test
    void everyEncodingCommandCapsItsThreads() {
        var window = new Compositor.Window(P, 100, 100, 80, 60, 3, "");
        for (Compositor.Output output : Compositor.Output.values()) {
            assertCapped(compositor.scene(P, 1080, 1920, List.of(window), 3, 30, output == Compositor.Output.WEBP_ANIM, output, 80, P));
        }
        assertCapped(compositor.still(P, 2, P));
        assertCapped(compositor.body(Compositor.input(P, false, 0, 2), 2, P));
        assertCapped(compositor.transition(Compositor.input(P, true, 0, 1), Compositor.input(P, false, 0, 1), 1, "smoothleft", P));
    }
}
