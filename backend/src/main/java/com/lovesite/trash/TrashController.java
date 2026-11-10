package com.lovesite.trash;

import com.lovesite.user.CurrentUser;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import java.util.UUID;

/** The caller's own trash; ids of another space (or of things that are not deleted) are a 404. */
@RestController
@RequestMapping("/api/trash")
public class TrashController {

    private final TrashService trash;

    public TrashController(TrashService trash) {
        this.trash = trash;
    }

    @GetMapping
    public TrashService.TrashView list(CurrentUser me) {
        return trash.list(me);
    }

    @PostMapping("/media/{id}/restore")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void restoreMedia(CurrentUser me, @PathVariable UUID id) {
        trash.restoreMedia(me, id);
    }

    @PostMapping("/albums/{id}/restore")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void restoreAlbum(CurrentUser me, @PathVariable UUID id) {
        trash.restoreAlbum(me, id);
    }
}
