package com.lovesite.album;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

/**
 * Every lookup carries the space: there is deliberately no finder by id alone, so a record of another space can never
 * be loaded (and then merely "checked") by mistake. Ids from other spaces simply do not exist from here.
 */
public interface AlbumRepository extends JpaRepository<Album, UUID> {

    List<Album> findBySpaceIdAndDeletedAtIsNullOrderByCreatedAtDesc(UUID spaceId);

    Optional<Album> findByIdAndSpaceIdAndDeletedAtIsNull(UUID id, UUID spaceId);
}
