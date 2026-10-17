package com.lovesite.media.processing;

import com.drew.imaging.ImageMetadataReader;
import com.drew.metadata.Metadata;
import com.drew.metadata.exif.ExifSubIFDDirectory;

import java.nio.file.Path;
import java.time.Instant;
import java.time.ZoneId;
import java.time.temporal.ChronoUnit;
import java.util.Date;
import java.util.TimeZone;

/** Capture date from EXIF (DateTimeOriginal, with OffsetTimeOriginal when present). */
final class ExifDates {

    private static final Instant EARLIEST = Instant.parse("2000-01-01T00:00:00Z");

    private ExifDates() {
    }

    /**
     * Local EXIF times without an offset are read in `fallbackZone`. Missing, unreadable or absurd dates
     * (before 2000, or in the future) give null; a broken EXIF block never fails the processing job.
     */
    static Instant readTakenAt(Path file, ZoneId fallbackZone) {
        try {
            Metadata metadata = ImageMetadataReader.readMetadata(file.toFile());
            ExifSubIFDDirectory exif = metadata.getFirstDirectoryOfType(ExifSubIFDDirectory.class);
            if (exif == null) return null;
            Date date = exif.getDateOriginal(TimeZone.getTimeZone(fallbackZone));
            return date == null ? null : sane(date.toInstant());
        } catch (Exception e) {
            return null;
        }
    }

    /** Also used for video creation_time. */
    static Instant sane(Instant instant) {
        if (instant == null) return null;
        if (instant.isBefore(EARLIEST) || instant.isAfter(Instant.now().plus(1, ChronoUnit.DAYS))) return null;
        return instant;
    }
}
