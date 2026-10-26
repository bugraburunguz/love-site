package com.lovesite.media.processing;

import com.lovesite.export.render.CompositorThreadsTest;
import org.junit.jupiter.api.Test;

import java.nio.file.Path;

/** The upload loop caps ffmpeg's filter threads like the export pipeline (the boomerang graph buffers every frame). */
class VideoThreadsTest {

    @Test
    void theLoopCommandCapsItsThreads() {
        var probe = new VideoProcessor.Probe(5000, 3840, 2160, "30/1", true, false, null, "smpte2084", "bt2020", "yuv420p10le");
        CompositorThreadsTest.assertCapped(new VideoProcessor(TestProps.defaults()).loopCommand(Path.of("/tmp/in"), Path.of("/tmp/out"), 3, probe));
    }
}
