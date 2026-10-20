package com.lovesite.media;

import jakarta.validation.constraints.Size;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

public final class MediaDtos {

    private MediaDtos() {
    }

    /** One file the client wants to upload. Validation happens per file, not on the bean. */
    public record UploadFile(String clientId, String filename, String contentType, Long sizeBytes, String sha256,
                             Long lastModified, Boolean featured) {
    }

    public record UploadRequest(List<UploadFile> files) {
    }

    public enum UploadResult {
        /** Row created (or reused); the client must PUT the file to uploadUrl, then call complete. */
        PRESIGNED,
        /** Same sha256 already in the album; nothing to upload. */
        DUPLICATE,
        /** The space has no room for this file; other files of the same batch may still fit. */
        QUOTA_EXCEEDED,
        ERROR
    }

    /**
     * contentType is the resolved type and must be sent as the Content-Type of the PUT.
     * mediaId is set for PRESIGNED and DUPLICATE (the existing media).
     */
    public record UploadItem(String clientId, UploadResult result, UUID mediaId, String uploadUrl,
                             String contentType, String error) {

        static UploadItem presigned(String clientId, UUID mediaId, String url, String contentType) {
            return new UploadItem(clientId, UploadResult.PRESIGNED, mediaId, url, contentType, null);
        }

        static UploadItem duplicate(String clientId, UUID existingMediaId) {
            return new UploadItem(clientId, UploadResult.DUPLICATE, existingMediaId, null, null, null);
        }

        static UploadItem quotaExceeded(String clientId, String message) {
            return new UploadItem(clientId, UploadResult.QUOTA_EXCEEDED, null, null, null, message);
        }

        static UploadItem error(String clientId, String message) {
            return new UploadItem(clientId, UploadResult.ERROR, null, null, null, message);
        }
    }

    public record UploadResponse(List<UploadItem> items) {
    }

    public record CaptionRequest(@Size(max = 280, message = "Altyazı en fazla 280 karakter olabilir") String caption) {
    }

    /**
     * What the client needs to draw a media item. The original file is never exposed; variant URLs are only set once
     * the item is READY (null while UPLOADED / PROCESSING and for FAILED). Photos have thumbUrl + displayUrl, videos
     * have loopUrl + posterUrl. width / height are the display size (rotation applied). displayDate is the capture date
     * (EXIF / video metadata), else the file's modified time on the uploader's device, else the upload time; a date set by hand
     * wins over all of them (dateOverridden, originalDate = what it would be without it). dateUncertain: neither set by hand
     * nor read from the file itself.
     * FAILED carries no error detail.
     */
    public record MediaResponse(UUID id, MediaKind type, MediaStatus status, String originalFilename,
                                String contentType, long sizeBytes, Instant createdAt, Instant clientModifiedAt,
                                Instant displayDate, String caption,
                                String thumbUrl, String displayUrl, String loopUrl, String posterUrl,
                                Integer width, Integer height, Long durationMs, String uploadedByName,
                                UUID albumId, boolean dateUncertain, boolean dateOverridden, Instant originalDate) {
    }

    /** null takenAt = back to the original date */
    public record DateRequest(Instant takenAt) {
    }
}
