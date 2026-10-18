package com.lovesite.export;

import java.util.Locale;
import java.util.Optional;

public enum ExportType {
    /** one media: polaroid PNG (transparent) / JPEG (page background), or an MP4 of a moving polaroid */
    POLAROID,
    /** one media: 1080 x 1920 Instagram story (JPEG, or MP4 for moving media) */
    STORY,
    /** one media: 1080 x 1350 Instagram post (JPEG, or MP4 for moving media) */
    POST,
    /** album pages: up to 20 (+ cover) 1080 x 1350 JPEGs and a zip of them */
    CAROUSEL,
    /** album / selected media: 1080 x 1920 MP4, 30 fps, at most 90 s */
    REELS,
    /** 3-30 media: WhatsApp sticker files (512 x 512 WebP + tray icon) in a zip, plus single transparent PNGs */
    STICKER_PACK;

    public static Optional<ExportType> parse(String value) {
        if (value == null) return Optional.empty();
        try {
            return Optional.of(valueOf(value.trim().toUpperCase(Locale.ROOT)));
        } catch (IllegalArgumentException e) {
            return Optional.empty();
        }
    }
}
