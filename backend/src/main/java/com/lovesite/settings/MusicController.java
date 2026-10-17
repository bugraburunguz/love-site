package com.lovesite.settings;

import com.lovesite.storage.StorageService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.time.Duration;

/** The background music lives in the bucket under a fixed key and is uploaded by hand (see README). */
@RestController
@RequestMapping("/api/settings")
public class MusicController {

    static final String MUSIC_KEY = "audio/theme";
    /** Total budget for the bucket lookup, retries included. */
    static final Duration LOOKUP_TIMEOUT = Duration.ofSeconds(4);

    private static final Logger log = LoggerFactory.getLogger(MusicController.class);

    public record MusicResponse(String url) {
    }

    private final StorageService storage;

    public MusicController(StorageService storage) {
        this.storage = storage;
    }

    /**
     * Music is optional: a missing file, a slow bucket or any storage error all answer 204 (no music), never a 5xx,
     * so a bucket hiccup can only silence the music box, not break the app. Failures are logged as warnings.
     */
    @GetMapping("/music")
    public ResponseEntity<MusicResponse> music() {
        try {
            if (storage.head(MUSIC_KEY, LOOKUP_TIMEOUT).isEmpty()) {
                return ResponseEntity.noContent().build();
            }
            return ResponseEntity.ok(new MusicResponse(storage.presignGet(MUSIC_KEY)));
        } catch (Exception e) {
            log.warn("Music lookup failed, answering 204 (no music): {}", e.toString());
            return ResponseEntity.noContent().build();
        }
    }
}
