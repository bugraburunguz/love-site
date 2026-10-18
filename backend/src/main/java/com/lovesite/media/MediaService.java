package com.lovesite.media;

import com.lovesite.album.AlbumService;
import com.lovesite.media.MediaDtos.MediaResponse;
import com.lovesite.media.MediaDtos.UploadFile;
import com.lovesite.media.MediaDtos.UploadItem;
import com.lovesite.media.MediaDtos.UploadResponse;
import com.lovesite.media.processing.MediaProcessingQueue;
import com.lovesite.page.PageService;
import com.lovesite.space.QuotaService;
import com.lovesite.storage.StorageService;
import com.lovesite.system.ApiException;
import com.lovesite.user.CurrentUser;
import com.lovesite.user.DisplayNames;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionTemplate;

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import java.util.regex.Pattern;

/**
 * Every method takes the calling user and works on that user's space only: albums and media are looked up with the
 * space id in the query itself, so an id from another space behaves exactly like an id that does not exist (404).
 */
@Service
public class MediaService {

    private static final Logger log = LoggerFactory.getLogger(MediaService.class);
    /** Everything the album shows: uploaded items in any processing state (not half-uploaded or rejected ones). */
    private static final List<MediaStatus> LISTED =
            List.of(MediaStatus.UPLOADED, MediaStatus.PROCESSING, MediaStatus.READY, MediaStatus.FAILED);
    private static final Pattern SHA256 = Pattern.compile("[0-9a-fA-F]{64}");
    private static final int MAX_FILENAME = 512;

    private final MediaRepository media;
    private final AlbumService albums;
    private final StorageService storage;
    private final MediaProperties properties;
    private final ObjectProvider<MediaProcessingQueue> queue;
    private final QuotaService quota;
    private final TransactionTemplate tx;
    private final PageService pages;
    private final DisplayNames names;

    public MediaService(MediaRepository media, AlbumService albums, StorageService storage, MediaProperties properties,
                        ObjectProvider<MediaProcessingQueue> queue, QuotaService quota, TransactionTemplate tx,
                        PageService pages, DisplayNames names) {
        this.pages = pages;
        this.names = names;
        this.queue = queue;
        this.media = media;
        this.albums = albums;
        this.storage = storage;
        this.properties = properties;
        this.quota = quota;
        this.tx = tx;
    }

    public List<MediaResponse> list(CurrentUser me, UUID albumId) {
        albums.require(me, albumId);
        return media.findBySpaceIdAndAlbumIdAndStatusInAndDeletedAtIsNullOrderByCreatedAtAsc(me.requireSpace(), albumId, LISTED)
                .stream()
                .map(this::toResponse)
                .toList();
    }

    /** Current state of a few items (the album page polls only those that are still being processed). */
    public List<MediaResponse> statusOf(CurrentUser me, List<UUID> ids) {
        if (ids == null || ids.isEmpty()) return List.of();
        if (ids.size() > properties.maxBatchSize()) {
            throw ApiException.badRequest("En fazla " + properties.maxBatchSize() + " medya sorgulanabilir");
        }
        return media.findBySpaceIdAndIdInAndStatusInAndDeletedAtIsNull(me.requireSpace(), ids, LISTED).stream()
                .map(this::toResponse).toList();
    }

    /** FAILED or READY items go back to the queue with a fresh attempt counter. */
    public MediaResponse reprocess(CurrentUser me, UUID mediaId) {
        Media m = find(me, mediaId);
        if (m.getStatus() != MediaStatus.FAILED && m.getStatus() != MediaStatus.READY) {
            throw ApiException.conflict("Bu medya zaten işleniyor");
        }
        m.requeue();
        m = media.save(m);
        queue.ifAvailable(MediaProcessingQueue::kick);
        return toResponse(m);
    }

    /** Variant URLs only for READY items; they come from the shared presigned-URL cache. */
    MediaResponse toResponse(Media m) {
        boolean ready = m.getStatus() == MediaStatus.READY;
        Instant displayDate = m.getTakenAt() != null ? m.getTakenAt()
                : m.getClientModifiedAt() != null ? m.getClientModifiedAt() : m.getCreatedAt();
        return new MediaResponse(m.getId(), m.getType(), m.getStatus(), m.getOriginalFilename(), m.getContentType(),
                m.getSizeBytes(), m.getCreatedAt(), m.getClientModifiedAt(), displayDate, m.getCaption(),
                ready ? url(m.getThumbKey()) : null, ready ? url(m.getDisplayKey()) : null,
                ready ? url(m.getLoopKey()) : null, ready ? url(m.getPosterKey()) : null,
                ready ? m.getWidth() : null, ready ? m.getHeight() : null, ready ? m.getDurationMs() : null,
                names.of(m.getUploadedBy()));
    }

