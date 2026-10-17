package com.lovesite.settings;

import com.lovesite.storage.StorageService;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/** The background music lives in the bucket under a fixed key and is uploaded by hand (see README). */
@RestController
@RequestMapping("/api/settings")
public class MusicController {

    static final String MUSIC_KEY = "audio/theme";

    public record MusicResponse(String url) {
    }

    private final StorageService storage;

    public MusicController(StorageService storage) {
        this.storage = storage;
    }

    @GetMapping("/music")
    public ResponseEntity<MusicResponse> music() {
        if (storage.head(MUSIC_KEY).isEmpty()) {
            return ResponseEntity.noContent().build();
        }
        return ResponseEntity.ok(new MusicResponse(storage.presignGet(MUSIC_KEY)));
    }
}
