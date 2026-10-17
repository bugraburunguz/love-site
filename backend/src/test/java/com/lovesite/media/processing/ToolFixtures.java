package com.lovesite.media.processing;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;

/**
 * Synthetic test media, generated on the fly with the same tools the app uses (ffmpeg testsrc, vips) plus a small
 * hand-written EXIF block. No personal photos or videos are ever committed to the repository.
 */
final class ToolFixtures {

    private static final Duration TIMEOUT = Duration.ofSeconds(120);

    private ToolFixtures() {
    }

    static boolean toolsAvailable() {
        try {
            return ProcessRunner.run(List.of("ffmpeg", "-version"), Duration.ofSeconds(10)).exitCode() == 0
                    && ProcessRunner.run(List.of("ffprobe", "-version"), Duration.ofSeconds(10)).exitCode() == 0
                    && ProcessRunner.run(List.of("vips", "--version"), Duration.ofSeconds(10)).exitCode() == 0;
        } catch (Exception e) {
            return false;
        }
    }

    static boolean hasEncoder(String name) {
        try {
            return ProcessRunner.run(List.of("ffmpeg", "-hide_banner", "-encoders"), Duration.ofSeconds(10)).stdout().contains(name);
        } catch (Exception e) {
            return false;
        }
    }

    static void run(String... command) throws Exception {
        ProcessRunner.runChecked(List.of(command), TIMEOUT);
    }

    // ------------------------------------------------------------------ photos

    /** A plain JPEG of the given pixel size (ffmpeg testsrc2). */
    static Path jpeg(Path dir, String name, int width, int height) throws Exception {
        Path out = dir.resolve(name);
        run("ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-f", "lavfi", "-i", "testsrc2=size=" + width + "x" + height,
                "-frames:v", "1", "-q:v", "3", out.toString());
        return out;
    }

    static Path png(Path dir, String name, int width, int height) throws Exception {
        Path out = dir.resolve(name);
        run("ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-f", "lavfi", "-i", "testsrc2=size=" + width + "x" + height,
                "-frames:v", "1", out.toString());
        return out;
    }

    /**
     * A JPEG with an EXIF block: orientation, DateTimeOriginal ("2023:07:14 10:15:30"), optionally
     * OffsetTimeOriginal ("+02:00") and a GPS position.
     */
    static Path jpegWithExif(Path dir, String name, int width, int height, int orientation, String dateOriginal,
                             String offsetOriginal, boolean gps) throws Exception {
        byte[] plain = Files.readAllBytes(jpeg(dir, "plain-" + name, width, height));
        byte[] exif = exifSegment(orientation, dateOriginal, offsetOriginal, gps);
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        out.write(plain, 0, 2); // SOI
        out.write(exif);
        out.write(plain, 2, plain.length - 2);
        Path file = dir.resolve(name);
        Files.write(file, out.toByteArray());
        return file;
    }

    /** HEIC from a JPEG through libvips (needs an HEVC encoder plugin); null when this environment cannot write HEIC. */
    static Path heic(Path dir, String name, int width, int height) {
        try {
            Path source = jpeg(dir, "heic-src-" + name + ".jpg", width, height);
            Path out = dir.resolve(name);
            var result = ProcessRunner.run(List.of("vips", "heifsave", source.toString(), out.toString()), TIMEOUT);
            return result.exitCode() == 0 && Files.size(out) > 0 ? out : null;
        } catch (Exception e) {
            return null;
        }
    }

