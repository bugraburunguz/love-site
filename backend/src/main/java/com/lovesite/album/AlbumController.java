package com.lovesite.album;

import com.lovesite.album.AlbumDtos.AlbumRequest;
import com.lovesite.album.AlbumDtos.AlbumResponse;
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
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api/albums")
public class AlbumController {

    private final AlbumService albumService;
    private final CurrentUserService currentUser;

    public AlbumController(AlbumService albumService, CurrentUserService currentUser) {
        this.albumService = albumService;
        this.currentUser = currentUser;
    }

    @GetMapping
    public List<AlbumResponse> list() {
        return albumService.list();
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public AlbumResponse create(@Valid @RequestBody AlbumRequest request, Authentication authentication) {
        return albumService.create(request.title(), currentUser.require(authentication).getId());
    }

    @PatchMapping("/{id}")
    public AlbumResponse rename(@PathVariable UUID id, @Valid @RequestBody AlbumRequest request) {
        return albumService.rename(id, request.title());
    }

    @DeleteMapping("/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void delete(@PathVariable UUID id) {
        albumService.delete(id);
    }
}
