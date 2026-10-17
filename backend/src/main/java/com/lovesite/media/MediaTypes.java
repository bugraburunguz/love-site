package com.lovesite.media;

import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.Set;

/** Allowed upload types and MIME resolution (iOS often sends an empty or generic type for HEIC). */
final class MediaTypes {

    private static final Set<String> ALLOWED = Set.of(
            "image/jpeg", "image/png", "image/webp", "image/heic", "image/heif",
            "video/mp4", "video/quicktime", "video/webm");

    private static final Map<String, String> BY_EXTENSION = Map.of(
            "jpg", "image/jpeg", "jpeg", "image/jpeg", "png", "image/png", "webp", "image/webp",
            "heic", "image/heic", "heif", "image/heif",
            "mp4", "video/mp4", "mov", "video/quicktime", "webm", "video/webm");

    record Resolved(String contentType, MediaKind kind) {
    }

    private MediaTypes() {
    }

    static Optional<Resolved> resolve(String declaredContentType, String filename) {
        String mime = normalize(declaredContentType);
        if (!ALLOWED.contains(mime)) {
            mime = BY_EXTENSION.get(extension(filename));
        }
        if (mime == null) {
            return Optional.empty();
        }
        return Optional.of(new Resolved(mime, mime.startsWith("video/") ? MediaKind.VIDEO : MediaKind.IMAGE));
    }

    static String normalize(String contentType) {
        if (contentType == null) return "";
        int semicolon = contentType.indexOf(';');
        String base = semicolon >= 0 ? contentType.substring(0, semicolon) : contentType;
        return base.trim().toLowerCase(Locale.ROOT);
    }

    private static String extension(String filename) {
        int dot = filename.lastIndexOf('.');
        return dot < 0 ? "" : filename.substring(dot + 1).toLowerCase(Locale.ROOT);
    }
}