    private String url(String key) {
        return key == null ? null : storage.presignGet(key);
    }

    /** Each file is handled on its own: a bad file yields an ERROR item and never fails the batch. */
    public UploadResponse requestUploads(CurrentUser me, UUID albumId, List<UploadFile> files) {
        if (files == null || files.isEmpty()) {
            throw ApiException.badRequest("Dosya listesi boş");
        }
        if (files.size() > properties.maxBatchSize()) {
            throw ApiException.badRequest("Tek istekte en fazla " + properties.maxBatchSize() + " dosya yüklenebilir");
        }
        albums.require(me, albumId);

        Set<UUID> createdInThisBatch = new HashSet<>();
        List<UploadItem> items = files.stream()
                .map(file -> prepare(me, albumId, file, createdInThisBatch))
                .toList();
        return new UploadResponse(items);
    }

    private UploadItem prepare(CurrentUser me, UUID albumId, UploadFile file, Set<UUID> createdInThisBatch) {
        String clientId = file.clientId();
        UUID spaceId = me.requireSpace();
        try {
            String filename = file.filename() == null ? "" : file.filename().trim();
            if (filename.isEmpty()) return UploadItem.error(clientId, "Dosya adı eksik");
            if (filename.length() > MAX_FILENAME) filename = filename.substring(0, MAX_FILENAME);

            var resolved = MediaTypes.resolve(file.contentType(), filename);
            if (resolved.isEmpty()) return UploadItem.error(clientId, "Desteklenmeyen dosya türü");

            long size = file.sizeBytes() == null ? 0 : file.sizeBytes();
            if (size <= 0) return UploadItem.error(clientId, "Dosya boş");
            long limit = properties.limitBytes(resolved.get().kind());
            if (size > limit) {
                return UploadItem.error(clientId, "Dosya çok büyük (sınır " + limit / (1024 * 1024) + " MB)");
            }

            String sha256 = null;
            if (file.sha256() != null && !file.sha256().isBlank()) {
                if (!SHA256.matcher(file.sha256().trim()).matches()) return UploadItem.error(clientId, "Geçersiz sha256");
                sha256 = file.sha256().trim().toLowerCase(Locale.ROOT);
            }

            var type = resolved.get();
            Instant modifiedAt = clientModifiedAt(file.lastModified());
            String filenameFinal = filename;
            String sha = sha256;

            // The space row lock serialises reservations of one space: two uploads can never both claim the last free bytes.
            return tx.execute(status -> {
                long storageLimit = quota.lockLimit(spaceId);

                Media row = null;
                if (sha != null) {
                    var existing = findBySha256(spaceId, albumId, sha);
                    if (existing.isPresent()) {
                        Media found = existing.get();
                        boolean stalePending = found.getStatus() == MediaStatus.PENDING_UPLOAD
                                && !createdInThisBatch.contains(found.getId());
                        if (!stalePending) return UploadItem.duplicate(clientId, found.getId());
                        row = found; // an earlier attempt that never completed: reuse it for the retry
                    }
                }

                long used = quota.usageExcluding(spaceId, row == null ? null : row.getId());
                if (used + size > storageLimit) {
                    return UploadItem.quotaExceeded(clientId, ApiException.quotaExceeded().getMessage());
                }

                if (row == null) {
                    row = new Media(UUID.randomUUID(), spaceId, albumId, me.userId(), type.kind(), filenameFinal,
                            type.contentType(), size, sha, modifiedAt);
                } else {
                    row.reissue(type.kind(), filenameFinal, type.contentType(), size, modifiedAt);
                }
                row.setFeatured(Boolean.TRUE.equals(file.featured()));
                row = media.saveAndFlush(row);
                createdInThisBatch.add(row.getId());

                String url = storage.presignPut(row.getOriginalKey(), type.contentType(), properties.uploadUrlTtl());
                return UploadItem.presigned(clientId, row.getId(), url, type.contentType());
            });
        } catch (DataIntegrityViolationException e) {
            // Lost a race on (album_id, sha256): a concurrent request inserted the same file first.
            return duplicateOf(spaceId, albumId, clientId, file.sha256())
                    .orElseGet(() -> UploadItem.error(clientId, "Eşzamanlı yükleme çakışması, lütfen tekrar deneyin"));
        } catch (RuntimeException e) {
            log.error("Could not prepare upload for client file {}", clientId, e);
            return UploadItem.error(clientId, "Yükleme hazırlanamadı");
        }
    }

