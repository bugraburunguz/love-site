package com.lovesite.trash;

import com.lovesite.album.Album;
import com.lovesite.album.AlbumDtos.AlbumResponse;
import com.lovesite.album.AlbumRepository;
import com.lovesite.album.AlbumService;
import com.lovesite.media.Media;
import com.lovesite.media.MediaDtos.MediaResponse;
import com.lovesite.media.MediaRepository;
import com.lovesite.media.MediaService;
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

import java.time.Instant;
import java.util.List;
import java.util.UUID;

/**
 * The trash: albums and single photos / videos deleted in the last 30 days (TrashPurgeJob removes them for good after
 * that) and putting them back. A photo of a deleted album is not listed on its own: it comes back with its album.
 */
@Service
public class TrashService {

    private static final Logger log = LoggerFactory.getLogger(TrashService.class);

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
        List<TrashAlbum> deletedAlbums = albums.findBySpaceIdAndDeletedAtIsNotNullOrderByDeletedAtDesc(spaceId).stream()
                .map((a) -> new TrashAlbum(albumService.toResponse(a), countMedia(a.getId()), a.getDeletedAt(), purgeAt(a.getDeletedAt())))
                .toList();
        // single deleted items of albums that are still there; unconfirmed / rejected uploads are not "memories"
        List<UUID> ids = jdbc.queryForList(
                "SELECT m.id FROM media m JOIN album a ON a.id = m.album_id WHERE m.space_id = ? AND m.deleted_at IS NOT NULL "
                        + "AND a.deleted_at IS NULL AND m.status IN ('UPLOADED', 'PROCESSING', 'READY', 'FAILED') ORDER BY m.deleted_at DESC",
                UUID.class, spaceId);
        List<Media> found = media.findAllById(ids);
        List<TrashMedia> deletedMedia = ids.stream()
                .flatMap((id) -> found.stream().filter((m) -> m.getId().equals(id)).findFirst().stream())
                .map((m) -> new TrashMedia(mediaService.toResponse(m), m.getAlbumId(), albumTitle(m.getAlbumId()), m.getDeletedAt(), purgeAt(m.getDeletedAt())))
                .toList();
        return new TrashView((int) properties.trashRetention().toDays(), deletedAlbums, deletedMedia);
    }

    /** Puts a photo / video back; it is placed in its album again like a fresh upload. */
    public void restoreMedia(CurrentUser me, UUID mediaId) {
        UUID spaceId = me.requireSpace();
        Media restored;
        try {
            restored = tx.execute((status) -> {
                Media m = media.findByIdAndSpaceIdAndDeletedAtIsNotNull(mediaId, spaceId)
                        .filter((x) -> !"PENDING_UPLOAD".equals(x.getStatus().name()) && !"REJECTED".equals(x.getStatus().name()))
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
            Album album = albums.findByIdAndSpaceIdAndDeletedAtIsNotNull(albumId, spaceId)
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
                + "AND status IN ('UPLOADED', 'PROCESSING', 'READY', 'FAILED')", Integer.class, albumId);
    }

    private String albumTitle(UUID albumId) {
        return albums.findById(albumId).map(Album::getTitle).orElse(null);
    }
}
