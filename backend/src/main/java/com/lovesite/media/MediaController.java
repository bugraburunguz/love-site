package com.lovesite.media;

import com.lovesite.media.MediaDtos.CaptionRequest;
import com.lovesite.media.MediaDtos.MediaResponse;
import com.lovesite.media.MediaDtos.UploadRequest;
import com.lovesite.media.MediaDtos.UploadResponse;
import com.lovesite.user.CurrentUserService;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.UUID;

@RestController
public class MediaController {

    private final MediaService mediaService;
    private final CurrentUserService currentUser;

    public MediaController(MediaService mediaService, CurrentUserService currentUser) {
        this.mediaService = mediaService;
        this.currentUser = currentUser;
    }

    @GetMapping("/api/albums/{albumId}/media")
    public List<MediaResponse> list(@PathVariable UUID albumId) {
        return mediaService.list(albumId);
    }

    @PostMapping("/api/albums/{albumId}/uploads")
    public UploadResponse requestUploads(@PathVariable UUID albumId, @RequestBody UploadRequest request,
                                         Authentication authentication) {
        return mediaService.requestUploads(albumId, currentUser.require(authentication).getId(), request.files());
    }

    @PostMapping("/api/media/{id}/complete")
    public MediaResponse complete(@PathVariable UUID id) {
        return mediaService.complete(id);
    }

    @PatchMapping("/api/media/{id}")
    public MediaResponse updateCaption(@PathVariable UUID id, @Valid @RequestBody CaptionRequest request) {
        return mediaService.updateCaption(id, request.caption());
    }

    @DeleteMapping("/api/media/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void delete(@PathVariable UUID id) {
        mediaService.delete(id);
    }
}
