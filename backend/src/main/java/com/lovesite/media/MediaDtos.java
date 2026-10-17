package com.lovesite.media;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

public final class MediaDtos {

    private MediaDtos() {
    }

    /** One file the client wants to upload. Validation happens per file, not on the bean. */
    public record UploadFile(String clientId, String filename, String contentType, Long sizeBytes, String sha256) {
    }

    public record UploadRequest(List<UploadFile> files) {
    }

    public enum UploadResult {
        /** Row created (or reused); the client must PUT the file to uploadUrl, then call complete. */
        PRESIGNED,
        /** Same sha256 already in the album; nothing to upload. */
        DUPLICATE,
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

        static UploadItem error(String clientId, String message) {
            return new UploadItem(clientId, UploadResult.ERROR, null, null, null, message);
        }
    }

    public record UploadResponse(List<UploadItem> items) {
    }

    public record MediaResponse(UUID id, MediaKind type, MediaStatus status, String originalFilename,
                                String contentType, long sizeBytes, Instant createdAt, String url) {

        static MediaResponse from(Media media, String url) {
            return new MediaResponse(media.getId(), media.getType(), media.getStatus(), media.getOriginalFilename(),
                    media.getContentType(), media.getSizeBytes(), media.getCreatedAt(), url);
        }
    }
}
