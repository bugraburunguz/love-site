package com.lovesite.settings;

import com.lovesite.space.SpaceService;
import com.lovesite.storage.StorageService;
import com.lovesite.user.CurrentUser;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.time.Duration;
import java.util.UUID;

/**
 * Each space has its own background music at spaces/{spaceId}/audio/theme, uploaded by hand (see README). Only the
 * initial space (the one that existed before tenancy) falls back to the old global "audio/theme" object.
 */
@RestController
@RequestMapping("/api/settings")
public class MusicController {

    /** The pre-tenancy location; read-only fallback for the initial space. */
    static final String LEGACY_MUSIC_KEY = "audio/theme";
    /** Total budget for the bucket lookup, retries included. */
    static final Duration LOOKUP_TIMEOUT = Duration.ofSeconds(4);

    private static final Logger log = LoggerFactory.getLogger(MusicController.class);

    public record MusicResponse(String url) {
    }

    private final StorageService storage;
    private final SpaceService spaces;

    public MusicController(StorageService storage, SpaceService spaces) {
        this.storage = storage;
        this.spaces = spaces;
    }

    static String musicKey(UUID spaceId) {
        return "spaces/" + spaceId + "/audio/theme";
    }

    /**
     * Music is optional: a missing file, a slow bucket or any storage error all answer 204 (no music), never a 5xx,
     * so a bucket hiccup can only silence the music box, not break the app. Failures are logged as warnings.
     */
    @GetMapping("/music")
    public ResponseEntity<MusicResponse> music(CurrentUser me) {
        UUID spaceId = me.requireSpace();
        try {
            String key = musicKey(spaceId);
            if (storage.head(key, LOOKUP_TIMEOUT).isEmpty()) {
                if (!spaces.isInitial(spaceId) || storage.head(LEGACY_MUSIC_KEY, LOOKUP_TIMEOUT).isEmpty()) {
                    return ResponseEntity.noContent().build();
                }
                key = LEGACY_MUSIC_KEY;
            }
            return ResponseEntity.ok(new MusicResponse(storage.presignGet(key)));
        } catch (Exception e) {
            log.warn("Music lookup failed, answering 204 (no music): {}", e.toString());
            return ResponseEntity.noContent().build();
        }
    }
}
