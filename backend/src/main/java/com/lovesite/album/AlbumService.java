package com.lovesite.album;

import com.lovesite.album.AlbumDtos.AlbumResponse;
import com.lovesite.album.AlbumDtos.AlbumUpdate;
import com.lovesite.album.AlbumDtos.MusicUploadRequest;
import com.lovesite.album.AlbumDtos.MusicUploadResponse;
import com.lovesite.media.MediaProperties;
import com.lovesite.space.QuotaService;
import com.lovesite.storage.StorageService;
import com.lovesite.system.ApiException;
import com.lovesite.user.CurrentUser;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionTemplate;

import java.sql.Timestamp;
import java.time.Instant;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

@Service
public class AlbumService {

    private static final Logger log = LoggerFactory.getLogger(AlbumService.class);

    public static final long MAX_MUSIC_BYTES = 20L * 1024 * 1024;
    static final Set<String> MUSIC_TYPES = Set.of("audio/mpeg", "audio/mp4", "audio/x-m4a", "audio/aac", "audio/ogg");

    private final AlbumRepository albums;
    private final ThemeProperties themes;
    private final StorageService storage;
    private final QuotaService quota;
    private final TransactionTemplate tx;
    private final MediaProperties mediaProperties;
    private final com.lovesite.backup.PurgeLog purgeLog;
    private final JdbcTemplate jdbc;

    public AlbumService(AlbumRepository albums, ThemeProperties themes, StorageService storage, QuotaService quota,
                        TransactionTemplate tx, MediaProperties mediaProperties,
                        com.lovesite.backup.PurgeLog purgeLog, JdbcTemplate jdbc) {
        this.jdbc = jdbc;
        this.purgeLog = purgeLog;
        this.albums = albums;
        this.themes = themes;
        this.storage = storage;
        this.quota = quota;
        this.tx = tx;
        this.mediaProperties = mediaProperties;
    }

    public AlbumResponse toResponse(Album a) {
        return toResponses(a.getSpaceId(), List.of(a)).get(0);
    }

    /** Responses for albums of one space with their media summaries: two queries in total, whatever the number of albums. */
    public List<AlbumResponse> toResponses(UUID spaceId, List<Album> list) {
        if (list.isEmpty()) return List.of();
        UUID[] ids = list.stream().map(Album::getId).toArray(UUID[]::new);
        Map<UUID, Summary> summaries = summaries(spaceId, ids);
        Map<UUID, String> covers = coverKeys(spaceId, ids);
        return list.stream().map(a -> toResponse(a, summaries.getOrDefault(a.getId(), Summary.EMPTY), covers.get(a.getId()))).toList();
    }

    private AlbumResponse toResponse(Album a, Summary summary, String coverKey) {
        String url = a.getMusicKey() == null ? null : storage.presignGet(a.getMusicKey());
        String cover = coverKey == null ? null : storage.presignGet(coverKey);
        return new AlbumResponse(a.getId(), a.getTitle(), a.getThemeId(), url, a.getMusicOriginalFilename(), a.getCreatedAt(),
                a.getUpdatedAt(), summary.count(), summary.first(), summary.last(), cover);
    }

    private record Summary(int count, Instant first, Instant last) {
        static final Summary EMPTY = new Summary(0, null, null);
    }

    private static final String SHOWN = "coalesce(m.date_override, m.taken_at, m.client_modified_at, m.created_at)";
    private static final String LISTED = "('UPLOADED','PROCESSING','READY','FAILED')";
    private static final String COVER_KEY = "(CASE WHEN m.type = 'IMAGE' THEN coalesce(m.thumb_key, m.display_key) ELSE m.poster_key END)";
    private static final String OF_ALBUMS = " FROM media m WHERE m.space_id = ? AND m.album_id = ANY(?) AND m.deleted_at IS NULL ";

    private Map<UUID, Summary> summaries(UUID spaceId, UUID[] albumIds) {
        Map<UUID, Summary> result = new HashMap<>();
        jdbc.query("SELECT m.album_id, count(*), min(" + SHOWN + "), max(" + SHOWN + ")" + OF_ALBUMS
                        + "AND m.status IN " + LISTED + " GROUP BY m.album_id",
                rs -> {
                    result.put(rs.getObject(1, UUID.class), new Summary(rs.getInt(2), instant(rs.getTimestamp(3)), instant(rs.getTimestamp(4))));
                }, spaceId, albumIds);
        return result;
    }

