package com.lovesite.media.processing;

import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import java.time.Instant;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.junit.jupiter.api.Assumptions.assumeTrue;

class VideoProcessorTest {

    @TempDir
    Path dir;

    private final VideoProcessor processor = new VideoProcessor(TestProps.defaults());

    @BeforeAll
    static void needTools() {
        assumeTrue(ToolFixtures.toolsAvailable(), "ffmpeg/vips not installed: run the tests in the Docker test image (see backend/test.Dockerfile)");
    }

    private ProcessedMedia process(Path video) throws Exception {
        return processor.process(video, Files.createTempDirectory(dir, "out"));
    }

    @Test
    void aBoomerangLoopWithAPosterAndNoAudio() throws Exception {
        Path source = ToolFixtures.videoWithAudio(dir, "talky.mp4", 5); // has an audio track
        assertThat(ToolFixtures.streamCount(source, "a")).isEqualTo(1);

        ProcessedMedia result = process(source);

        assertThat(result.loop()).exists();
        assertThat(ToolFixtures.streamCount(result.loop(), "a")).as("audio streams in the loop").isZero();
        assertThat(ToolFixtures.ffprobeValue(result.loop(), "v:0", "codec_name")).isEqualTo("h264");
        assertThat(ToolFixtures.ffprobeValue(result.loop(), "v:0", "pix_fmt")).isEqualTo("yuv420p");
        // first 3 s forward + 3 s backward
        assertThat(ToolFixtures.durationSeconds(result.loop())).isBetween(5.7, 6.4);
        assertThat(result.durationMs()).isBetween(4900L, 5100L); // the original's length
        assertThat(result.width()).isEqualTo(640); // 640x360 is below the 720 long edge: not enlarged
        assertThat(result.height()).isEqualTo(360);
        assertThat(ToolFixtures.vipsLoader(result.poster())).startsWith("webpload");
        assertThat(ToolFixtures.vipsHeader(result.poster(), "width")).isEqualTo(640);
        // faststart: the moov atom comes before the media data so playback can begin while downloading
        byte[] head = Files.readAllBytes(result.loop());
        String text = new String(head, 0, Math.min(head.length, 4096), java.nio.charset.StandardCharsets.ISO_8859_1);
        assertThat(text.indexOf("moov")).isPositive().isLessThan(text.indexOf("mdat") < 0 ? Integer.MAX_VALUE : text.indexOf("mdat"));
    }

    @Test
    void aSilentSourceStaysSilent() throws Exception {
        ProcessedMedia result = process(ToolFixtures.video(dir, "silent.mp4", 640, 360, 4));
        assertThat(ToolFixtures.streamCount(result.loop(), "a")).isZero();
    }

    @Test
    void rotationMetadataDecidesWhichWayWidthAndHeightPoint() throws Exception {
        Path plain = ToolFixtures.video(dir, "land.mp4", 640, 360, 4);
        Path rotated = ToolFixtures.rotated(dir, "upright.mp4", plain, 90);

        ProcessedMedia result = process(rotated);

        // stored 640x360, displayed upright: width < height
        assertThat(result.width()).isEqualTo(360);
        assertThat(result.height()).isEqualTo(640);
        // and the pixels really are rotated, not just labelled
        assertThat(ToolFixtures.ffprobeValue(result.loop(), "v:0", "width")).isEqualTo("360");
        assertThat(ToolFixtures.ffprobeValue(result.loop(), "v:0", "height")).isEqualTo("640");
    }

    @Test
    void largeVideosAreScaledToTheLongEdge() throws Exception {
        ProcessedMedia result = process(ToolFixtures.video(dir, "big.mp4", 1920, 1080, 2));
        assertThat(result.width()).isEqualTo(720);
        assertThat(result.height()).isEqualTo(406); // even height, aspect ratio kept
        assertThat(Double.parseDouble(ToolFixtures.ffprobeValue(result.loop(), "v:0", "avg_frame_rate").split("/")[0])).isLessThanOrEqualTo(30 * 1001);
    }

