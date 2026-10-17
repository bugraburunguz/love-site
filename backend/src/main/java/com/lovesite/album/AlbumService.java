package com.lovesite.album;

import com.lovesite.album.AlbumDtos.AlbumResponse;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.util.List;
import java.util.UUID;

@Service
public class AlbumService {

    private final AlbumRepository albums;

    public AlbumService(AlbumRepository albums) {
        this.albums = albums;
    }

    @Transactional(readOnly = true)
    public List<AlbumResponse> list() {
        return albums.findByDeletedAtIsNullOrderByCreatedAtDesc().stream().map(AlbumResponse::from).toList();
    }

    @Transactional
    public AlbumResponse create(String title, UUID userId) {
        return AlbumResponse.from(albums.save(new Album(title.trim(), userId)));
    }

    @Transactional
    public AlbumResponse rename(UUID id, String title) {
        Album album = require(id);
        album.rename(title.trim());
        return AlbumResponse.from(album);
    }

    @Transactional
    public void delete(UUID id) {
        require(id).softDelete();
    }

    /** Used by the media feature to make sure an album exists and is not deleted. */
    public Album require(UUID id) {
        return albums.findByIdAndDeletedAtIsNull(id)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Album not found"));
    }
}
