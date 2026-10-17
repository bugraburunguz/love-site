package com.lovesite.album;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "album")
public class Album {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(name = "space_id", nullable = false, updatable = false)
    private UUID spaceId;

    @Column(nullable = false)
    private String title;

    @Column(name = "theme_id", nullable = false)
    private String themeId = "romantik";

    @Column(name = "music_key")
    private String musicKey;

    @Column(name = "music_content_type")
    private String musicContentType;

    @Column(name = "music_size_bytes")
    private Long musicSizeBytes;

    @Column(name = "music_original_filename")
    private String musicOriginalFilename;

    @Column(name = "music_pending_key")
    private String musicPendingKey;

    @Column(name = "music_pending_content_type")
    private String musicPendingContentType;

    @Column(name = "music_pending_size_bytes")
    private Long musicPendingSizeBytes;

    @Column(name = "music_pending_filename")
    private String musicPendingFilename;

    @Column(name = "created_by", nullable = false)
    private UUID createdBy;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt = Instant.now();

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt = createdAt;

    @Column(name = "deleted_at")
    private Instant deletedAt;

    protected Album() {
    }

    public Album(UUID spaceId, String title, UUID createdBy) {
        this.spaceId = spaceId;
        this.title = title;
        this.createdBy = createdBy;
    }

    public Album(UUID spaceId, String title, UUID createdBy, String themeId) {
        this(spaceId, title, createdBy);
        this.themeId = themeId;
    }

    public void changeTheme(String themeId) {
        this.themeId = themeId;
        this.updatedAt = Instant.now();
    }

    public void requestMusic(String key, String contentType, long size, String filename) {
        this.musicPendingKey = key;
        this.musicPendingContentType = contentType;
        this.musicPendingSizeBytes = size;
        this.musicPendingFilename = filename;
    }

    public void clearPendingMusic() {
        this.musicPendingKey = null;
        this.musicPendingContentType = null;
        this.musicPendingSizeBytes = null;
        this.musicPendingFilename = null;
    }

    /** The pending upload becomes the album's song. */
    public void confirmMusic(long actualSize) {
        this.musicKey = musicPendingKey;
        this.musicContentType = musicPendingContentType;
        this.musicSizeBytes = actualSize;
        this.musicOriginalFilename = musicPendingFilename;
        clearPendingMusic();
        this.updatedAt = Instant.now();
    }

    public void clearMusic() {
        this.musicKey = null;
        this.musicContentType = null;
        this.musicSizeBytes = null;
        this.musicOriginalFilename = null;
        this.updatedAt = Instant.now();
    }

    public String getThemeId() {
        return themeId;
    }

    public String getMusicKey() {
        return musicKey;
    }

    public String getMusicContentType() {
        return musicContentType;
    }

    public Long getMusicSizeBytes() {
        return musicSizeBytes;
    }

    public String getMusicOriginalFilename() {
        return musicOriginalFilename;
    }

    public String getMusicPendingKey() {
        return musicPendingKey;
    }

    public String getMusicPendingContentType() {
        return musicPendingContentType;
    }

    public Long getMusicPendingSizeBytes() {
        return musicPendingSizeBytes;
    }

    public String getMusicPendingFilename() {
        return musicPendingFilename;
    }

    public void rename(String title) {
        this.title = title;
        this.updatedAt = Instant.now();
    }

    public void softDelete() {
        this.deletedAt = Instant.now();
        this.updatedAt = this.deletedAt;
    }

    public UUID getId() {
        return id;
    }

    public UUID getSpaceId() {
        return spaceId;
    }

    public String getTitle() {
        return title;
    }

    public UUID getCreatedBy() {
        return createdBy;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }

    public Instant getUpdatedAt() {
        return updatedAt;
    }

    public Instant getDeletedAt() {
        return deletedAt;
    }
}
