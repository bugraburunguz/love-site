package com.lovesite.export.render;

import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;

/**
 * ffmpeg command lines of the export pipeline. A scene with moving media is rendered by Chromium as a PNG with TRANSPARENT
 * windows where the videos go; here every loop is scaled like CSS object-fit: cover, given the theme's photo filter, rotated
 * like the polaroid and laid UNDER the PNG at the window's position, then the PNG is put on top. The loops are already SDR,
 * so no tone mapping is needed.
 */
public final class Compositor {

    /** One video window in output pixels: centre, unrotated size, rotation in degrees (clockwise, like CSS). */
    public record Window(Path video, double cx, double cy, double w, double h, double angle, String colour) {
    }

    public enum Output {
        /** the file the user gets: H.264, yuv420p, faststart */
        MP4,
        /** an intermediate clip (reels scenes): nearly lossless and fast */
        MP4_INTERMEDIATE,
        /** an animated sticker frame source: WebP, transparent, scaled to 512 x 512 */
        WEBP_ANIM
    }

    private final String ffmpeg;
    private final List<String> prefix;

    public Compositor(String ffmpeg, List<String> prefix) {
        this.ffmpeg = ffmpeg;
        this.prefix = prefix;
    }

    static int even(double v) {
        int n = (int) Math.round(v);
        return Math.max(2, n + (n % 2));
    }

    /**
     * ffmpeg sizes its filter and encoder thread pools by the CPUs it sees (dozens on a platform host, each with its own frame
     * buffers): filters are capped here, the encoder in the output arguments. `-threads` before the inputs only caps decoding.
     */
    private List<String> head() {
        List<String> c = new ArrayList<>(prefix);
        c.addAll(List.of(ffmpeg, "-hide_banner", "-nostdin", "-loglevel", "error", "-y",
                "-filter_complex_threads", "2", "-filter_threads", "2", "-threads", "2"));
        return c;
    }

    static String fmt(double v) {
        return String.format(Locale.ROOT, "%.3f", v);
    }

    /** Encoder arguments shared by every MP4 segment, so the concat demuxer can join them without re-encoding. */
    static List<String> mp4Args(boolean intermediate) {
        return intermediate
                ? List.of("-c:v", "libx264", "-preset", "veryfast", "-crf", "14", "-pix_fmt", "yuv420p", "-r", "30", "-an", "-threads", "2")
                : List.of("-c:v", "libx264", "-preset", "medium", "-crf", "20", "-profile:v", "high", "-pix_fmt", "yuv420p", "-r", "30",
                        "-g", "60", "-video_track_timescale", "15360", "-an", "-threads", "2");
    }

    /**
     * PNG + video windows -> moving scene of `seconds`. `boomerang`: take 1.5 s of each loop and play it forward and backward
     * (a seamless 3 s loop for animated stickers).
     */
    public List<String> scene(Path png, int width, int height, List<Window> windows, double seconds, int fps, boolean boomerang,
                              Output output, int webpQuality, Path out) {
        List<String> c = head();
        boolean alpha = output == Output.WEBP_ANIM;
        c.addAll(List.of("-f", "lavfi", "-i", "color=c=black@" + (alpha ? "0.0" : "1.0") + ":s=" + width + "x" + height + ":r=" + fps
                + ":d=" + fmt(seconds) + ",format=rgba"));
        for (Window w : windows) c.addAll(List.of("-stream_loop", "-1", "-i", w.video().toString()));
        c.addAll(List.of("-loop", "1", "-framerate", String.valueOf(fps), "-t", fmt(seconds), "-i", png.toString()));
        StringBuilder g = new StringBuilder();
        String base = "[0:v]";
        for (int j = 0; j < windows.size(); j++) {
            Window w = windows.get(j);
            int ow = even(w.w());
            int oh = even(w.h());
            double rad = Math.toRadians(w.angle());
            String in = "[" + (j + 1) + ":v]";
            if (boomerang) {
                g.append(in).append("trim=duration=1.5,setpts=PTS-STARTPTS,fps=").append(fps)
                        .append(",split[f").append(j).append("][b").append(j).append("];[b").append(j).append("]reverse[r").append(j)
                        .append("];[f").append(j).append("][r").append(j).append("]concat=n=2:v=1:a=0,");
            } else {
                g.append(in).append("fps=").append(fps).append(",setpts=PTS-STARTPTS,");
            }
            g.append("scale=").append(ow).append(':').append(oh).append(":force_original_aspect_ratio=increase,crop=").append(ow).append(':').append(oh);
            if (w.colour() != null && !w.colour().isEmpty()) g.append(',').append(w.colour());
            g.append(",format=rgba,rotate=").append(fmt(rad)).append(":ow=rotw(").append(fmt(rad)).append("):oh=roth(").append(fmt(rad))
                    .append("):c=none[v").append(j).append("];");
            g.append(base).append("[v").append(j).append("]overlay=x=").append(fmt(w.cx())).append("-overlay_w/2:y=").append(fmt(w.cy()))
                    .append("-overlay_h/2:eof_action=repeat:format=rgb[m").append(j).append("];");
            base = "[m" + j + "]";
        }
        g.append(base).append('[').append(windows.size() + 1).append(":v]overlay=0:0:format=rgb");
        if (output == Output.WEBP_ANIM) g.append(",scale=512:512:flags=lanczos,format=yuva420p");
        else g.append(",format=yuv420p");
        g.append("[out]");
        c.addAll(List.of("-filter_complex", g.toString(), "-map", "[out]", "-t", fmt(seconds)));
        switch (output) {
            case MP4 -> {
                c.addAll(mp4Args(false));
                c.addAll(List.of("-movflags", "+faststart"));
            }
            case MP4_INTERMEDIATE -> c.addAll(mp4Args(true));
            case WEBP_ANIM -> c.addAll(List.of("-c:v", "libwebp_anim", "-lossless", "0", "-quality", String.valueOf(webpQuality),
                    "-compression_level", "6", "-loop", "0", "-an", "-threads", "2"));
        }
        c.add(out.toString());
        return c;
    }

