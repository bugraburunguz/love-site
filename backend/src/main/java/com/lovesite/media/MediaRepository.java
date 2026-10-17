package com.lovesite.media;

import org.springframework.data.jpa.repository.JpaRepository;

import java.time.Instant;
import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

/**
 * Every finder that serves a request is scoped by space (there is deliberately no lookup by id alone), so media of
 * another space can never be loaded. Only the system jobs at the bottom (cleanup, purge, worker) work across spaces.
 */
public interface MediaRepository extends JpaRepository<Media, UUID> {

    List<Media> findBySpaceIdAndAlbumIdAndStatusInAndDeletedAtIsNullOrderByCreatedAtAsc(UUID spaceId, UUID albumId,
                                                                                         Collection<MediaStatus> statuses);

    List<Media> findBySpaceIdAndIdInAndStatusInAndDeletedAtIsNull(UUID spaceId, Collection<UUID> ids,
                                                                   Collection<MediaStatus> statuses);

    Optional<Media> findBySpaceIdAndAlbumIdAndSha256AndDeletedAtIsNull(UUID spaceId, UUID albumId, String sha256);

    Optional<Media> findByIdAndSpaceIdAndDeletedAtIsNull(UUID id, UUID spaceId);

    // ---- system jobs (no user context)

    List<Media> findByStatusAndCreatedAtBefore(MediaStatus status, Instant cutoff);
}
