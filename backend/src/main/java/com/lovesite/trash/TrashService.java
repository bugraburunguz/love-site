package com.lovesite.trash;

import com.lovesite.album.Album;
import com.lovesite.album.AlbumDtos.AlbumResponse;
import com.lovesite.album.AlbumRepository;
import com.lovesite.album.AlbumService;
import com.lovesite.media.Media;
import com.lovesite.media.MediaDtos.MediaResponse;
import com.lovesite.media.MediaRepository;
import com.lovesite.media.MediaService;
import com.lovesite.media.MediaStatus;
import com.lovesite.page.PageService;
import com.lovesite.space.SpaceProperties;
import com.lovesite.system.ApiException;
import com.lovesite.user.CurrentUser;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionTemplate;

import java.sql.Timestamp;
import java.time.Instant;
import java.util.EnumSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;

/**
 * The trash: albums and single photos / videos deleted in the last 30 days (TrashPurgeJob removes them for good after
 * that) and putting them back. A photo of a deleted album is not listed on its own: it comes back with its album.
 */
@Service
public class TrashService {

    private static final Logger log = LoggerFactory.getLogger(TrashService.class);

    /** what counts as a memory (unconfirmed and rejected uploads do not); the same set the album lists show */
    private static final Set<MediaStatus> RESTORABLE =
            EnumSet.of(MediaStatus.UPLOADED, MediaStatus.PROCESSING, MediaStatus.READY, MediaStatus.FAILED);
    private static final String RESTORABLE_SQL =
            RESTORABLE.stream().map((s) -> "'" + s.name() + "'").collect(Collectors.joining(", "));

    public record TrashAlbum(AlbumResponse album, int mediaCount, Instant deletedAt, Instant purgeAt) {
    }

    public record TrashMedia(MediaResponse media, UUID albumId, String albumTitle, Instant deletedAt, Instant purgeAt) {
    }

    public record TrashView(int retentionDays, List<TrashAlbum> albums, List<TrashMedia> media) {
    }

    private final JdbcTemplate jdbc;
    private final TransactionTemplate tx;
    private final AlbumRepository albums;
    private final AlbumService albumService;
    private final MediaRepository media;
    private final MediaService mediaService;
    private final PageService pages;
    private final SpaceProperties properties;

    public TrashService(JdbcTemplate jdbc, TransactionTemplate tx, AlbumRepository albums, AlbumService albumService,
                        MediaRepository media, MediaService mediaService, PageService pages, SpaceProperties properties) {
        this.jdbc = jdbc;
        this.tx = tx;
        this.albums = albums;
        this.albumService = albumService;
        this.media = media;
        this.mediaService = mediaService;
        this.pages = pages;
        this.properties = properties;
    }

    public TrashView list(CurrentUser me) {
        UUID spaceId = me.requireSpace();
        Instant since = restorableSince();
        List<TrashAlbum> deletedAlbums = albums.findBySpaceIdAndDeletedAtIsNotNullOrderByDeletedAtDesc(spaceId).stream()
                .filter((a) -> a.getDeletedAt().isAfter(since))
                .map((a) -> new TrashAlbum(albumService.toResponse(a), countMedia(a.getId()), a.getDeletedAt(), purgeAt(a.getDeletedAt())))
                .toList();
        // single deleted items of albums that are still there; unconfirmed / rejected uploads are not "memories"
        Map<UUID, String> titles = new LinkedHashMap<>();
        jdbc.query(
                "SELECT m.id, a.title FROM media m JOIN album a ON a.id = m.album_id WHERE m.space_id = ? AND m.deleted_at > ? "
                        + "AND a.deleted_at IS NULL AND m.status IN (" + RESTORABLE_SQL + ") ORDER BY m.deleted_at DESC",
                (rs) -> {
                    titles.put(rs.getObject(1, UUID.class), rs.getString(2));
                },
                spaceId, Timestamp.from(since));
        Map<UUID, Media> found = media.findAllById(titles.keySet()).stream().collect(Collectors.toMap(Media::getId, (m) -> m));
        List<TrashMedia> deletedMedia = titles.entrySet().stream()
                .filter((e) -> found.containsKey(e.getKey()))
                .map((e) -> {
                    Media m = found.get(e.getKey());
                    return new TrashMedia(mediaService.toResponse(m), m.getAlbumId(), e.getValue(), m.getDeletedAt(), purgeAt(m.getDeletedAt()));
                })
                .toList();
        return new TrashView((int) properties.trashRetention().toDays(), deletedAlbums, deletedMedia);
    }

    /**
     * Only what is still inside the retention period can come back. The nightly purge fixes its cutoff before it starts
     * and only takes rows deleted before it, so nothing it is removing (or failed to remove halfway) can be restored.
     */
    private Instant restorableSince() {
        return Instant.now().minus(properties.trashRetention());
    }

    /** Puts a photo / video back; it is placed in its album again like a fresh upload. */
    public void restoreMedia(CurrentUser me, UUID mediaId) {
        UUID spaceId = me.requireSpace();
        Media restored;
        try {
            restored = tx.execute((status) -> {
                Instant since = restorableSince();
                Media m = media.findByIdAndSpaceIdAndDeletedAtIsNotNull(mediaId, spaceId)
                        .filter((x) -> RESTORABLE.contains(x.getStatus()) && x.getDeletedAt().isAfter(since))
                        .orElseThrow(() -> ApiException.notFound("Çöpte böyle bir şey yok"));
                if (albums.findByIdAndSpaceIdAndDeletedAtIsNull(m.getAlbumId(), spaceId).isEmpty()) {
                    throw ApiException.conflict("Önce albümü çöpten geri al");
                }
                if (m.getSha256() != null && media.findBySpaceIdAndAlbumIdAndSha256AndDeletedAtIsNull(spaceId, m.getAlbumId(), m.getSha256()).isPresent()) {
                    throw ApiException.conflict("Bu fotoğraf albümde zaten var");
                }
                m.restore();
                return media.saveAndFlush(m);
            });
        } catch (DataIntegrityViolationException e) {
            // lost a race against an upload of the same file
            throw ApiException.conflict("Bu fotoğraf albümde zaten var");
        }
        if (restored == null) return;
        try {
            pages.autoPlace(restored.getSpaceId(), restored.getAlbumId(), restored.getId(), restored.isFeatured());
        } catch (RuntimeException e) {
            log.warn("Restored media {} could not be placed on a page, it stays in the tray: {}", restored.getId(), e.toString());
        }
    }

    /** Puts an album back with everything that was in it when it was deleted. */
    public void restoreAlbum(CurrentUser me, UUID albumId) {
        UUID spaceId = me.requireSpace();
        tx.executeWithoutResult((status) -> {
            Instant since = restorableSince();
            Album album = albums.findByIdAndSpaceIdAndDeletedAtIsNotNull(albumId, spaceId)
                    .filter((a) -> a.getDeletedAt().isAfter(since))
                    .orElseThrow(() -> ApiException.notFound("Çöpte böyle bir şey yok"));
            album.restore();
            albums.save(album);
        });
    }

    private Instant purgeAt(Instant deletedAt) {
        return deletedAt.plus(properties.trashRetention());
    }

    private int countMedia(UUID albumId) {
        return jdbc.queryForObject("SELECT count(*) FROM media WHERE album_id = ? AND deleted_at IS NULL "
                + "AND status IN (" + RESTORABLE_SQL + ")", Integer.class, albumId);
    }
}
