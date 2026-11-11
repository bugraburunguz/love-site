package com.lovesite.media.processing;

/**
 * The part of a video that becomes its living photo: {@code length} seconds from {@code start} (LS-22: the user picks
 * the start; before that it was always the first 3 seconds). Times in seconds, as ffmpeg takes them.
 */
public record ClipWindow(double start, double length) {

    /** at most this long; a boomerang of it plays 2 × length */
    static final double CLIP_SECONDS = 3.0;

    /**
     * @param durationMs the video's length (0 when ffprobe could not tell)
     * @param requestedStartMs where the user wants the clip to start, or null for the beginning
     */
    public static ClipWindow of(long durationMs, Long requestedStartMs) {
        double wanted = requestedStartMs == null ? 0 : Math.max(0, requestedStartMs) / 1000.0;
        // unknown length: nothing keeps the choice inside the video (a start past its end gives a clip without frames)
        if (durationMs <= 0) return new ClipWindow(0, CLIP_SECONDS);
        double seconds = durationMs / 1000.0;
        if (seconds <= CLIP_SECONDS) return new ClipWindow(0, seconds); // short videos are used whole
        // slide back from the end so the clip keeps its full length
        double start = Math.min(wanted, seconds - CLIP_SECONDS);
        return new ClipWindow(start, CLIP_SECONDS);
    }
}
