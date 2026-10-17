package com.lovesite.album;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

import java.time.Instant;
import java.util.UUID;

public final class AlbumDtos {

    private AlbumDtos() {
    }

    /** New album: a title and (optionally) one of the allowed themes; the default theme is used when it is omitted. */
    public record AlbumRequest(
            @NotBlank(message = "Albüm adı boş olamaz") @Size(max = 200, message = "Albüm adı en fazla 200 karakter olabilir") String title,
            @Size(max = 40, message = "Geçersiz tema") String themeId) {
    }

    /** Partial update: only the given fields change. */
    public record AlbumUpdate(
            @Size(max = 200, message = "Albüm adı en fazla 200 karakter olabilir") String title,
            @Size(max = 40, message = "Geçersiz tema") String themeId) {
    }

    public record MusicUploadRequest(String filename, String contentType, Long sizeBytes) {
    }

    public record MusicUploadResponse(String uploadUrl, String contentType) {
    }

    /** musicUrl is a presigned GET (null when the album has no song); musicName is the original file name. */
    public record AlbumResponse(UUID id, String title, String themeId, String musicUrl, String musicName, Instant createdAt,
                                Instant updatedAt) {
    }
}
