package com.lovesite.media;

import com.lovesite.album.AlbumService;
import com.lovesite.media.MediaDtos.MediaResponse;
import com.lovesite.media.MediaDtos.UploadFile;
import com.lovesite.media.MediaDtos.UploadItem;
import com.lovesite.media.MediaDtos.UploadResponse;
import com.lovesite.storage.StorageService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.UUID;
import java.util.regex.Pattern;

@Service
public class MediaService {

    private static final Logger log = LoggerFactory.getLogger(MediaService.class);
    private static final Pattern SHA256 = Pattern.compile("[0-9a-fA-F]{64}");
    private static final int MAX_FILENAME = 512;

    private final MediaRepository media;
    private final AlbumService albums;
    private final StorageService storage;
    private final MediaProperties properties;

    public MediaService(MediaRepository media, AlbumService albums, StorageService storage, MediaProperties properties) {
        this.media = media;
        this.albums = albums;
        this.storage = storage;
        this.properties = properties;
    }

    public List<MediaResponse> list(UUID albumId) {
        albums.require(albumId);
        return media.findByAlbumIdAndStatusAndDeletedAtIsNullOrderByCreatedAtAsc(albumId, MediaStatus.UPLOADED).stream()
                .map(m -> MediaResponse.from(m, storage.presignGet(m.getOriginalKey())))
                .toList();
    }

    /** Each file is handled on its own: a bad file yields an ERROR item and never fails the batch. */
    public UploadResponse requestUploads(UUID albumId, UUID userId, List<UploadFile> files) {
        if (files == null || files.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "No files given");
        }
        if (files.size() > properties.maxBatchSize()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "At most " + properties.maxBatchSize() + " files per request");
        }
        albums.require(albumId);

        Set<UUID> createdInThisBatch = new HashSet<>();
        List<UploadItem> items = files.stream()
                .map(file -> prepare(albumId, userId, file, createdInThisBatch))
                .toList();
        return new UploadResponse(items);
    }

    private UploadItem prepare(UUID albumId, UUID userId, UploadFile file, Set<UUID> createdInThisBatch) {
        String clientId = file.clientId();
        try {
            String filename = file.filename() == null ? "" : file.filename().trim();
            if (filename.isEmpty()) return UploadItem.error(clientId, "Filename is missing");
            if (filename.length() > MAX_FILENAME) filename = filename.substring(0, MAX_FILENAME);

            var resolved = MediaTypes.resolve(file.contentType(), filename);
            if (resolved.isEmpty()) return UploadItem.error(clientId, "Unsupported file type");

            long size = file.sizeBytes() == null ? 0 : file.sizeBytes();
            if (size <= 0) return UploadItem.error(clientId, "File is empty");
            long limit = properties.limitBytes(resolved.get().kind());
            if (size > limit) {
                return UploadItem.error(clientId, "File is too large (limit " + limit / (1024 * 1024) + " MB)");
            }

            String sha256 = null;
            if (file.sha256() != null && !file.sha256().isBlank()) {
                if (!SHA256.matcher(file.sha256().trim()).matches()) return UploadItem.error(clientId, "Invalid sha256");
                sha256 = file.sha256().trim().toLowerCase(Locale.ROOT);
            }

            Media row = null;
            if (sha256 != null) {
                var existing = media.findByAlbumIdAndSha256AndDeletedAtIsNull(albumId, sha256);
                if (existing.isPresent()) {
                    Media found = existing.get();
                    boolean stalePending = found.getStatus() == MediaStatus.PENDING_UPLOAD
                            && !createdInThisBatch.contains(found.getId());
                    if (!stalePending) return UploadItem.duplicate(clientId, found.getId());
                    row = found; // an earlier attempt that never completed: reuse it for the retry
                }
            }

            var type = resolved.get();
            if (row == null) {
                row = new Media(UUID.randomUUID(), albumId, userId, type.kind(), filename, type.contentType(), size, sha256);
            } else {
                row.reissue(type.kind(), filename, type.contentType(), size);
            }
            row = media.save(row);
            createdInThisBatch.add(row.getId());

            String url = storage.presignPut(row.getOriginalKey(), type.contentType(), properties.uploadUrlTtl());
            return UploadItem.presigned(clientId, row.getId(), url, type.contentType());
        } catch (DataIntegrityViolationException e) {
            return UploadItem.error(clientId, "Conflicting upload in progress, please retry");
        } catch (RuntimeException e) {
            log.error("Could not prepare upload for client file {}", clientId, e);
            return UploadItem.error(clientId, "Could not prepare upload");
        }
    }

    /** Verifies the stored object with HeadObject. Safe to call repeatedly. */
    public MediaResponse complete(UUID mediaId) {
        Media m = find(mediaId);
        if (m.getStatus() == MediaStatus.UPLOADED) {
            return MediaResponse.from(m, storage.presignGet(m.getOriginalKey()));
        }

        var head = storage.head(m.getOriginalKey())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.CONFLICT, "File has not been uploaded yet"));

        long actualSize = head.contentLength() == null ? 0 : head.contentLength();
        long limit = properties.limitBytes(m.getType());
        String problem = null;
        if (actualSize <= 0) {
            problem = "Uploaded file is empty";
        } else if (actualSize > limit) {
            problem = "Uploaded file is too large";
        } else if (!MediaTypes.normalize(head.contentType()).equals(m.getContentType())) {
            problem = "Uploaded content type does not match";
        }

        if (problem != null) {
            storage.delete(m.getOriginalKey());
            m.reject();
            media.save(m);
            throw new ResponseStatusException(HttpStatus.UNPROCESSABLE_ENTITY, problem);
        }

        m.markUploaded(actualSize);
        return MediaResponse.from(media.save(m), storage.presignGet(m.getOriginalKey()));
    }

    /** Soft delete only: the object stays in the bucket (photos cannot be recovered once gone). */
    public void delete(UUID mediaId) {
        Media m = find(mediaId);
        m.softDelete();
        media.save(m);
    }

    private Media find(UUID mediaId) {
        return media.findByIdAndDeletedAtIsNull(mediaId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Media not found"));
    }
}