    /** A still scene as an H.264 segment of `seconds` (reels: cover, photos, closing card). */
    public List<String> still(Path png, double seconds, Path out) {
        List<String> c = head();
        c.addAll(List.of("-loop", "1", "-framerate", "30", "-t", fmt(seconds), "-i", png.toString(),
                "-vf", "format=yuv420p,setsar=1", "-t", fmt(seconds)));
        c.addAll(mp4Args(false));
        c.add(out.toString());
        return c;
    }

    /** Input arguments for a part of a reels scene: a still PNG (any part looks the same) or a clip from `from` seconds. */
    public static List<String> input(Path source, boolean still, double from, double seconds) {
        if (still) return List.of("-loop", "1", "-framerate", "30", "-t", fmt(seconds), "-i", source.toString());
        return List.of("-ss", fmt(from), "-t", fmt(seconds), "-i", source.toString());
    }

    /** One body segment of a reel: part of one scene. */
    public List<String> body(List<String> input, double seconds, Path out) {
        List<String> c = head();
        c.addAll(input);
        c.addAll(List.of("-vf", "fps=30,format=yuv420p,setsar=1", "-t", fmt(seconds)));
        c.addAll(mp4Args(false));
        c.add(out.toString());
        return c;
    }

    /** The transition between two scenes: the end of one slides into the start of the next. */
    public List<String> transition(List<String> from, List<String> to, double seconds, String kind, Path out) {
        List<String> c = head();
        c.addAll(from);
        c.addAll(to);
        String norm = "fps=30,format=yuv420p,setsar=1,setpts=PTS-STARTPTS,settb=AVTB";
        c.addAll(List.of("-filter_complex", "[0:v]" + norm + "[a];[1:v]" + norm + "[b];[a][b]xfade=transition=" + kind
                + ":duration=" + fmt(seconds) + ":offset=0,format=yuv420p[out]", "-map", "[out]", "-t", fmt(seconds)));
        c.addAll(mp4Args(false));
        c.add(out.toString());
        return c;
    }

    /** Joins the segments without re-encoding; adds the album song (faded in / out) or leaves the video silent. */
    public List<String> join(Path list, Path music, double seconds, Path out) {
        List<String> c = head();
        c.addAll(List.of("-f", "concat", "-safe", "0", "-i", list.toString()));
        if (music != null) {
            c.addAll(List.of("-stream_loop", "-1", "-i", music.toString(),
                    "-filter_complex", "[1:a]atrim=duration=" + fmt(seconds) + ",asetpts=PTS-STARTPTS,afade=t=in:st=0:d=1,afade=t=out:st="
                            + fmt(Math.max(0, seconds - 2)) + ":d=2,aresample=44100[a]",
                    "-map", "0:v", "-map", "[a]", "-c:v", "copy", "-c:a", "aac", "-b:a", "160k", "-ac", "2", "-t", fmt(seconds)));
        } else {
            c.addAll(List.of("-map", "0:v", "-c:v", "copy", "-an"));
        }
        c.addAll(List.of("-movflags", "+faststart", out.toString()));
        return c;
    }
}