    @Test
    void aHalfSecondVideoIsUsedWhole() throws Exception {
        ProcessedMedia result = process(ToolFixtures.video(dir, "tiny.mp4", 640, 360, 0.5));

        assertThat(result.durationMs()).isBetween(400L, 600L);
        // all of it forward, all of it backward: about a second (not the 2-6 s of normal clips)
        assertThat(ToolFixtures.durationSeconds(result.loop())).isBetween(0.8, 1.3);
    }

    @Test
    void hdrHlgIsToneMappedToSdrBt709() throws Exception {
        assumeTrue(ToolFixtures.hasEncoder("libx265"), "ffmpeg has no libx265: HLG test skipped");
        Path hlg = ToolFixtures.hlgHevc(dir, "hlg.mp4", 3);
        assertThat(ToolFixtures.ffprobeValue(hlg, "v:0", "color_transfer")).isEqualTo("arib-std-b67");
        assertThat(ToolFixtures.ffprobeValue(hlg, "v:0", "pix_fmt")).isEqualTo("yuv420p10le");
        assertThat(processor.probe(hlg).hdr()).isTrue();

        ProcessedMedia result = process(hlg);

        assertThat(ToolFixtures.ffprobeValue(result.loop(), "v:0", "pix_fmt")).isEqualTo("yuv420p");
        assertThat(ToolFixtures.ffprobeValue(result.loop(), "v:0", "color_transfer")).isEqualTo("bt709");
        assertThat(ToolFixtures.ffprobeValue(result.loop(), "v:0", "color_primaries")).isEqualTo("bt709");
        assertThat(ToolFixtures.ffprobeValue(result.loop(), "v:0", "color_space")).isEqualTo("bt709");
        assertThat(processor.probe(result.loop()).hdr()).isFalse();
    }

    @Test
    void theCreationTimeBecomesTheCaptureDate() throws Exception {
        Path tagged = ToolFixtures.video(dir, "tagged.mp4", 640, 360, 2, "-metadata", "creation_time=2023-07-14T10:15:30Z");
        assertThat(process(tagged).takenAt()).isEqualTo(Instant.parse("2023-07-14T10:15:30Z"));

        Path untagged = ToolFixtures.video(dir, "untagged.mp4", 640, 360, 2);
        assertThat(process(untagged).takenAt()).isNull();

        Path ancient = ToolFixtures.video(dir, "ancient.mp4", 640, 360, 2, "-metadata", "creation_time=1970-01-01T00:00:00Z");
        assertThat(process(ancient).takenAt()).isNull();
    }

    @Test
    void aFileWithoutAVideoStreamFails() throws Exception {
        Path text = dir.resolve("fake.mp4");
        Files.writeString(text, "not a video");
        assertThatThrownBy(() -> process(text)).isInstanceOf(java.io.IOException.class);
    }

    @Test
    void anEncodeThatTakesTooLongIsKilledAndTheJobFails() throws Exception {
        assumeTrue(!System.getProperty("os.name").toLowerCase().contains("win"), "needs a POSIX shell");
        Path slowFfmpeg = dir.resolve("slow-ffmpeg");
        Files.writeString(slowFfmpeg, "#!/bin/sh\nsleep 60\n");
        slowFfmpeg.toFile().setExecutable(true);
        var slow = new VideoProcessor(TestProps.defaults("vips", slowFfmpeg.toString(), Duration.ofSeconds(60), Duration.ofSeconds(1)));
        Path video = ToolFixtures.video(dir, "v.mp4", 640, 360, 2);

        long start = System.nanoTime();
        assertThatThrownBy(() -> slow.process(video, Files.createTempDirectory(dir, "slow")))
                .isInstanceOf(ProcessRunner.ProcessTimeoutException.class);
        assertThat(Duration.ofNanos(System.nanoTime() - start)).isLessThan(Duration.ofSeconds(15));
    }

    @Test
    void fpsIsKeptUpTo30AndReducedAbove() {
        assertThat(VideoProcessor.targetFps("24/1")).isEqualTo("24/1");
        assertThat(VideoProcessor.targetFps("30000/1001")).isEqualTo("30000/1001");
        assertThat(VideoProcessor.targetFps("60/1")).isEqualTo("30");
        assertThat(VideoProcessor.targetFps("0/0")).isEqualTo("30");
        assertThat(VideoProcessor.targetFps("")).isEqualTo("30");
    }
}
