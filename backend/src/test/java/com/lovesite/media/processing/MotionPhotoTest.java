package com.lovesite.media.processing;

import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.io.ByteArrayOutputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;

import static org.assertj.core.api.Assertions.assertThat;
import static org.junit.jupiter.api.Assumptions.assumeTrue;

/**
 * Android Motion Photos built from synthetic parts (a generated JPEG, a generated MP4 and hand-written XMP / SEF bytes).
 * No camera file is ever committed.
 */
class MotionPhotoTest {

    @TempDir
    Path dir;

    private final PhotoProcessor processor = new PhotoProcessor(TestProps.defaults());

    @BeforeAll
    static void needTools() {
        assumeTrue(ToolFixtures.toolsAvailable(), "ffmpeg/vips not installed: run the tests in the Docker test image (see backend/test.Dockerfile)");
    }

    // ---- fixtures

    private byte[] jpeg() throws Exception {
        return Files.readAllBytes(ToolFixtures.jpeg(dir, "still-" + System.nanoTime() + ".jpg", 640, 480));
    }

    private byte[] mp4() throws Exception {
        return Files.readAllBytes(ToolFixtures.video(dir, "clip-" + System.nanoTime() + ".mp4", 320, 240, 1.5));
    }

    /** SOI + an APP1 segment holding the XMP packet + the rest of the JPEG. */
    private static byte[] withXmp(byte[] jpeg, String xmp) {
        byte[] ns = "http://ns.adobe.com/xap/1.0/\0".getBytes(StandardCharsets.US_ASCII);
        byte[] body = xmp.getBytes(StandardCharsets.UTF_8);
        int length = 2 + ns.length + body.length;
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        out.write(0xFF);
        out.write(0xD8);
        out.write(0xFF);
        out.write(0xE1);
        out.write(length >> 8);
        out.write(length & 0xFF);
        out.writeBytes(ns);
        out.writeBytes(body);
        out.write(jpeg, 2, jpeg.length - 2);
        return out.toByteArray();
    }

    private static byte[] concat(byte[]... parts) {
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        for (byte[] p : parts) out.writeBytes(p);
        return out.toByteArray();
    }

    private static String googleXmp(long videoLength) {
        return "<x:xmpmeta xmlns:x=\"adobe:ns:meta/\"><rdf:RDF xmlns:rdf=\"http://www.w3.org/1999/02/22-rdf-syntax-ns#\">"
                + "<rdf:Description xmlns:GCamera=\"http://ns.google.com/photos/1.0/camera/\" xmlns:Container=\"http://ns.google.com/photos/1.0/container/\" "
                + "xmlns:Item=\"http://ns.google.com/photos/1.0/container/item/\" GCamera:MotionPhoto=\"1\" GCamera:MotionPhotoVersion=\"1\" "
                + "GCamera:MotionPhotoPresentationTimestampUs=\"500000\"><Container:Directory><rdf:Seq>"
                + "<rdf:li rdf:parseType=\"Resource\"><Container:Item Item:Mime=\"image/jpeg\" Item:Semantic=\"Primary\" Item:Length=\"0\" Item:Padding=\"0\"/></rdf:li>"
                + "<rdf:li rdf:parseType=\"Resource\"><Container:Item Item:Mime=\"video/mp4\" Item:Semantic=\"MotionPhoto\" Item:Length=\"" + videoLength + "\" Item:Padding=\"0\"/></rdf:li>"
                + "</rdf:Seq></Container:Directory></rdf:Description></rdf:RDF></x:xmpmeta>";
    }

    private static String microVideoXmp(long offsetFromEnd) {
        return "<x:xmpmeta xmlns:x=\"adobe:ns:meta/\"><rdf:RDF xmlns:rdf=\"http://www.w3.org/1999/02/22-rdf-syntax-ns#\">"
                + "<rdf:Description xmlns:GCamera=\"http://ns.google.com/photos/1.0/camera/\" GCamera:MicroVideo=\"1\" GCamera:MicroVideoVersion=\"1\" "
                + "GCamera:MicroVideoOffset=\"" + offsetFromEnd + "\" GCamera:MicroVideoPresentationTimestampUs=\"500000\"/></rdf:RDF></x:xmpmeta>";
    }

    /** What an older Galaxy appends after the video: a SEF directory that ends in the "SEFT" magic. */
    private static byte[] samsungTrailer() {
        return concat("SEFH".getBytes(StandardCharsets.US_ASCII), new byte[] {0, 0, 0, 0, 1, 0, 0, 0},
                "MotionPhoto_Data".getBytes(StandardCharsets.US_ASCII), new byte[] {0, 0, 0, 0, 24, 0, 0, 0}, "SEFT".getBytes(StandardCharsets.US_ASCII));
    }

    private Path file(byte[] bytes) throws Exception {
        Path p = dir.resolve("photo-" + System.nanoTime() + ".jpg");
        Files.write(p, bytes);
        return p;
    }

    private ProcessedMedia process(byte[] bytes) throws Exception {
        return processor.process(file(bytes), Files.createDirectory(dir.resolve("out-" + System.nanoTime())));
    }

