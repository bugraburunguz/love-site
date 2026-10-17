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

    @Column(name = "created_at", nullable = false)
    private Instant createdAt = Instant.now();

    @Column(name = "deleted_at")
    private Instant deletedAt;

    protected Media() {
    }

    public Media(UUID id, UUID albumId, UUID uploadedBy, MediaKind type, String originalFilename,
                 String contentType, long sizeBytes, String sha256) {
        this.id = id;
        this.albumId = albumId;
        this.uploadedBy = uploadedBy;
        this.type = type;
        this.status = MediaStatus.PENDING_UPLOAD;
        this.originalKey = "albums/" + albumId + "/media/" + id + "/original";
        this.originalFilename = originalFilename;
        this.contentType = contentType;
        this.sizeBytes = sizeBytes;
        this.sha256 = sha256;
    }

    /** A retry of a still-pending upload: same row and key, fresh metadata. */
    public void reissue(MediaKind type, String originalFilename, String contentType, long sizeBytes) {
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

    public UUID getId() {
        return id;
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

    public Instant getCreatedAt() {
        return createdAt;
    }

    public Instant getDeletedAt() {
        return deletedAt;
    }
}
