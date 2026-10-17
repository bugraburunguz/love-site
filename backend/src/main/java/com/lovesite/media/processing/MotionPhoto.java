package com.lovesite.media.processing;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Optional;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Finds the short video that an Android "Motion Photo" carries inside the JPEG file.
 *
 * Three layouts are understood, all of them a JPEG followed by a complete MP4:
 *  - Google Motion Photo (Pixel, current Samsung): XMP says GCamera:MotionPhoto="1" and lists the video as a
 *    Container:Item with Item:Semantic="MotionPhoto" and Item:Length; the video is the last Length bytes of the file.
 *  - Google MicroVideo (older Pixel): GCamera:MicroVideo="1" and GCamera:MicroVideoOffset, the distance from the end.
 *  - Samsung Extension Format (older Galaxy): a "MotionPhoto_Data" tag, the MP4 follows it and a SEF directory trails it.
 *
 * Offsets written by cameras and editors are not always right, so a candidate offset is only trusted when "ftyp" is
 * really there; otherwise the file is scanned for an MP4 header. The end of the video is found by walking its top-level
 * boxes, which also drops a trailing SEF directory. A file without one of the markers is never searched, and nothing
 * here throws: whatever is wrong, the answer is "no video" and the caller keeps a still photo.
 */
final class MotionPhoto {

    /** Photos are limited to 30 MB by the upload rules, so reading one whole is fine for the single worker. */
    private static final long MAX_FILE = 64L * 1024 * 1024;
    private static final int XMP_WINDOW = 512 * 1024;
    private static final int SCAN_FROM = 1024;

    private static final Pattern FLAG = Pattern.compile("(?:MotionPhoto|MicroVideo)(?![\\w])\\s*(?:=\\s*[\"']1[\"']|>\\s*1\\s*<)");
    private static final Pattern ITEM = Pattern.compile("<Container:Item\\b[^>]*>");
    private static final Pattern LENGTH = Pattern.compile("Item:Length\\s*=\\s*[\"'](\\d+)[\"']");
    private static final Pattern MICRO_OFFSET = Pattern.compile("MicroVideoOffset\\s*(?:=\\s*[\"'](\\d+)[\"']|>\\s*(\\d+)\\s*<)");
    private static final byte[] FTYP = {'f', 't', 'y', 'p'};
    private static final byte[] SAMSUNG_TAG = "MotionPhoto_Data".getBytes(StandardCharsets.US_ASCII);

    private MotionPhoto() {
    }

    /** Where the embedded MP4 sits in the file: [start, end). */
    record Range(int start, int end) {
    }

    /** Writes the embedded MP4 to `out` when the file is a motion photo with a usable video. */
    static boolean extract(Path jpeg, Path out) {
        try {
            if (Files.size(jpeg) > MAX_FILE) return false;
            byte[] data = Files.readAllBytes(jpeg);
            Optional<Range> range = locate(data);
            if (range.isEmpty()) return false;
            Files.write(out, java.util.Arrays.copyOfRange(data, range.get().start(), range.get().end()));
            return true;
        } catch (IOException | RuntimeException e) {
            return false;
        }
    }

    static Optional<Range> locate(byte[] data) {
        if (data.length < 32 || (data[0] & 0xFF) != 0xFF || (data[1] & 0xFF) != 0xD8) return Optional.empty(); // JPEG only

        String head = new String(data, 0, Math.min(data.length, XMP_WINDOW), StandardCharsets.ISO_8859_1);
        boolean flagged = FLAG.matcher(head).find();
        boolean samsung = indexOf(data, SAMSUNG_TAG, 0) >= 0;
        if (!flagged && !samsung) return Optional.empty();

        // 1. the offset the metadata claims, trusted only when an MP4 header is really there
        for (long start : declaredStarts(head, data.length)) {
            Optional<Range> range = validated(data, start);
            if (range.isPresent()) return range;
        }
        // 2. the Samsung tag is directly followed by the video
        if (samsung) {
            int tag = indexOf(data, SAMSUNG_TAG, 0);
            for (int at = indexOf(data, FTYP, tag); at >= 0 && at < tag + 4096; at = indexOf(data, FTYP, at + 1)) {
                Optional<Range> range = validated(data, at - 4L);
                if (range.isPresent()) return range;
            }
        }
        // 3. last resort for a wrong offset: the first plausible MP4 header after the image headers
        for (int at = indexOf(data, FTYP, SCAN_FROM); at >= 0; at = indexOf(data, FTYP, at + 1)) {
            Optional<Range> range = validated(data, at - 4L);
            if (range.isPresent()) return range;
        }
        return Optional.empty();
    }

    private static java.util.List<Long> declaredStarts(String xmp, int size) {
        java.util.List<Long> starts = new java.util.ArrayList<>();
        Matcher items = ITEM.matcher(xmp);
        while (items.find()) {
            String item = items.group();
            if (!item.contains("MotionPhoto")) continue;
            Matcher length = LENGTH.matcher(item);
            if (length.find()) starts.add(size - parse(length.group(1)));
        }
        Matcher micro = MICRO_OFFSET.matcher(xmp);
        if (micro.find()) starts.add(size - parse(micro.group(1) != null ? micro.group(1) : micro.group(2)));
        return starts;
    }

    private static long parse(String digits) {
        try {
            return Long.parseLong(digits);
        } catch (NumberFormatException e) {
            return Long.MAX_VALUE / 4; // out of range on purpose: the candidate is rejected
        }
    }

    /** A start is valid when an "ftyp" box is there and the boxes after it lead to a movie (moov) box. */
    private static Optional<Range> validated(byte[] data, long start) {
        if (start < 8 || start > data.length - 16L) return Optional.empty();
        int s = (int) start;
        if (!matches(data, s + 4, FTYP)) return Optional.empty();
        int pos = s;
        int end = -1;
        boolean moov = false;
        while (pos + 8 <= data.length) {
            long size = u32(data, pos);
            if (size == 1) {
                if (pos + 16 > data.length) break;
                size = u64(data, pos + 8);
            } else if (size == 0) {
                size = data.length - (long) pos; // box runs to the end of the file
            }
            if (size < 8 || pos + size > data.length || !printable(data, pos + 4)) break;
            if (matches(data, pos + 4, new byte[] {'m', 'o', 'o', 'v'})) moov = true;
            pos += (int) size;
            end = pos;
        }
        return moov && end > s ? Optional.of(new Range(s, end)) : Optional.empty();
    }

    private static boolean printable(byte[] d, int at) {
        for (int i = 0; i < 4; i++) {
            int c = d[at + i] & 0xFF;
            if (c < 0x20 || c > 0x7E) return false;
        }
        return true;
    }

    private static long u32(byte[] d, int at) {
        return ((d[at] & 0xFFL) << 24) | ((d[at + 1] & 0xFFL) << 16) | ((d[at + 2] & 0xFFL) << 8) | (d[at + 3] & 0xFFL);
    }

    private static long u64(byte[] d, int at) {
        return (u32(d, at) << 32) | u32(d, at + 4);
    }

    private static boolean matches(byte[] d, int at, byte[] needle) {
        if (at < 0 || at + needle.length > d.length) return false;
        for (int i = 0; i < needle.length; i++) {
            if (d[at + i] != needle[i]) return false;
        }
        return true;
    }

    private static int indexOf(byte[] d, byte[] needle, int from) {
        outer:
        for (int i = Math.max(0, from); i <= d.length - needle.length; i++) {
            for (int j = 0; j < needle.length; j++) {
                if (d[i + j] != needle[j]) continue outer;
            }
            return i;
        }
        return -1;
    }
}