    /** Mirrors the frontend's coverSource: the first READY item; a photo's thumb (or display), a video's poster. */
    private Map<UUID, String> coverKeys(UUID spaceId, UUID[] albumIds) {
        Map<UUID, String> result = new HashMap<>();
        jdbc.query("SELECT DISTINCT ON (m.album_id) m.album_id, " + COVER_KEY + OF_ALBUMS
                        + "AND m.status = 'READY' AND " + COVER_KEY + " IS NOT NULL ORDER BY m.album_id, m.created_at, m.id",
                rs -> {
                    String key = rs.getString(2);
                    if (key != null) result.put(rs.getObject(1, UUID.class), key);
                }, spaceId, albumIds);
        return result;
    }

    private static Instant instant(Timestamp t) {
        return t == null ? null : t.toInstant();
    }

    @Transactional(readOnly = true)
    public List<AlbumResponse> list(CurrentUser me) {
        UUID spaceId = me.requireSpace();
        return toResponses(spaceId, albums.findBySpaceIdAndDeletedAtIsNullOrderByCreatedAtDesc(spaceId));
    }

    @Transactional(readOnly = true)
    public AlbumResponse get(CurrentUser me, UUID id) {
        return toResponse(require(me, id));
    }

    private String validTheme(String themeId) {
        if (themeId == null || themeId.isBlank()) return themes.defaultTheme();
        if (!themes.isAllowed(themeId)) throw ApiException.badRequest("Geçersiz tema");
        return themeId;
    }

    @Transactional
    public AlbumResponse create(CurrentUser me, String title, String themeId) {
        return toResponse(albums.save(new Album(me.requireSpace(), title.trim(), me.userId(), validTheme(themeId))));
    }

    @Transactional
    public AlbumResponse update(CurrentUser me, UUID id, AlbumUpdate update) {
        Album album = require(me, id);
        if (update.title() != null) {
            if (update.title().isBlank()) throw ApiException.badRequest("Albüm adı boş olamaz");
            album.rename(update.title().trim());
        }
        if (update.themeId() != null) {
            album.changeTheme(validTheme(update.themeId()));
        }
        return toResponse(album);
    }

    @Transactional
    public void delete(CurrentUser me, UUID id) {
        require(me, id).softDelete();
    }

    /** An album of the caller's space that is not deleted; anything else (other space, unknown id) is a 404. */
    public Album require(CurrentUser me, UUID id) {
        return albums.findByIdAndSpaceIdAndDeletedAtIsNull(id, me.requireSpace())
                .orElseThrow(() -> ApiException.notFound("Albüm bulunamadı"));
    }

    // ------------------------------------------------------------------ music

    private static String normalizeType(String contentType) {
        if (contentType == null) return "";
        int semicolon = contentType.indexOf(';');
        return (semicolon >= 0 ? contentType.substring(0, semicolon) : contentType).trim().toLowerCase(Locale.ROOT);
    }

    /** Reserves quota and hands out a presigned PUT for the album's song. */
    public MusicUploadResponse requestMusicUpload(CurrentUser me, UUID albumId, MusicUploadRequest request) {
        require(me, albumId);
        String type = normalizeType(request.contentType());
        if (!MUSIC_TYPES.contains(type)) throw ApiException.badRequest("Desteklenmeyen müzik türü (mp3, m4a, aac veya ogg yükleyin)");
        long size = request.sizeBytes() == null ? 0 : request.sizeBytes();
        if (size <= 0) throw ApiException.badRequest("Dosya boş");
        if (size > MAX_MUSIC_BYTES) throw ApiException.badRequest("Müzik dosyası en fazla 20 MB olabilir");
        String filename = request.filename() == null || request.filename().isBlank() ? "muzik" : request.filename().trim();
        if (filename.length() > 255) filename = filename.substring(0, 255);
        String shownName = filename;
        UUID spaceId = me.requireSpace();
        String key = "spaces/" + spaceId + "/albums/" + albumId + "/audio/" + UUID.randomUUID();

        String previousPending = tx.execute(status -> {
            long limit = quota.lockLimit(spaceId);
            if (quota.usageWithoutPendingMusic(spaceId, albumId) + size > limit) throw ApiException.quotaExceeded();
            Album album = albums.findByIdAndSpaceIdAndDeletedAtIsNull(albumId, spaceId)
                    .orElseThrow(() -> ApiException.notFound("Albüm bulunamadı"));
            String old = album.getMusicPendingKey();
            album.requestMusic(key, type, size, shownName);
            albums.saveAndFlush(album);
            return old;
        });
        deleteQuietly(previousPending);
        return new MusicUploadResponse(storage.presignPut(key, type, mediaProperties.uploadUrlTtl()), type);
    }