    /** File.lastModified from the client; anything missing, non-positive or in the future is ignored. */
    static Instant clientModifiedAt(Long epochMillis) {
        if (epochMillis == null || epochMillis <= 0) return null;
        Instant instant = Instant.ofEpochMilli(epochMillis);
        return instant.isAfter(Instant.now().plus(1, ChronoUnit.DAYS)) ? null : instant;
    }

    /** Live (not deleted) media with this hash in the album, if any. */
    public Optional<Media> findBySha256(UUID spaceId, UUID albumId, String sha256) {
        return media.findBySpaceIdAndAlbumIdAndSha256AndDeletedAtIsNull(spaceId, albumId, sha256);
    }

    private Optional<UploadItem> duplicateOf(UUID spaceId, UUID albumId, String clientId, String rawSha256) {
        if (rawSha256 == null || rawSha256.isBlank()) return Optional.empty();
        return findBySha256(spaceId, albumId, rawSha256.trim().toLowerCase(Locale.ROOT))
                .map(existing -> UploadItem.duplicate(clientId, existing.getId()));
    }

    /** Verifies the stored object with HeadObject. Safe to call repeatedly. */
    public MediaResponse complete(CurrentUser me, UUID mediaId) {
        Media m = find(me, mediaId);
        if (m.getStatus() != MediaStatus.PENDING_UPLOAD) {
            return toResponse(m);
        }

        var head = storage.head(m.getOriginalKey())
                .orElseThrow(() -> ApiException.conflict("Dosya henüz yüklenmedi"));

        long actualSize = head.contentLength() == null ? 0 : head.contentLength();
        long limit = properties.limitBytes(m.getType());
        String problem = null;
        if (actualSize <= 0) {
            problem = "Yüklenen dosya boş";
        } else if (actualSize > limit) {
            problem = "Yüklenen dosya izin verilen boyutu aşıyor";
        } else if (!MediaTypes.normalize(head.contentType()).equals(m.getContentType())) {
            problem = "Yüklenen dosyanın türü beklenenle uyuşmuyor";
        }

        if (problem != null) {
            storage.delete(m.getOriginalKey());
            m.reject();
            media.save(m);
            throw ApiException.unprocessable(problem);
        }

        // The declared size was reserved at request time, but the stored object may be bigger: check again under the lock.
        UUID spaceId = m.getSpaceId();
        UUID id = m.getId();
        boolean fits = Boolean.TRUE.equals(tx.execute(status -> {
            long storageLimit = quota.lockLimit(spaceId);
            return quota.usageExcluding(spaceId, id) + actualSize <= storageLimit;
        }));
        if (!fits) {
            storage.delete(m.getOriginalKey());
            m.reject();
            media.save(m);
            throw ApiException.quotaExceeded();
        }

        m.markUploaded(actualSize);
        m = media.save(m);
        try {
            pages.autoPlace(m.getSpaceId(), m.getAlbumId(), m.getId(), m.isFeatured());
        } catch (RuntimeException e) {
            log.warn("Could not place media {} on a page, it stays in the tray: {}", m.getId(), e.toString());
        }
        queue.ifAvailable(MediaProcessingQueue::kick);
        return toResponse(m);
    }

    public MediaResponse updateCaption(CurrentUser me, UUID mediaId, String caption) {
        Media m = find(me, mediaId);
        String cleaned = caption == null ? "" : caption.trim();
        m.setCaption(cleaned.isEmpty() ? null : cleaned);
        m = media.save(m);
        return toResponse(m);
    }

    /**
     * Soft delete: the object stays in the bucket (and in the quota) until the trash purge removes it for good, 30 days
     * later (see TrashPurgeJob).
     */
    public void delete(CurrentUser me, UUID mediaId) {
        Media m = find(me, mediaId);
        m.softDelete();
        media.save(m);
        pages.removeMedia(m.getSpaceId(), m.getId());
    }

    public record OriginalDownload(String url, String filename) {
    }

    /**
     * "Orijinal dosya" in the lightbox: a short-lived presigned link that downloads the original under its own file name. Only
     * the caller's own live media (the same 404 for another space's ids).
     */
    public OriginalDownload originalDownload(CurrentUser me, UUID mediaId) {
        Media m = find(me, mediaId);
        if (!LISTED.contains(m.getStatus())) throw ApiException.notFound("Medya bulunamadı");
        return new OriginalDownload(storage.presignDownload(m.getOriginalKey(), m.getOriginalFilename(), m.getContentType()),
                m.getOriginalFilename());
    }

    private Media find(CurrentUser me, UUID mediaId) {
        return media.findByIdAndSpaceIdAndDeletedAtIsNull(mediaId, me.requireSpace())
                .orElseThrow(() -> ApiException.notFound("Medya bulunamadı"));
    }
}
