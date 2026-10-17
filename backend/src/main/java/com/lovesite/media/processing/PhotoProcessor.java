package com.lovesite.media.processing;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;

/**
 * Photos: thumbnail (long edge 480) and display (long edge 1600) as WebP via libvips. The format is detected from
 * the file content, EXIF orientation is applied, colours go to sRGB and every metadata block (EXIF, GPS, ICC) is
 * stripped. Nothing is ever enlarged.
 *
 * An Android Motion Photo (a JPEG with a short MP4 inside) is still an IMAGE, but its video goes through the video
 * pipeline too, so the result also carries a loop and a poster. If anything about the embedded video is wrong the
 * photo is delivered as an ordinary still.
 */
@Component
public class PhotoProcessor {

    static final int THUMB_EDGE = 480;
    static final int THUMB_QUALITY = 78;
    static final int DISPLAY_EDGE = 1600;
    static final int DISPLAY_QUALITY = 82;

    private static final List<String> LOADERS = List.of("jpegload", "pngload", "webpload", "heifload");

    private static final Logger log = LoggerFactory.getLogger(PhotoProcessor.class);

    private final ProcessingProperties properties;
    private final VideoProcessor videos;

    public PhotoProcessor(ProcessingProperties properties) {
        this.properties = properties;
        this.videos = new VideoProcessor(properties);
    }

    public ProcessedMedia process(Path original, Path workDir) throws IOException, InterruptedException {
        requireKnownFormat(original);

        Path thumb = workDir.resolve("thumb.webp");
        Path display = workDir.resolve("display.webp");
        resize(original, thumb, THUMB_EDGE, THUMB_QUALITY);
        resize(original, display, DISPLAY_EDGE, DISPLAY_QUALITY);

        int width = header(display, "width");
        int height = header(display, "height");
        Path[] motion = motionLoop(original, workDir);
        return new ProcessedMedia(thumb, display, motion[0], motion[1], width, height, null,
                ExifDates.readTakenAt(original, properties.defaultTimezone()));
    }

    /** {loop, poster} of the embedded video, or {null, null} for an ordinary photo or an unusable video. */
    private Path[] motionLoop(Path original, Path workDir) throws InterruptedException {
        Path video = workDir.resolve("motion.mp4");
        if (!MotionPhoto.extract(original, video)) return new Path[] {null, null};
        try {
            ProcessedMedia clip = videos.process(video, workDir);
            return new Path[] {clip.loop(), clip.poster()};
        } catch (IOException | RuntimeException e) {
            log.warn("Motion photo video could not be processed, keeping the still photo: {}", e.getMessage());
            return new Path[] {null, null};
        } finally {
            try {
                Files.deleteIfExists(video);
            } catch (IOException ignored) {
                // the work directory is removed afterwards anyway
            }
        }
    }

    /** Looks at the file header (not the name or MIME type) to find which loader would open it. */
    private void requireKnownFormat(Path original) throws IOException, InterruptedException {
        var result = ProcessRunner.run(
                List.of(properties.vipsheader(), "-f", "vips-loader", original.toString()), properties.photoTimeout());
        String loader = result.stdout().trim();
        if (result.exitCode() != 0 || LOADERS.stream().noneMatch(loader::startsWith)) {
            throw new IOException("not a supported image (loader: " + (loader.isEmpty() ? "none" : loader) + ")");
        }
    }

    /** `vips thumbnail` autorotates from EXIF, converts to sRGB and never enlarges (--size down). */
    private void resize(Path in, Path out, int longEdge, int quality) throws IOException, InterruptedException {
        ProcessRunner.runChecked(List.of(
                properties.vips(), "thumbnail", in.toString(), out + "[Q=" + quality + ",strip]",
                String.valueOf(longEdge), "--height", String.valueOf(longEdge),
                "--size", "down", "--export-profile", "srgb"), properties.photoTimeout());
    }

    private int header(Path file, String field) throws IOException, InterruptedException {
        var result = ProcessRunner.runChecked(
                List.of(properties.vipsheader(), "-f", field, file.toString()), properties.photoTimeout());
        return Integer.parseInt(result.stdout().trim());
    }
}
