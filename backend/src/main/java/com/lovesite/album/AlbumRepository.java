package com.lovesite.album;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface AlbumRepository extends JpaRepository<Album, UUID> {

    List<Album> findByDeletedAtIsNullOrderByCreatedAtDesc();

    Optional<Album> findByIdAndDeletedAtIsNull(UUID id);
}
