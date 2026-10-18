package com.lovesite.export.render;

import com.lovesite.export.ExportService;
import com.lovesite.role.Roles;
import com.lovesite.storage.StorageService;
import com.lovesite.system.ApiException;
import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.LinkedHashMap;
import java.util.Map;
import java.util.UUID;

/**
 * Render data for the SPA's render route, served ONLY on the loopback render connector of the worker (the role gate filter
 * answers 404 on the public port and in the web role) and only with a valid render token for that job.
 * The payload snapshot carries storage keys; here they become presigned URLs (Chromium loads the display variants straight
 * from the bucket). The album song key is never handed to the page.
 */
@RestController
public class RenderController {

    private final ExportService exports;
    private final RenderTokens tokens;
    private final StorageService storage;
    private final Roles roles;

    public RenderController(ExportService exports, RenderTokens tokens, StorageService storage, Roles roles) {
        this.exports = exports;
        this.tokens = tokens;
        this.storage = storage;
        this.roles = roles;
    }

    @GetMapping("/internal/render/{jobId}")
    public ResponseEntity<Map<String, Object>> data(@PathVariable UUID jobId, @RequestParam(required = false) String token) {
        if (!roles.runs(Roles.Job.RENDER_ENDPOINT) || !tokens.enabled()) throw ApiException.notFound("Bulunamadı");
        if (tokens.verify(token, jobId).isEmpty()) throw ApiException.forbidden("Geçersiz ya da süresi dolmuş anahtar");
        ExportService.ExportRow job = exports.find(jobId).orElseThrow(() -> ApiException.notFound("Bulunamadı"));
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(forPage(job.payload()));
    }

    @SuppressWarnings("unchecked")
    Map<String, Object> forPage(Map<String, Object> payload) {
        Map<String, Object> out = new LinkedHashMap<>(payload);
        out.remove("musicKey");
        Map<String, Object> media = new LinkedHashMap<>();
        ((Map<String, Object>) payload.getOrDefault("media", Map.of())).forEach((id, raw) -> {
            Map<String, Object> m = new LinkedHashMap<>((Map<String, Object>) raw);
            m.put("status", "READY");
            m.put("thumbUrl", url(m.remove("thumbKey")));
            m.put("displayUrl", url(m.remove("displayKey")));
            m.put("posterUrl", url(m.remove("posterKey")));
            m.put("loopUrl", url(m.remove("loopKey")));
            m.put("sizeBytes", 0);
            m.put("createdAt", m.get("displayDate"));
            m.put("uploadedByName", null);
            media.put(id, m);
        });
        out.put("media", media);
        return out;
    }

    private String url(Object key) {
        return key == null ? null : storage.presignGet((String) key);
    }
}
