package com.lovesite.media.processing;

import com.drew.imaging.ImageMetadataReader;
import com.drew.metadata.Metadata;
import com.drew.metadata.exif.ExifIFD0Directory;
import com.drew.metadata.exif.ExifSubIFDDirectory;
import com.drew.metadata.exif.GpsDirectory;
import com.drew.metadata.icc.IccDirectory;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneId;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.junit.jupiter.api.Assumptions.assumeTrue;

class PhotoProcessorTest {

    @TempDir
    Path dir;

    private final PhotoProcessor processor = new PhotoProcessor(TestProps.defaults());

    @BeforeAll
    static void needTools() {
        assumeTrue(ToolFixtures.toolsAvailable(), "ffmpeg/vips not installed: run the tests in the Docker test image (see backend/test.Dockerfile)");
    }

    @Test
    void orientationIsAppliedAndTheCaptureDateComesFromExifWithItsOffset() throws Exception {
        // sensor is landscape 400x300, EXIF orientation 6 (rotate 90 CW) => it is displayed as portrait 300x400
        Path photo = ToolFixtures.jpegWithExif(dir, "a.jpg", 400, 300, 6, "2023:07:14 10:15:30", "+02:00", true);

        ProcessedMedia result = processor.process(photo, Files.createDirectory(dir.resolve("out1")));

        assertThat(result.width()).isEqualTo(300);
        assertThat(result.height()).isEqualTo(400);
        assertThat(ToolFixtures.vipsHeader(result.display(), "width")).isEqualTo(300);
        assertThat(ToolFixtures.vipsHeader(result.thumb(), "height")).isEqualTo(400); // small originals are never enlarged
        assertThat(result.takenAt()).isEqualTo(Instant.parse("2023-07-14T08:15:30Z")); // +02:00 applied
        assertThat(result.loop()).isNull();
        assertThat(result.poster()).isNull();
        assertThat(result.durationMs()).isNull();
    }

    @Test
    void withoutAnOffsetTheConfiguredTimezoneIsAssumed() throws Exception {
        Path photo = ToolFixtures.jpegWithExif(dir, "b.jpg", 400, 300, 1, "2023:07:14 10:15:30", null, false);

        ProcessedMedia result = processor.process(photo, Files.createDirectory(dir.resolve("out2")));

        assertThat(result.takenAt()).isEqualTo(Instant.parse("2023-07-14T07:15:30Z")); // Europe/Istanbul = +03:00
        // another configured zone changes the answer
        var utcProps = TestProps.with(ZoneId.of("UTC"));
        ProcessedMedia utc = new PhotoProcessor(utcProps).process(photo, Files.createDirectory(dir.resolve("out2b")));
        assertThat(utc.takenAt()).isEqualTo(Instant.parse("2023-07-14T10:15:30Z"));
    }

    @Test
    void absurdDatesAreIgnored() throws Exception {
        Path old = ToolFixtures.jpegWithExif(dir, "old.jpg", 200, 200, 1, "1999:12:31 23:59:59", "+00:00", false);
        Path future = ToolFixtures.jpegWithExif(dir, "future.jpg", 200, 200, 1, "2999:01:01 00:00:00", "+00:00", false);
        assertThat(processor.process(old, Files.createDirectory(dir.resolve("o1"))).takenAt()).isNull();
        assertThat(processor.process(future, Files.createDirectory(dir.resolve("o2"))).takenAt()).isNull();
        Path none = ToolFixtures.jpeg(dir, "none.jpg", 200, 200);
        assertThat(processor.process(none, Files.createDirectory(dir.resolve("o3"))).takenAt()).isNull();
    }