    private void assertLive(ProcessedMedia result) throws Exception {
        assertThat(result.thumb()).exists();
        assertThat(result.display()).exists();
        assertThat(result.loop()).as("loop").isNotNull().exists();
        assertThat(result.poster()).as("poster").isNotNull().exists();
        assertThat(ToolFixtures.ffprobeValue(result.loop(), "v:0", "codec_name")).isEqualTo("h264");
        assertThat(ToolFixtures.streamCount(result.loop(), "a")).isZero();
        assertThat(ToolFixtures.durationSeconds(result.loop())).isBetween(2.8, 3.3); // 1.5 s forward + 1.5 s backward
        // it is still the photo that decides size and date
        assertThat(result.width()).isEqualTo(640);
        assertThat(result.height()).isEqualTo(480);
    }

    private void assertStill(ProcessedMedia result) {
        assertThat(result.thumb()).exists();
        assertThat(result.display()).exists();
        assertThat(result.loop()).isNull();
        assertThat(result.poster()).isNull();
    }

    // ---- the three layouts

    @Test
    void googleMotionPhotoLengthPointsAtTheVideoAtTheEnd() throws Exception {
        byte[] video = mp4();
        assertLive(process(concat(withXmp(jpeg(), googleXmp(video.length)), video)));
    }

    @Test
    void googleMicroVideoOffsetIsMeasuredFromTheEnd() throws Exception {
        byte[] video = mp4();
        assertLive(process(concat(withXmp(jpeg(), microVideoXmp(video.length)), video)));
    }

    @Test
    void samsungTagFollowedByTheVideoAndATrailerWithoutXmp() throws Exception {
        byte[] video = mp4();
        byte[] file = concat(jpeg(), "MotionPhoto_Data".getBytes(StandardCharsets.US_ASCII), video, samsungTrailer());
        assertLive(process(file));
        // the trailer is cut off: the extracted video is exactly the MP4
        var range = MotionPhoto.locate(file).orElseThrow();
        assertThat(range.end() - range.start()).isEqualTo(video.length);
    }

    @Test
    void samsungWithGoogleStyleXmpAndTrailerStillFindsTheVideo() throws Exception {
        byte[] video = mp4();
        // Length counts the trailer too, as some firmware writes it: the box walk trims it
        byte[] trailer = samsungTrailer();
        byte[] file = concat(withXmp(jpeg(), googleXmp(video.length + trailer.length)), video, trailer);
        assertLive(process(file));
    }

    // ---- bad data never breaks the photo

    @Test
    void aWrongOffsetFallsBackToSearchingForTheVideoHeader() throws Exception {
        byte[] video = mp4();
        byte[] file = concat(withXmp(jpeg(), googleXmp(video.length + 5000)), video); // claims 5000 bytes too many
        assertLive(process(file));
        byte[] pointingIntoTheMiddle = concat(withXmp(jpeg(), microVideoXmp(video.length / 2)), video);
        assertLive(process(pointingIntoTheMiddle));
    }

    @Test
    void anOffsetBeyondTheFileAndNoVideoGivesAStillPhoto() throws Exception {
        assertStill(process(withXmp(jpeg(), googleXmp(99_999_999L))));
        assertStill(process(withXmp(jpeg(), microVideoXmp(-5))));
        assertStill(process(withXmp(jpeg(), googleXmp(Long.parseLong("9223372036854775807")))));
    }

    @Test
    void aBrokenEmbeddedVideoGivesAStillPhoto() throws Exception {
        byte[] video = mp4();
        byte[] truncated = java.util.Arrays.copyOf(video, video.length / 3);
        assertStill(process(concat(withXmp(jpeg(), googleXmp(truncated.length)), truncated)));
        // a header that looks like MP4 but holds nothing a decoder understands
        byte[] junk = concat(new byte[] {0, 0, 0, 16}, "ftypisom".getBytes(StandardCharsets.US_ASCII), new byte[] {0, 0, 0, 0},
                new byte[] {0, 0, 0, 12}, "moov".getBytes(StandardCharsets.US_ASCII), new byte[] {1, 2, 3, 4});
        assertStill(process(concat(withXmp(jpeg(), googleXmp(junk.length)), junk)));
    }

    @Test
    void aMotionFlagWithoutAnyVideoGivesAStillPhoto() throws Exception {
        assertStill(process(withXmp(jpeg(), googleXmp(1234))));
    }

    @Test
    void anOrdinaryPhotoIsNeverSearchedEvenWithAnMp4Appended() throws Exception {
        // no marker: bytes that happen to look like a video are not trusted
        assertStill(process(concat(jpeg(), mp4())));
        assertStill(process(jpeg()));
    }

    @Test
    void theMarkerMustBeOneNotZero() throws Exception {
        byte[] video = mp4();
        String off = googleXmp(video.length).replace("GCamera:MotionPhoto=\"1\"", "GCamera:MotionPhoto=\"0\"");
        assertStill(process(concat(withXmp(jpeg(), off), video)));
    }
}
