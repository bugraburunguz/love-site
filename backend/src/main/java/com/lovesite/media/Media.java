package com.lovesite.media;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "media")
public class Media {

    @Id
    private UUID id;

    @Column(name = "space_id", nullable = false, updatable = false)
    private UUID spaceId;

    @Column(name = "album_id", nullable = false)
    private UUID albumId;

    @Column(name = "uploaded_by", nullable = false)
    private UUID uploadedBy;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private MediaKind type;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private MediaStatus status;

    @Column(name = "original_key", nullable = false)
    private String originalKey;

    @Column(name = "original_filename", nullable = false)
    private String originalFilename;

    @Column(name = "content_type", nullable = false)
    private String contentType;

    @Column(name = "size_bytes", nullable = false)
    private long sizeBytes;

    private String sha256;

    @Column(length = 280)
    private String caption;

    @Column(name = "client_modified_at")
    private Instant clientModifiedAt;

    // ---- processing pipeline
    @Column(nullable = false)
    private int attempts;

    @Column(name = "last_error", length = 300)
    private String lastError;

    @Column(name = "next_attempt_at")
    private Instant nextAttemptAt;

    @Column(name = "processing_started_at")
    private Instant processingStartedAt;

    @Column(name = "processing_version", nullable = false)
    private int processingVersion;

    private Integer width;

    private Integer height;

    @Column(name = "duration_ms")
    private Long durationMs;

    @Column(name = "taken_at")
    private Instant takenAt;

    @Column(name = "thumb_key", length = 512)
    private String thumbKey;

    @Column(name = "display_key", length = 512)
    private String displayKey;

    @Column(name = "loop_key", length = 512)
    private String loopKey;

    @Column(name = "poster_key", length = 512)
    private String posterKey;

    /** total size of thumb/display/loop/poster objects; counts against the space quota */
    @Column(name = "variants_bytes")
    private Long variantsBytes;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt = Instant.now();

    @Column(name = "deleted_at")
    private Instant deletedAt;

    protected Media() {
    }

    public Media(UUID id, UUID spaceId, UUID albumId, UUID uploadedBy, MediaKind type, String originalFilename,
                 String contentType, long sizeBytes, String sha256, Instant clientModifiedAt) {
        this.id = id;
        this.spaceId = spaceId;
        this.albumId = albumId;
        this.uploadedBy = uploadedBy;
        this.type = type;
        this.status = MediaStatus.PENDING_UPLOAD;
        // media uploaded before tenancy keep their old "albums/..." key; the worker derives variant paths from this key
        this.originalKey = "spaces/" + spaceId + "/albums/" + albumId + "/media/" + id + "/original";
        this.originalFilename = originalFilename;
        this.contentType = contentType;
        this.sizeBytes = sizeBytes;
        this.sha256 = sha256;
        this.clientModifiedAt = clientModifiedAt;
    }

    /** A retry of a still-pending upload: same row and key, fresh metadata. */
    public void reissue(MediaKind type, String originalFilename, String contentType, long sizeBytes, Instant clientModifiedAt) {
        this.clientModifiedAt = clientModifiedAt;
        this.type = type;
        this.originalFilename = originalFilename;
        this.contentType = contentType;
        this.sizeBytes = sizeBytes;
    }

    public void markUploaded(long actualSize) {
        this.status = MediaStatus.UPLOADED;
        this.sizeBytes = actualSize;
    }

    /** Failed validation after upload: kept for audit, but hidden and no longer blocks the sha256. */
    public void reject() {
        this.status = MediaStatus.REJECTED;
        this.deletedAt = Instant.now();
    }

    public void softDelete() {
        this.deletedAt = Instant.now();
    }

    /** Result of a successful processing run. */
    public void markReady(int version, Integer width, Integer height, Long durationMs, Instant takenAt,
                          String thumbKey, String displayKey, String loopKey, String posterKey, long variantsBytes) {
        this.status = MediaStatus.READY;
        this.variantsBytes = variantsBytes;
        this.processingVersion = version;
        this.width = width;
        this.height = height;
        this.durationMs = durationMs;
        this.takenAt = takenAt;
        this.thumbKey = thumbKey;
        this.displayKey = displayKey;
        this.loopKey = loopKey;
        this.posterKey = posterKey;
        this.attempts = 0;
        this.lastError = null;
        this.nextAttemptAt = null;
        this.processingStartedAt = null;
    }

    /** Puts a FAILED or READY item back in the queue with a fresh attempt counter. */
    public void requeue() {
        this.status = MediaStatus.UPLOADED;
        this.attempts = 0;
        this.lastError = null;
        this.nextAttemptAt = null;
        this.processingStartedAt = null;
    }

    public void setCaption(String caption) {
        this.caption = caption;
    }

    public String getCaption() {
        return caption;
    }

    public UUID getId() {
        return id;
    }

    public UUID getSpaceId() {
        return spaceId;
    }

    public Long getVariantsBytes() {
        return variantsBytes;
    }

    public UUID getAlbumId() {
        return albumId;
    }

    public UUID getUploadedBy() {
        return uploadedBy;
    }

    public MediaKind getType() {
        return type;
    }

    public MediaStatus getStatus() {
        return status;
    }

    public String getOriginalKey() {
        return originalKey;
    }

    public String getOriginalFilename() {
        return originalFilename;
    }

    public String getContentType() {
        return contentType;
    }

    public long getSizeBytes() {
        return sizeBytes;
    }

    public String getSha256() {
        return sha256;
    }

    public int getAttempts() {
        return attempts;
    }

    public String getLastError() {
        return lastError;
    }

    public Instant getNextAttemptAt() {
        return nextAttemptAt;
    }

    public int getProcessingVersion() {
        return processingVersion;
    }

    public Integer getWidth() {
        return width;
    }

    public Integer getHeight() {
        return height;
    }

    public Long getDurationMs() {
        return durationMs;
    }

    public Instant getTakenAt() {
        return takenAt;
    }

    public String getThumbKey() {
        return thumbKey;
    }

    public String getDisplayKey() {
        return displayKey;
    }

    public String getLoopKey() {
        return loopKey;
    }

    public String getPosterKey() {
        return posterKey;
    }

    public Instant getClientModifiedAt() {
        return clientModifiedAt;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }

    public Instant getDeletedAt() {
        return deletedAt;
    }
}
