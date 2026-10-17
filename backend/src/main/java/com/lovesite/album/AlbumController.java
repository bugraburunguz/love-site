package com.lovesite.album;

import com.lovesite.album.AlbumDtos.AlbumRequest;
import com.lovesite.album.AlbumDtos.AlbumResponse;
import com.lovesite.album.AlbumDtos.AlbumUpdate;
import com.lovesite.album.AlbumDtos.MusicUploadRequest;
import com.lovesite.album.AlbumDtos.MusicUploadResponse;
import com.lovesite.user.CurrentUser;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api/albums")
public class AlbumController {

    private final AlbumService albumService;

    public AlbumController(AlbumService albumService) {
        this.albumService = albumService;
    }

    @GetMapping
    public List<AlbumResponse> list(CurrentUser me) {
        return albumService.list(me);
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public AlbumResponse create(CurrentUser me, @Valid @RequestBody AlbumRequest request) {
        return albumService.create(me, request.title(), request.themeId());
    }

    @PatchMapping("/{id}")
    public AlbumResponse update(CurrentUser me, @PathVariable UUID id, @Valid @RequestBody AlbumUpdate request) {
        return albumService.update(me, id, request);
    }

    @DeleteMapping("/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void delete(CurrentUser me, @PathVariable UUID id) {
        albumService.delete(me, id);
    }

    // ---- the album's song

    @PostMapping("/{id}/music/upload")
    public MusicUploadResponse musicUpload(CurrentUser me, @PathVariable UUID id, @RequestBody MusicUploadRequest request) {
        return albumService.requestMusicUpload(me, id, request);
    }

    @PostMapping("/{id}/music/complete")
    public AlbumResponse musicComplete(CurrentUser me, @PathVariable UUID id) {
        return albumService.completeMusic(me, id);
    }

    @DeleteMapping("/{id}/music")
    public AlbumResponse musicDelete(CurrentUser me, @PathVariable UUID id) {
        return albumService.deleteMusic(me, id);
    }
}
