package com.lovesite.album;

import com.lovesite.album.AlbumDtos.AlbumResponse;
import com.lovesite.system.ApiException;
import com.lovesite.user.CurrentUser;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.UUID;

@Service
public class AlbumService {

    private final AlbumRepository albums;

    public AlbumService(AlbumRepository albums) {
        this.albums = albums;
    }

    @Transactional(readOnly = true)
    public List<AlbumResponse> list(CurrentUser me) {
        return albums.findBySpaceIdAndDeletedAtIsNullOrderByCreatedAtDesc(me.requireSpace()).stream()
                .map(AlbumResponse::from).toList();
    }

    @Transactional
    public AlbumResponse create(CurrentUser me, String title) {
        return AlbumResponse.from(albums.save(new Album(me.requireSpace(), title.trim(), me.userId())));
    }

    @Transactional
    public AlbumResponse rename(CurrentUser me, UUID id, String title) {
        Album album = require(me, id);
        album.rename(title.trim());
        return AlbumResponse.from(album);
    }

    @Transactional
    public void delete(CurrentUser me, UUID id) {
        require(me, id).softDelete();
    }

    /** An album of the caller's space that is not deleted; anything else (other space, unknown id) is a 404. */
    public Album require(CurrentUser me, UUID id) {
        return albums.findByIdAndSpaceIdAndDeletedAtIsNull(id, me.requireSpace())
                .orElseThrow(() -> ApiException.notFound("Albüm bulunamadı"));
    }
}