    private static byte[] exifSegment(int orientation, String dateOriginal, String offsetOriginal, boolean gps) throws IOException {
        byte[] date = (dateOriginal + "\0").getBytes(StandardCharsets.US_ASCII);
        byte[] offset = offsetOriginal == null ? null : (offsetOriginal + "\0").getBytes(StandardCharsets.US_ASCII);

        int ifd0Entries = gps ? 3 : 2;
        int exifEntries = offset == null ? 1 : 2;
        int gpsEntries = 4;
        int ifd0Size = 2 + 12 * ifd0Entries + 4;
        int exifSize = 2 + 12 * exifEntries + 4;
        int gpsSize = 2 + 12 * gpsEntries + 4;

        int ifd0At = 8;
        int exifAt = ifd0At + ifd0Size;
        int gpsAt = exifAt + exifSize;
        int dataAt = gps ? gpsAt + gpsSize : gpsAt;
        int dateAt = dataAt;
        int offsetAt = dateAt + date.length;
        int latAt = offsetAt + (offset == null ? 0 : offset.length);
        int lonAt = latAt + 24;
        int end = gps ? lonAt + 24 : latAt;

        ByteBuffer tiff = ByteBuffer.allocate(end).order(ByteOrder.LITTLE_ENDIAN);
        tiff.put((byte) 'I').put((byte) 'I').putShort((short) 42).putInt(ifd0At);

        // IFD0: orientation, pointer to the Exif IFD, optional pointer to the GPS IFD
        tiff.putShort((short) ifd0Entries);
        entry(tiff, 0x0112, 3, 1, orientation);
        entry(tiff, 0x8769, 4, 1, exifAt);
        if (gps) entry(tiff, 0x8825, 4, 1, gpsAt);
        tiff.putInt(0);

        // Exif IFD
        tiff.putShort((short) exifEntries);
        entry(tiff, 0x9003, 2, date.length, dateAt);
        if (offset != null) entry(tiff, 0x9011, 2, offset.length, offsetAt);
        tiff.putInt(0);

        if (gps) {
            tiff.putShort((short) gpsEntries);
            tiff.putShort((short) 0x0001).putShort((short) 2).putInt(2).put((byte) 'N').put((byte) 0).put((byte) 0).put((byte) 0);
            entry(tiff, 0x0002, 5, 3, latAt);
            tiff.putShort((short) 0x0003).putShort((short) 2).putInt(2).put((byte) 'E').put((byte) 0).put((byte) 0).put((byte) 0);
            entry(tiff, 0x0004, 5, 3, lonAt);
            tiff.putInt(0);
        }

        tiff.put(date);
        if (offset != null) tiff.put(offset);
        if (gps) {
            rationals(tiff, 41, 0, 30); // 41 deg 0' 30" N
            rationals(tiff, 29, 1, 15); // 29 deg 1' 15" E
        }

        byte[] body = tiff.array();
        ByteArrayOutputStream segment = new ByteArrayOutputStream();
        int length = 2 + 6 + body.length;
        segment.write(0xFF);
        segment.write(0xE1);
        segment.write(length >> 8);
        segment.write(length & 0xFF);
        segment.write("Exif\0\0".getBytes(StandardCharsets.US_ASCII));
        segment.write(body);
        return segment.toByteArray();
    }

    private static void entry(ByteBuffer b, int tag, int type, int count, int value) {
        b.putShort((short) tag).putShort((short) type).putInt(count);
        if (type == 3 && count == 1) {
            b.putShort((short) value).putShort((short) 0);
        } else {
            b.putInt(value);
        }
    }

    private static void rationals(ByteBuffer b, int deg, int min, int sec) {
        b.putInt(deg).putInt(1).putInt(min).putInt(1).putInt(sec).putInt(1);
    }

    // ------------------------------------------------------------------ videos

    /** H.264 video of the given size and length, no audio. Extra ffmpeg output arguments go in `extra`. */
    static Path video(Path dir, String name, int width, int height, double seconds, String... extra) throws Exception {
        Path out = dir.resolve(name);
        List<String> command = new ArrayList<>(List.of("ffmpeg", "-hide_banner", "-loglevel", "error", "-y",
                "-f", "lavfi", "-i", "testsrc2=size=" + width + "x" + height + ":rate=24:duration=" + seconds,
                "-c:v", "libx264", "-pix_fmt", "yuv420p"));
        command.addAll(List.of(extra));
        command.add(out.toString());
        run(command.toArray(String[]::new));
        return out;
    }

    /** The same video with a sine-wave audio track. */
    static Path videoWithAudio(Path dir, String name, double seconds) throws Exception {
        Path out = dir.resolve(name);
        run("ffmpeg", "-hide_banner", "-loglevel", "error", "-y",
                "-f", "lavfi", "-i", "testsrc2=size=640x360:rate=24:duration=" + seconds,
                "-f", "lavfi", "-i", "sine=frequency=440:duration=" + seconds,
                "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", "-shortest", out.toString());
        return out;
    }