    /** Verifies the uploaded object, makes it the album's song and removes the previous one. */
    public AlbumResponse completeMusic(CurrentUser me, UUID albumId) {
        Album album = require(me, albumId);
        String key = album.getMusicPendingKey();
        if (key == null) throw ApiException.conflict("Bekleyen müzik yüklemesi yok");
        UUID spaceId = album.getSpaceId();

        var head = storage.head(key).orElseThrow(() -> ApiException.conflict("Dosya henüz yüklenmedi"));
        long actual = head.contentLength() == null ? 0 : head.contentLength();
        String problem = null;
        if (actual <= 0) problem = "Yüklenen dosya boş";
        else if (actual > MAX_MUSIC_BYTES) problem = "Müzik dosyası en fazla 20 MB olabilir";
        else if (!normalizeType(head.contentType()).equals(album.getMusicPendingContentType())) problem = "Yüklenen dosyanın türü beklenenle uyuşmuyor";
        if (problem != null) {
            dropPending(spaceId, albumId, key);
            throw ApiException.unprocessable(problem);
        }

        boolean fits = Boolean.TRUE.equals(tx.execute(status -> {
            long limit = quota.lockLimit(spaceId);
            return quota.usageWithoutPendingMusic(spaceId, albumId) + actual <= limit;
        }));
        if (!fits) {
            dropPending(spaceId, albumId, key);
            throw ApiException.quotaExceeded();
        }

        String oldKey = tx.execute(status -> {
            Album fresh = albums.findByIdAndSpaceIdAndDeletedAtIsNull(albumId, spaceId)
                    .orElseThrow(() -> ApiException.notFound("Albüm bulunamadı"));
            if (!key.equals(fresh.getMusicPendingKey())) throw ApiException.conflict("Müzik yüklemesi değişti, tekrar deneyin");
            String previous = fresh.getMusicKey();
            fresh.confirmMusic(actual);
            albums.saveAndFlush(fresh);
            return previous;
        });
        deleteQuietly(oldKey);
        purgeLog.record(oldKey);
        return get(me, albumId);
    }

    public AlbumResponse deleteMusic(CurrentUser me, UUID albumId) {
        require(me, albumId);
        UUID spaceId = me.requireSpace();
        List<String> keys = tx.execute(status -> {
            Album album = albums.findByIdAndSpaceIdAndDeletedAtIsNull(albumId, spaceId)
                    .orElseThrow(() -> ApiException.notFound("Albüm bulunamadı"));
            List<String> old = new java.util.ArrayList<>();
            if (album.getMusicKey() != null) old.add(album.getMusicKey());
            if (album.getMusicPendingKey() != null) old.add(album.getMusicPendingKey());
            album.clearMusic();
            album.clearPendingMusic();
            albums.saveAndFlush(album);
            return old;
        });
        if (keys != null) keys.forEach(this::deleteQuietly);
        if (keys != null && !keys.isEmpty()) purgeLog.record(keys.get(0)); // the confirmed song, if any, is the first entry
        return get(me, albumId);
    }

    private void dropPending(UUID spaceId, UUID albumId, String key) {
        tx.executeWithoutResult(status -> albums.findByIdAndSpaceIdAndDeletedAtIsNull(albumId, spaceId).ifPresent(a -> {
            if (key.equals(a.getMusicPendingKey())) {
                a.clearPendingMusic();
                albums.saveAndFlush(a);
            }
        }));
        deleteQuietly(key);
    }

    private void deleteQuietly(String key) {
        if (key == null) return;
        try {
            storage.delete(key);
        } catch (RuntimeException e) {
            log.warn("Could not delete {}: {}", key, e.toString());
        }
    }
}
