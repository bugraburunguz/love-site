package com.lovesite.media.processing;

import org.springframework.stereotype.Component;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

import java.io.IOException;
import java.nio.file.Path;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;

/**
 * Videos: a silent boomerang loop (first 3 s forward, then backward) as H.264 MP4 plus a WebP poster.
 * HDR (HLG / PQ) sources are tone-mapped to SDR bt709, otherwise iPhone clips look washed out.
 */
@Component
public class VideoProcessor {

    static final double CLIP_SECONDS = 3.0;
    static final double SHORT_VIDEO_SECONDS = 1.0;
    static final int LONG_EDGE = 720;
    static final double MAX_FPS = 30;

    private static final JsonMapper JSON = JsonMapper.builder().build();

    private final ProcessingProperties properties;

    public VideoProcessor(ProcessingProperties properties) {
        this.properties = properties;
    }

    /** What ffprobe tells us about a file. */
    record Probe(long durationMs, int width, int height, String fps, boolean hdr, boolean hasAudio, Instant creationTime,
                 String colorTransfer, String colorPrimaries, String pixelFormat) {
    }

    public ProcessedMedia process(Path original, Path workDir) throws IOException, InterruptedException {
        Probe source = probe(original);

        // Videos shorter than a second are used whole; otherwise the first 3 s (or all of it when shorter).
        double seconds = source.durationMs() / 1000.0;
        double clip = seconds <= 0 ? CLIP_SECONDS : seconds < SHORT_VIDEO_SECONDS ? seconds : Math.min(CLIP_SECONDS, seconds);

        Path loop = workDir.resolve("loop.mp4");
        ProcessRunner.runChecked(loopCommand(original, loop, clip, source), properties.videoTimeout());

        Path poster = workDir.resolve("poster.webp");
        ProcessRunner.runChecked(List.of(
                properties.ffmpeg(), "-hide_banner", "-nostdin", "-loglevel", "error", "-y", "-threads", "2",
                "-i", loop.toString(), "-frames:v", "1", "-an", "-c:v", "libwebp", "-quality", "80", poster.toString()),
                properties.videoTimeout());

        Probe result = probe(loop);
        return new ProcessedMedia(null, null, loop, poster, result.width(), result.height(),
                source.durationMs(), ExifDates.sane(source.creationTime()));
    }

    List<String> loopCommand(Path in, Path out, double clipSeconds, Probe source) {
        String scale = "scale=w='if(gte(iw,ih),min(" + LONG_EDGE + ",iw),-2)':h='if(gte(iw,ih),-2,min(" + LONG_EDGE + ",ih))'";
        // Scale first (cheap, still 10-bit), then tone-map at the small size: tone-mapping 4K frames in float is far too slow.
        String colour = source.hdr()
                ? "zscale=t=linear:npl=100,format=gbrpf32le,zscale=p=bt709,tonemap=tonemap=hable:desat=0,"
                        + "zscale=t=bt709:m=bt709:r=tv,format=yuv420p"
                : "format=yuv420p";
        String chain = scale + (source.hdr() ? "" : ":out_color_matrix=bt709:out_range=tv")
                + ",fps=" + targetFps(source.fps()) + "," + colour + ",setsar=1";
        String graph = "[0:v:0]" + chain + ",split[a][b];[b]reverse[r];[a][r]concat=n=2:v=1:a=0[v]";

        List<String> command = new ArrayList<>(List.of(
                properties.ffmpeg(), "-hide_banner", "-nostdin", "-loglevel", "error", "-y", "-threads", "2",
                "-t", String.format(Locale.ROOT, "%.3f", clipSeconds), "-i", in.toString(),
                "-filter_complex", graph, "-map", "[v]", "-an",
                "-c:v", "libx264", "-preset", "medium", "-crf", "26", "-profile:v", "high", "-pix_fmt", "yuv420p",
                "-threads", "2", "-movflags", "+faststart",
                "-colorspace", "bt709", "-color_primaries", "bt709", "-color_trc", "bt709", "-color_range", "tv",
                out.toString()));
        return command;
    }

    /** Keep the source rate up to 30 fps; faster sources are reduced to 30. */
    static String targetFps(String sourceRate) {
        double rate = parseRate(sourceRate);
        return rate > 0 && rate <= MAX_FPS + 0.01 ? sourceRate : "30";
    }

    static double parseRate(String rate) {
        if (rate == null || rate.isBlank()) return 0;
        try {
            String[] parts = rate.split("/");
            double num = Double.parseDouble(parts[0]);
            double den = parts.length > 1 ? Double.parseDouble(parts[1]) : 1;
            return den == 0 ? 0 : num / den;
        } catch (NumberFormatException e) {
            return 0;
        }
    }

    Probe probe(Path file) throws IOException, InterruptedException {
        var result = ProcessRunner.runChecked(List.of(
                properties.ffprobe(), "-v", "error", "-print_format", "json", "-show_format", "-show_streams", file.toString()),
                properties.videoTimeout());
        JsonNode root = JSON.readTree(result.stdout());

        JsonNode video = null;
        boolean audio = false;
        for (JsonNode stream : root.path("streams")) {
            String type = stream.path("codec_type").asString("");
            if (type.equals("audio")) audio = true;
            boolean attachedPicture = stream.path("disposition").path("attached_pic").asInt(0) == 1;
            if (type.equals("video") && !attachedPicture && video == null) video = stream;
        }
        if (video == null) throw new IOException("no video stream found");

        JsonNode format = root.path("format");
        double seconds = parseDouble(format.path("duration").asString(""), parseDouble(video.path("duration").asString(""), 0));
        String transfer = video.path("color_transfer").asString("");
        boolean hdr = transfer.equals("arib-std-b67") || transfer.equals("smpte2084");
        String created = format.path("tags").path("creation_time").asString(video.path("tags").path("creation_time").asString(""));

        String fps = video.path("avg_frame_rate").asString("");
        if (parseRate(fps) <= 0) fps = video.path("r_frame_rate").asString("");

        return new Probe(Math.round(seconds * 1000), video.path("width").asInt(0), video.path("height").asInt(0), fps, hdr,
                audio, parseInstant(created), transfer, video.path("color_primaries").asString(""),
                video.path("pix_fmt").asString(""));
    }

    private static double parseDouble(String value, double fallback) {
        try {
            return Double.parseDouble(value);
        } catch (NumberFormatException e) {
            return fallback;
        }
    }

    private static Instant parseInstant(String value) {
        try {
            return value == null || value.isBlank() ? null : Instant.parse(value);
        } catch (Exception e) {
            return null;
        }
    }
}