    /** Stores a display rotation (90 = turned counter-clockwise, like a phone held upright) without re-encoding. */
    static Path rotated(Path dir, String name, Path source, int degrees) throws Exception {
        Path out = dir.resolve(name);
        run("ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-display_rotation", String.valueOf(degrees),
                "-i", source.toString(), "-c", "copy", "-map_metadata", "0", out.toString());
        return out;
    }

    /** 10-bit HEVC tagged as HLG / BT.2020, like an iPhone HDR clip. */
    static Path hlgHevc(Path dir, String name, double seconds) throws Exception {
        Path out = dir.resolve(name);
        run("ffmpeg", "-hide_banner", "-loglevel", "error", "-y",
                "-f", "lavfi", "-i", "testsrc2=size=640x360:rate=24:duration=" + seconds,
                "-vf", "format=yuv420p10le", "-c:v", "libx265", "-pix_fmt", "yuv420p10le",
                "-x265-params", "colorprim=bt2020:transfer=arib-std-b67:colormatrix=bt2020nc:log-level=error",
                "-tag:v", "hvc1", out.toString());
        return out;
    }

    // ------------------------------------------------------------------ inspection

    static String ffprobeValue(Path file, String streamSelector, String entry) throws Exception {
        var result = ProcessRunner.runChecked(List.of("ffprobe", "-v", "error", "-select_streams", streamSelector,
                "-show_entries", "stream=" + entry, "-of", "default=noprint_wrappers=1:nokey=1", file.toString()), TIMEOUT);
        return result.stdout().trim();
    }

    static int streamCount(Path file, String selector) throws Exception {
        String out = ffprobeValue(file, selector, "index");
        return out.isEmpty() ? 0 : out.split("\\R").length;
    }

    static double durationSeconds(Path file) throws Exception {
        var result = ProcessRunner.runChecked(List.of("ffprobe", "-v", "error", "-show_entries", "format=duration",
                "-of", "default=noprint_wrappers=1:nokey=1", file.toString()), TIMEOUT);
        return Double.parseDouble(result.stdout().trim());
    }

    static int vipsHeader(Path file, String field) throws Exception {
        return Integer.parseInt(ProcessRunner.runChecked(List.of("vipsheader", "-f", field, file.toString()), TIMEOUT).stdout().trim());
    }

    static String vipsLoader(Path file) throws Exception {
        return ProcessRunner.runChecked(List.of("vipsheader", "-f", "vips-loader", file.toString()), TIMEOUT).stdout().trim();
    }

    // ------------------------------------------------------------------ Android Motion Photo

    /** A Google-style Motion Photo: JPEG with an XMP container entry, the MP4 appended at the end. */
    static Path motionPhoto(Path dir, String name, int width, int height) throws Exception {
        byte[] still = Files.readAllBytes(jpeg(dir, name + ".still.jpg", width, height));
        byte[] video = Files.readAllBytes(video(dir, name + ".clip.mp4", 320, 240, 1.5));
        String xmp = "<x:xmpmeta xmlns:x=\"adobe:ns:meta/\"><rdf:RDF xmlns:rdf=\"http://www.w3.org/1999/02/22-rdf-syntax-ns#\">"
                + "<rdf:Description xmlns:GCamera=\"http://ns.google.com/photos/1.0/camera/\" xmlns:Container=\"http://ns.google.com/photos/1.0/container/\" "
                + "xmlns:Item=\"http://ns.google.com/photos/1.0/container/item/\" GCamera:MotionPhoto=\"1\" GCamera:MotionPhotoVersion=\"1\">"
                + "<Container:Directory><rdf:Seq><rdf:li rdf:parseType=\"Resource\"><Container:Item Item:Mime=\"video/mp4\" Item:Semantic=\"MotionPhoto\" "
                + "Item:Length=\"" + video.length + "\" Item:Padding=\"0\"/></rdf:li></rdf:Seq></Container:Directory></rdf:Description></rdf:RDF></x:xmpmeta>";
        byte[] ns = "http://ns.adobe.com/xap/1.0/ ".getBytes(StandardCharsets.US_ASCII);
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
        out.write(still, 2, still.length - 2);
        out.writeBytes(video);
        Path file = dir.resolve(name);
        Files.write(file, out.toByteArray());
        return file;
    }
}
