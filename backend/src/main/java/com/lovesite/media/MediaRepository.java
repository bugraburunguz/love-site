package com.lovesite.media;

import org.springframework.data.jpa.repository.JpaRepository;

import java.time.Instant;
import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface MediaRepository extends JpaRepository<Media, UUID> {

    List<Media> findByAlbumIdAndStatusAndDeletedAtIsNullOrderByCreatedAtAsc(UUID albumId, MediaStatus status);

    List<Media> findByAlbumIdAndStatusInAndDeletedAtIsNullOrderByCreatedAtAsc(UUID albumId, Collection<MediaStatus> statuses);

    List<Media> findByIdInAndStatusInAndDeletedAtIsNull(Collection<UUID> ids, Collection<MediaStatus> statuses);

    Optional<Media> findByAlbumIdAndSha256AndDeletedAtIsNull(UUID albumId, String sha256);

    Optional<Media> findByIdAndDeletedAtIsNull(UUID id);

    List<Media> findByStatusAndCreatedAtBefore(MediaStatus status, Instant cutoff);
}
