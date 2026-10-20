package com.lovesite.media;

import com.lovesite.media.MediaDtos.CaptionRequest;
import com.lovesite.media.MediaDtos.MediaResponse;
import com.lovesite.media.MediaDtos.UploadRequest;
import com.lovesite.media.MediaDtos.UploadResponse;
import com.lovesite.user.CurrentUser;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import com.lovesite.auth.ClientIp;
import com.lovesite.ratelimit.RateLimitProperties;
import com.lovesite.ratelimit.RateLimiter;

import java.util.List;
import java.util.UUID;

@RestController
public class MediaController {

    private final MediaService mediaService;
    private final RateLimiter limiter;
    private final RateLimitProperties limits;

    public MediaController(MediaService mediaService, RateLimiter limiter, RateLimitProperties limits) {
        this.mediaService = mediaService;
        this.limiter = limiter;
        this.limits = limits;
    }

    @GetMapping("/api/albums/{albumId}/media")
    public List<MediaResponse> list(CurrentUser me, @PathVariable UUID albumId) {
        return mediaService.list(me, albumId);
    }

    @PostMapping("/api/albums/{albumId}/uploads")
    public UploadResponse requestUploads(CurrentUser me, @PathVariable UUID albumId, @RequestBody UploadRequest request,
                                         jakarta.servlet.http.HttpServletRequest http) {
        limiter.check("upload-user:" + me.userId(), limits.uploadStartPerUser(), limits.uploadWindow());
        limiter.check("upload-ip:" + ClientIp.of(http), limits.uploadStartPerIp(), limits.uploadWindow());
        return mediaService.requestUploads(me, albumId, request.files());
    }

    @GetMapping("/api/media")
    public List<MediaResponse> status(CurrentUser me, @RequestParam List<UUID> ids) {
        return mediaService.statusOf(me, ids);
    }

    @PostMapping("/api/media/{id}/reprocess")
    public MediaResponse reprocess(CurrentUser me, @PathVariable UUID id) {
        return mediaService.reprocess(me, id);
    }

    @PutMapping("/api/media/{id}/date")
    public MediaResponse setDate(CurrentUser me, @PathVariable UUID id, @RequestBody MediaDtos.DateRequest request) {
        return mediaService.setDate(me, id, request.takenAt());
    }

    @GetMapping("/api/media/{id}/original")
    public MediaService.OriginalDownload original(CurrentUser me, @PathVariable UUID id) {
        return mediaService.originalDownload(me, id);
    }

    @PostMapping("/api/media/{id}/complete")
    public MediaResponse complete(CurrentUser me, @PathVariable UUID id) {
        return mediaService.complete(me, id);
    }

    @PatchMapping("/api/media/{id}")
    public MediaResponse updateCaption(CurrentUser me, @PathVariable UUID id, @Valid @RequestBody CaptionRequest request) {
        return mediaService.updateCaption(me, id, request.caption());
    }

    @DeleteMapping("/api/media/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void delete(CurrentUser me, @PathVariable UUID id) {
        mediaService.delete(me, id);
    }
}
