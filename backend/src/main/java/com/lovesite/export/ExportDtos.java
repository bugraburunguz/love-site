package com.lovesite.export;

import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;

public final class ExportDtos {

    private ExportDtos() {
    }

    /** type + its parameters (see ExportService for each type's parameters) */
    public record ExportRequest(String type, Map<String, Object> params) {
    }

    /** One result file: a short-lived presigned download link (Content-Disposition: attachment with this name). */
    public record ExportFile(String name, String contentType, long size, String url, String role) {
    }

    /**
     * status: QUEUED / RUNNING / READY / FAILED. files only when READY. notes: things the user should know about the result
     * (e.g. an animated sticker that had to become static). error carries no technical detail.
     */
    public record ExportResponse(UUID id, String type, String status, UUID albumId, Map<String, Object> params,
                                 Instant createdAt, Instant finishedAt, Instant expiresAt, List<ExportFile> files,
                                 List<String> notes, String error, List<Map<String, Object>> meta) {
    }
}
