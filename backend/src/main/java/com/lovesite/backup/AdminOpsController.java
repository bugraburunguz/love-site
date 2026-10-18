package com.lovesite.backup;

import com.lovesite.media.processing.MediaProcessingQueue;
import com.lovesite.media.processing.MediaProcessingService;
import com.lovesite.system.ApiException;
import com.lovesite.user.CurrentUser;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

/** Operations for the platform admin: backup status / manual run and re-queueing all media. Numbers only, no content. */
@RestController
@RequestMapping("/api/admin")
public class AdminOpsController {

    private final BackupService backup;
    private final MediaProcessingService processing;
    private final MediaProcessingQueue queue;

    public AdminOpsController(BackupService backup, MediaProcessingService processing, MediaProcessingQueue queue) {
        this.backup = backup;
        this.processing = processing;
        this.queue = queue;
    }

    @GetMapping("/backup")
    public BackupService.Status status(CurrentUser me) {
        me.requireAdmin();
        return backup.status();
    }

    /** Starts a full backup now (in the background); the status endpoint shows the outcome. */
    @PostMapping("/backup/run")
    @ResponseStatus(HttpStatus.ACCEPTED)
    public Map<String, Object> run(CurrentUser me) {
        me.requireAdmin();
        if (!backup.enabled()) throw ApiException.conflict("Yedekleme ayarlı değil");
        if (backup.isBusy()) throw ApiException.conflict("Yedekleme zaten çalışıyor");
        backup.requestRun(); // the worker starts it within a few seconds
        return Map.of("started", true);
    }

    /** Puts every processed item back in the queue (fair between spaces). */
    @PostMapping("/reprocess-all")
    public Map<String, Object> reprocessAll(CurrentUser me) {
        me.requireAdmin();
        int queued = processing.reprocessAll();
        queue.kick();
        return Map.of("queued", queued);
    }
}
