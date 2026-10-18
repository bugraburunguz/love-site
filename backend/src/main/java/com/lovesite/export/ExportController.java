package com.lovesite.export;

import com.lovesite.export.ExportDtos.ExportRequest;
import com.lovesite.export.ExportDtos.ExportResponse;
import com.lovesite.user.CurrentUser;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.UUID;

@RestController
public class ExportController {

    private final ExportService exports;
    private final ExportQueue queue;

    public ExportController(ExportService exports, ExportQueue queue) {
        this.exports = exports;
        this.queue = queue;
    }

    /** 202 with the job (new, or an existing one with the same content). */
    @PostMapping("/api/exports")
    @ResponseStatus(HttpStatus.ACCEPTED)
    public ExportResponse create(CurrentUser me, @RequestBody ExportRequest request, HttpServletRequest http) {
        ExportResponse job = exports.create(me, request.type(), request.params(), http.getServerName());
        queue.kick();
        return job;
    }

    @GetMapping("/api/exports/{id}")
    public ExportResponse get(CurrentUser me, @PathVariable UUID id) {
        return exports.get(me, id);
    }

    @GetMapping("/api/albums/{albumId}/exports")
    public List<ExportResponse> list(CurrentUser me, @PathVariable UUID albumId) {
        return exports.listForAlbum(me, albumId);
    }
}
