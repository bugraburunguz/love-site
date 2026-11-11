package com.lovesite.media.processing;

import org.junit.jupiter.api.Test;

import java.nio.file.Path;

import static org.assertj.core.api.Assertions.assertThat;

/** LS-22: the 3-second boomerang starts where the user put it, kept inside the video. */
class ClipWindowTest {

    @Test
    void withoutAChoiceTheFirstThreeSecondsAreUsed() {
        assertThat(ClipWindow.of(10_000, null)).isEqualTo(new ClipWindow(0, 3));
    }

    @Test
    void theChosenStartIsUsed() {
        assertThat(ClipWindow.of(10_000, 4_250L)).isEqualTo(new ClipWindow(4.25, 3));
    }

    @Test
    void aStartTooCloseToTheEndSlidesBackSoTheClipStaysThreeSeconds() {
        assertThat(ClipWindow.of(10_000, 9_000L)).isEqualTo(new ClipWindow(7, 3));
    }

    @Test
    void aNegativeStartIsTheBeginning() {
        assertThat(ClipWindow.of(10_000, -500L)).isEqualTo(new ClipWindow(0, 3));
    }

    @Test
    void videosShorterThanTheClipAreUsedWhole() {
        assertThat(ClipWindow.of(2_000, 500L)).isEqualTo(new ClipWindow(0, 2));
        assertThat(ClipWindow.of(600, null)).isEqualTo(new ClipWindow(0, 0.6));
    }

    @Test
    void anUnknownLengthKeepsTheChoiceAndTheUsualClip() {
        assertThat(ClipWindow.of(0, 2_000L)).isEqualTo(new ClipWindow(2, 3));
    }

    @Test
    void theLoopCommandSeeksToTheStartBeforeReadingTheInput() {
        var probe = new VideoProcessor.Probe(10_000, 1920, 1080, "30/1", false, false, null, "bt709", "bt709", "yuv420p");
        var command = new VideoProcessor(TestProps.defaults())
                .loopCommand(Path.of("/tmp/in"), Path.of("/tmp/out"), new ClipWindow(4.25, 3), probe);
        int ss = command.indexOf("-ss");
        int input = command.indexOf("-i");
        assertThat(ss).isGreaterThan(-1).isLessThan(input);
        assertThat(command.get(ss + 1)).isEqualTo("4.250");
        assertThat(command.get(command.indexOf("-t") + 1)).isEqualTo("3.000");
    }
}
