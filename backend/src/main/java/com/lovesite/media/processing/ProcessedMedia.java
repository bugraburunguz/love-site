package com.lovesite.media.processing;

import java.nio.file.Path;
import java.time.Instant;

/**
 * Files produced for one media item (all inside the job's temporary directory) plus the extracted metadata.
 * Photos have thumb and display; videos have loop and poster.
 */
public record ProcessedMedia(Path thumb, Path display, Path loop, Path poster,
                             Integer width, Integer height, Long durationMs, Instant takenAt) {
}