    @Test
    void variantsHaveNoMetadataAtAll() throws Exception {
        Path photo = ToolFixtures.jpegWithExif(dir, "gps.jpg", 400, 300, 6, "2023:07:14 10:15:30", "+02:00", true);
        // the fixture really carries what we claim to strip
        Metadata original = ImageMetadataReader.readMetadata(photo.toFile());
        assertThat(original.getFirstDirectoryOfType(GpsDirectory.class)).isNotNull();
        assertThat(original.getFirstDirectoryOfType(ExifIFD0Directory.class).getInt(ExifIFD0Directory.TAG_ORIENTATION)).isEqualTo(6);

        ProcessedMedia result = processor.process(photo, Files.createDirectory(dir.resolve("out3")));

        for (Path variant : List.of(result.thumb(), result.display())) {
            assertThat(ToolFixtures.vipsLoader(variant)).startsWith("webpload");
            Metadata metadata = ImageMetadataReader.readMetadata(variant.toFile());
            assertThat(metadata.getFirstDirectoryOfType(GpsDirectory.class)).as("GPS in " + variant.getFileName()).isNull();
            assertThat(metadata.getFirstDirectoryOfType(ExifIFD0Directory.class)).as("EXIF in " + variant.getFileName()).isNull();
            assertThat(metadata.getFirstDirectoryOfType(ExifSubIFDDirectory.class)).isNull();
            assertThat(metadata.getFirstDirectoryOfType(IccDirectory.class)).isNull();
            // the bytes themselves carry no EXIF / XMP chunk either
            String raw = new String(Files.readAllBytes(variant), StandardCharsets.ISO_8859_1);
            assertThat(raw).doesNotContain("EXIF").doesNotContain("XMP ").doesNotContain("Exif");
        }
    }

    @Test
    void largePhotosAreScaledToTheLongEdgeAndNeverEnlarged() throws Exception {
        Path big = ToolFixtures.jpeg(dir, "big.jpg", 3000, 2000);
        ProcessedMedia result = processor.process(big, Files.createDirectory(dir.resolve("out4")));

        assertThat(ToolFixtures.vipsHeader(result.thumb(), "width")).isEqualTo(480);
        assertThat(ToolFixtures.vipsHeader(result.thumb(), "height")).isEqualTo(320);
        assertThat(ToolFixtures.vipsHeader(result.display(), "width")).isEqualTo(1600);
        assertThat(ToolFixtures.vipsHeader(result.display(), "height")).isBetween(1066, 1067);
        assertThat(result.width()).isEqualTo(1600);
        assertThat(Files.size(result.thumb())).isLessThan(Files.size(result.display()));
        assertThat(Files.size(result.display())).isLessThan(Files.size(big));
    }

    @Test
    void theFormatIsDetectedFromTheContentNotTheName() throws Exception {
        Path png = ToolFixtures.png(dir, "really-a-png.jpg", 300, 200);
        ProcessedMedia result = processor.process(png, Files.createDirectory(dir.resolve("out5")));
        assertThat(result.width()).isEqualTo(300);

        Path text = dir.resolve("fake.jpg");
        Files.writeString(text, "this is not an image at all");
        assertThatThrownBy(() -> processor.process(text, Files.createDirectory(dir.resolve("out6"))))
                .hasMessageContaining("not a supported image");
    }

    @Test
    void heicPhotosAreDecoded() throws Exception {
        Path heic = ToolFixtures.heic(dir, "photo.heic", 640, 480);
        assumeTrue(heic != null, "vips cannot write HEIC here (no HEVC encoder plugin): HEIC decoding test skipped");

        assertThat(ToolFixtures.vipsLoader(heic)).startsWith("heifload");
        ProcessedMedia result = processor.process(heic, Files.createDirectory(dir.resolve("out7")));

        assertThat(result.width()).isEqualTo(640);
        assertThat(result.height()).isEqualTo(480);
        assertThat(ToolFixtures.vipsLoader(result.display())).startsWith("webpload");
    }

    @Test
    void aProcessThatTakesTooLongIsKilledAndTheJobFails() throws Exception {
        assumeTrue(!System.getProperty("os.name").toLowerCase().contains("win"), "needs a POSIX shell");
        Path slowVips = dir.resolve("slow-vips");
        Files.writeString(slowVips, "#!/bin/sh\nsleep 60\n");
        slowVips.toFile().setExecutable(true);
        var slow = TestProps.defaults(slowVips.toString(), "ffmpeg", Duration.ofSeconds(1), Duration.ofSeconds(1));
        Path photo = ToolFixtures.jpeg(dir, "t.jpg", 200, 200);

        long start = System.nanoTime();
        assertThatThrownBy(() -> new PhotoProcessor(slow).process(photo, Files.createDirectory(dir.resolve("out8"))))
                .isInstanceOf(java.io.IOException.class);
        assertThat(Duration.ofNanos(System.nanoTime() - start)).isLessThan(Duration.ofSeconds(15));
    }
}
