package com.lovesite.media.processing;

import org.springframework.stereotype.Component;

import java.io.IOException;
import java.nio.file.Path;
import java.util.List;

/**
 * Photos: thumbnail (long edge 480) and display (long edge 1600) as WebP via libvips. The format is detected from
 * the file content, EXIF orientation is applied, colours go to sRGB and every metadata block (EXIF, GPS, ICC) is
 * stripped. Nothing is ever enlarged.
 */
@Component
public class PhotoProcessor {

    static final int THUMB_EDGE = 480;
    static final int THUMB_QUALITY = 78;
    static final int DISPLAY_EDGE = 1600;
    static final int DISPLAY_QUALITY = 82;

    private static final List<String> LOADERS = List.of("jpegload", "pngload", "webpload", "heifload");

    private final ProcessingProperties properties;

    public PhotoProcessor(ProcessingProperties properties) {
        this.properties = properties;
    }

    public ProcessedMedia process(Path original, Path workDir) throws IOException, InterruptedException {
        requireKnownFormat(original);

        Path thumb = workDir.resolve("thumb.webp");
        Path display = workDir.resolve("display.webp");
        resize(original, thumb, THUMB_EDGE, THUMB_QUALITY);
        resize(original, display, DISPLAY_EDGE, DISPLAY_QUALITY);

        int width = header(display, "width");
        int height = header(display, "height");
        return new ProcessedMedia(thumb, display, null, null, width, height, null,
                ExifDates.readTakenAt(original, properties.defaultTimezone()));
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
