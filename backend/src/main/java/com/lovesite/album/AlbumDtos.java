package com.lovesite.album;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

import java.time.Instant;
import java.util.UUID;

public final class AlbumDtos {

    private AlbumDtos() {
    }

    public record AlbumRequest(@NotBlank(message = "Albüm adı boş olamaz") @Size(max = 200, message = "Albüm adı en fazla 200 karakter olabilir") String title) {
    }

    public record AlbumResponse(UUID id, String title, Instant createdAt, Instant updatedAt) {

        static AlbumResponse from(Album album) {
            return new AlbumResponse(album.getId(), album.getTitle(), album.getCreatedAt(), album.getUpdatedAt());
        }
    }
}
