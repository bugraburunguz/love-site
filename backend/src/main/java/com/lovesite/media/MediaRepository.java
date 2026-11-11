package com.lovesite.media;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

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

    /**
     * LS-22: a new clip start and back into the processing queue, in one statement that only succeeds while the item
     * is not queued or being processed (the worker claims items with an UPDATE of its own; a read-then-save would
     * overwrite its claim). Returns the number of rows changed: 0 = it was taken in between.
     */
    @Modifying(clearAutomatically = true, flushAutomatically = true)
    @Query(value = "UPDATE media SET clip_start_ms = :start, status = 'UPLOADED', attempts = 0, last_error = NULL, "
            + "next_attempt_at = NULL, processing_started_at = NULL "
            + "WHERE id = :id AND status IN ('READY', 'FAILED') AND deleted_at IS NULL", nativeQuery = true)
    int requeueWithClip(@Param("id") UUID id, @Param("start") Long start);

    List<Media> findBySpaceIdAndAlbumIdAndStatusInAndDeletedAtIsNullOrderByCreatedAtAsc(UUID spaceId, UUID albumId,
                                                                                         Collection<MediaStatus> statuses);

    List<Media> findBySpaceIdAndIdInAndStatusInAndDeletedAtIsNull(UUID spaceId, Collection<UUID> ids,
                                                                   Collection<MediaStatus> statuses);

    Optional<Media> findBySpaceIdAndAlbumIdAndSha256AndDeletedAtIsNull(UUID spaceId, UUID albumId, String sha256);

    Optional<Media> findByIdAndSpaceIdAndDeletedAtIsNull(UUID id, UUID spaceId);

    Optional<Media> findByIdAndSpaceIdAndDeletedAtIsNotNull(UUID id, UUID spaceId);

    // ---- system jobs (no user context)

    List<Media> findByStatusAndCreatedAtBefore(MediaStatus status, Instant cutoff);
}
