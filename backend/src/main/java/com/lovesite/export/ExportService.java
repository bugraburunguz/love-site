package com.lovesite.export;

import com.lovesite.album.ThemeProperties;
import com.lovesite.config.PublicUrlProperties;
import com.lovesite.export.ExportDtos.ExportFile;
import com.lovesite.export.ExportDtos.ExportResponse;
import com.lovesite.page.PageService;
import com.lovesite.page.PageService.PageView;
import com.lovesite.page.PageService.PagesView;
import com.lovesite.storage.StorageService;
import com.lovesite.system.ApiException;
import com.lovesite.user.CurrentUser;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionTemplate;
import tools.jackson.core.type.TypeReference;
import tools.jackson.databind.json.JsonMapper;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.ArrayList;
import java.util.HexFormat;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;

/**
 * Creating and reading exports. Everything is scoped by the caller's space in the query itself: a media, album, page or
 * export id of another space behaves like an id that does not exist (404).
 *
 * A request is turned into a PAYLOAD right away: a snapshot of everything the render needs (media with their storage keys,
 * the theme of the page each one sits on, captions, dates, page layouts, album title ...). The fingerprint of that payload
 * says "same content": a second request with the same media, the same content version and the same themes returns the
 * existing result for 24 h instead of rendering again. The worker renders from the snapshot.
 *
 * Parameters (all types: `watermark`, default true):
 * - POLAROID: mediaId, background transparent|page, motion (MP4 of a moving polaroid; only media with a loop)
 * - STORY, POST: mediaId, motion (default: true for media with a loop)
 * - CAROUSEL: albumId, pageIds (1-20), includeCover
 * - REELS: albumId, mediaIds (1-30; empty = the album in page order), includeCover, includeAlbumMusic
 * - STICKER_PACK: mediaIds (3-30), animated
 */
@Service
public class ExportService {

    /** bump when the rendering changes so much that old results must not be handed out as "the same" */
    static final int RENDER_VERSION = 1;
    static final int MAX_CAROUSEL_PAGES = 20;
    static final int MAX_REELS_MEDIA = 30;
    static final int MIN_STICKERS = 3;
    static final int MAX_STICKERS = 30;
    /** REELS timing (seconds): cover, each media, closing card, crossfade between scenes */
    static final double REELS_COVER = 1.5;
    static final double REELS_MEDIA = 2.5;
    static final double REELS_CLOSING = 2.0;
    static final double REELS_TRANSITION = 0.5;
    static final double REELS_MAX_SECONDS = 90;

    private static final TypeReference<Map<String, Object>> MAP = new TypeReference<>() { };
    private static final TypeReference<List<Map<String, Object>>> LIST = new TypeReference<>() { };

    private final JdbcTemplate jdbc;
    private final TransactionTemplate tx;
    private final PageService pages;
    private final StorageService storage;
    private final ExportProperties properties;
    private final ThemeProperties themes;
    private final PublicUrlProperties publicUrl;
    private final JsonMapper json;

    public ExportService(JdbcTemplate jdbc, TransactionTemplate tx, PageService pages, StorageService storage,
                         ExportProperties properties, ThemeProperties themes, PublicUrlProperties publicUrl, JsonMapper json) {
        this.jdbc = jdbc;
        this.tx = tx;
        this.pages = pages;
        this.storage = storage;
        this.properties = properties;
        this.themes = themes;
        this.publicUrl = publicUrl;
        this.json = json;
    }

    // ------------------------------------------------------------------ rows

    public record ExportRow(UUID id, UUID spaceId, UUID albumId, String type, Map<String, Object> params, Map<String, Object> payload,
                            String status, List<Map<String, Object>> results, List<String> notes, int attempts,
                            Instant createdAt, Instant finishedAt, Instant expiresAt, List<Map<String, Object>> meta) {
    }

    private static final String COLUMNS = "id, space_id, album_id, type, params::text, payload::text, status, result_keys::text, notes::text, "
            + "attempts, created_at, finished_at, expires_at, meta::text";

    ExportRow row(java.sql.ResultSet rs) throws java.sql.SQLException {
        return new ExportRow(rs.getObject(1, UUID.class), rs.getObject(2, UUID.class), rs.getObject(3, UUID.class), rs.getString(4),
                json.readValue(rs.getString(5), MAP), json.readValue(rs.getString(6), MAP), rs.getString(7),
                rs.getString(8) == null ? List.of() : json.readValue(rs.getString(8), LIST),
                rs.getString(9) == null ? List.of() : json.readValue(rs.getString(9), new TypeReference<List<String>>() { }),
                rs.getInt(10), rs.getTimestamp(11).toInstant(),
                rs.getTimestamp(12) == null ? null : rs.getTimestamp(12).toInstant(), rs.getTimestamp(13).toInstant(),
                rs.getString(14) == null ? List.of() : json.readValue(rs.getString(14), LIST));
    }

    /** System-level lookup for the worker (it works from the row it claimed). */
    public Optional<ExportRow> find(UUID id) {
        return jdbc.query("SELECT " + COLUMNS + " FROM export_job WHERE id = ?", (rs, i) -> row(rs), id).stream().findFirst();
    }

    private Optional<ExportRow> find(UUID spaceId, UUID id) {
        return jdbc.query("SELECT " + COLUMNS + " FROM export_job WHERE id = ? AND space_id = ? AND expires_at > now()",
                (rs, i) -> row(rs), id, spaceId).stream().findFirst();
    }

    // ------------------------------------------------------------------ reads

    public ExportResponse get(CurrentUser me, UUID id) {
        return toResponse(find(me.requireSpace(), id).orElseThrow(() -> ApiException.notFound("Dışa aktarma bulunamadı")));
    }

    /** The album's exports of the last 24 h (newest first). */
    public List<ExportResponse> listForAlbum(CurrentUser me, UUID albumId) {
        UUID spaceId = me.requireSpace();
        requireAlbum(spaceId, albumId);
        return jdbc.query("SELECT " + COLUMNS + " FROM export_job WHERE space_id = ? AND album_id = ? AND expires_at > now() "
                        + "ORDER BY created_at DESC LIMIT 50", (rs, i) -> row(rs), spaceId, albumId)
                .stream().map(this::toResponse).toList();
    }

    ExportResponse toResponse(ExportRow r) {
        List<ExportFile> files = new ArrayList<>();
        if ("READY".equals(r.status())) {
            for (Map<String, Object> f : r.results()) {
                String key = (String) f.get("key");
                String name = (String) f.get("name");
                String type = (String) f.get("contentType");
                long size = ((Number) f.getOrDefault("size", 0)).longValue();
                files.add(new ExportFile(name, type, size, storage.presignDownload(key, name, type), (String) f.get("role")));
            }
        }
        String error = "FAILED".equals(r.status()) ? "Hazırlanamadı. Biraz sonra yeniden deneyin." : null;
        return new ExportResponse(r.id(), r.type(), r.status(), r.albumId(), r.params(), r.createdAt(), r.finishedAt(), r.expiresAt(),
                files, r.notes(), error, "READY".equals(r.status()) ? r.meta() : List.of());
    }

    // ------------------------------------------------------------------ create

    /** Returns the existing job when the same content was asked for in the last 24 h (queued, running or ready). */
    public ExportResponse create(CurrentUser me, String rawType, Map<String, Object> rawParams, String requestHost) {
        UUID spaceId = me.requireSpace();
        ExportType type = ExportType.parse(rawType).orElseThrow(() -> ApiException.badRequest("Geçersiz dışa aktarma türü"));
        Map<String, Object> params = rawParams == null ? Map.of() : rawParams;
        boolean watermark = bool(params, "watermark", true);
        String host = publicUrl.configured() ? publicUrl.host() : cleanHost(requestHost);

        Built built = build(spaceId, type, params);
        built.payload.put("watermark", watermark && !host.isEmpty() ? host : null);
        built.normalized.put("watermark", watermark);
        String fingerprint = fingerprint(type, built.payload);

        UUID id = tx.execute(status -> {
            // one space at a time: counting active / daily exports and inserting must not race
            jdbc.query("SELECT id FROM space WHERE id = ? FOR UPDATE", rs -> { }, spaceId);
            List<UUID> same = jdbc.query("SELECT id FROM export_job WHERE space_id = ? AND type = ? AND fingerprint = ? AND expires_at > now() "
                            + "AND status IN ('QUEUED','RUNNING','READY') ORDER BY created_at DESC LIMIT 1",
                    (rs, i) -> rs.getObject(1, UUID.class), spaceId, type.name(), fingerprint);
            if (!same.isEmpty()) return same.get(0);
            Integer active = jdbc.queryForObject("SELECT count(*) FROM export_job WHERE space_id = ? AND status IN ('QUEUED','RUNNING')",
                    Integer.class, spaceId);
            if (active != null && active >= properties.maxActivePerSpace()) {
                throw ApiException.tooManyRequests("Aynı anda en fazla " + properties.maxActivePerSpace() + " dışa aktarma hazırlanabilir. Birinin bitmesini bekleyin.");
            }
            Integer today = jdbc.queryForObject("SELECT count(*) FROM export_job WHERE space_id = ? AND created_at > now() - interval '24 hours'",
                    Integer.class, spaceId);
            if (today != null && today >= properties.dailyLimit()) {
                throw ApiException.tooManyRequests("Bugünlük dışa aktarma sınırına ulaştınız. Yarın yeniden deneyin.");
            }
            return jdbc.queryForObject("INSERT INTO export_job (space_id, requested_by, album_id, type, params, payload, fingerprint, status, expires_at) "
                            + "VALUES (?, ?, ?, ?, cast(? as jsonb), cast(? as jsonb), ?, 'QUEUED', ?) RETURNING id", UUID.class,
                    spaceId, me.userId(), built.albumId, type.name(), json.writeValueAsString(built.normalized),
                    json.writeValueAsString(built.payload), fingerprint, Timestamp.from(Instant.now().plus(properties.ttl())));
        });
        return get(me, id);
    }

    private static String cleanHost(String host) {
        if (host == null) return "";
        String h = host.trim().toLowerCase(java.util.Locale.ROOT);
        return h.matches("[a-z0-9.-]{1,120}") ? h : "";
    }

    static String fingerprint(ExportType type, Map<String, Object> payload) {
        try {
            MessageDigest sha = MessageDigest.getInstance("SHA-256");
            String canonical = RENDER_VERSION + "|" + type.name() + "|" + JsonMapper.builder().build().writeValueAsString(payload);
            return HexFormat.of().formatHex(sha.digest(canonical.getBytes(StandardCharsets.UTF_8)));
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException(e);
        }
    }

    // ------------------------------------------------------------------ payload

    /** normalized: the parameters as understood; payload: the render snapshot; albumId: the album the export belongs to */
    private record Built(Map<String, Object> normalized, Map<String, Object> payload, UUID albumId) {
    }

    /** One media row as the render needs it (storage keys; the render endpoint turns them into URLs). */
    private record MediaRow(UUID id, UUID albumId, String type, String status, String caption, Instant displayDate, Integer width,
                            Integer height, Long durationMs, String displayKey, String posterKey, String loopKey, String thumbKey,
                            String filename, String contentType) {
        boolean moving() {
            return loopKey != null;
        }

        Map<String, Object> snapshot() {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("id", id.toString());
            m.put("type", type);
            m.put("caption", caption);
            m.put("displayDate", displayDate.toString());
            m.put("width", width);
            m.put("height", height);
            m.put("durationMs", durationMs);
            m.put("displayKey", displayKey);
            m.put("posterKey", posterKey);
            m.put("loopKey", loopKey);
            m.put("thumbKey", thumbKey);
            m.put("originalFilename", filename);
            m.put("contentType", contentType);
            return m;
        }
    }

    /** Where a media item sits: its page's theme (or the album's), colour and paper slot. */
    private record Look(String themeId, String swatch, String paper) {
        Map<String, Object> into(Map<String, Object> scene) {
            scene.put("themeId", themeId);
            scene.put("swatch", swatch);
            scene.put("paper", paper);
            return scene;
        }
    }

    private record AlbumRow(UUID id, String title, String themeId, String musicKey, Instant createdAt) {
    }

    private Built build(UUID spaceId, ExportType type, Map<String, Object> params) {
        Map<String, Object> normalized = new LinkedHashMap<>();
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("type", type.name());
        List<Map<String, Object>> scenes = new ArrayList<>();
        Map<String, Object> mediaMap = new LinkedHashMap<>();
        UUID albumId;

        switch (type) {
            case POLAROID, STORY, POST -> {
                UUID mediaId = uuid(params, "mediaId").orElseThrow(() -> ApiException.badRequest("Medya seçilmedi"));
                MediaRow media = readyMedia(spaceId, List.of(mediaId)).get(0);
                albumId = media.albumId();
                AlbumRow album = album(spaceId, albumId);
                Look look = looks(spaceId, album).getOrDefault(media.id(), new Look(album.themeId(), null, null));
                boolean motion = type == ExportType.POLAROID ? bool(params, "motion", false) : bool(params, "motion", media.moving());
                if (motion && !media.moving()) throw ApiException.badRequest("Bu medya hareketli değil");
                normalized.put("mediaId", media.id().toString());
                normalized.put("motion", motion);
                Map<String, Object> scene = new LinkedHashMap<>();
                if (type == ExportType.POLAROID) {
                    String background = motion ? "page" : str(params, "background", "transparent");
                    if (!background.equals("transparent") && !background.equals("page")) throw ApiException.badRequest("Geçersiz arka plan");
                    normalized.put("background", background);
                    scene.put("kind", "polaroid");
                    scene.put("background", background);
                } else {
                    scene.put("kind", "story");
                    scene.put("format", type == ExportType.STORY ? "story" : "post");
                }
                scene.put("mediaId", media.id().toString());
                scene.put("motion", motion);
                scenes.add(look.into(scene));
                mediaMap.put(media.id().toString(), media.snapshot());
                payload.put("album", albumSnapshot(album, null));
            }
            case CAROUSEL -> {
                albumId = uuid(params, "albumId").orElseThrow(() -> ApiException.badRequest("Albüm seçilmedi"));
                AlbumRow album = album(spaceId, albumId);
                List<UUID> pageIds = uuids(params, "pageIds");
                if (pageIds.isEmpty()) throw ApiException.badRequest("En az bir sayfa seçin");
                if (pageIds.size() > MAX_CAROUSEL_PAGES) throw ApiException.badRequest("En fazla " + MAX_CAROUSEL_PAGES + " sayfa seçilebilir");
                boolean cover = bool(params, "includeCover", false);
                PagesView view = pages.viewOfSpace(spaceId, albumId);
                Map<UUID, PageView> byId = new LinkedHashMap<>();
                view.pages().forEach(p -> byId.put(p.id(), p));
                List<PageView> chosen = new ArrayList<>();
                for (UUID id : new LinkedHashSet<>(pageIds)) {
                    PageView p = byId.get(id);
                    if (p == null) throw ApiException.notFound("Sayfa bulunamadı");
                    chosen.add(p);
                }
                chosen.sort(java.util.Comparator.comparingInt(PageView::pageIndex));
                Set<UUID> needed = new LinkedHashSet<>();
                chosen.forEach(p -> p.items().stream().filter(i -> i.mediaId() != null).forEach(i -> needed.add(i.mediaId())));
                UUID coverMedia = cover ? firstMedia(view) : null;
                if (coverMedia != null) needed.add(coverMedia);
                for (MediaRow m : mediaOf(spaceId, needed)) mediaMap.put(m.id().toString(), m.snapshot());
                if (cover) scenes.add(new LinkedHashMap<>(Map.of("kind", "cover", "format", "post")));
                Map<String, Object> pagesMap = new LinkedHashMap<>();
                for (PageView p : chosen) {
                    pagesMap.put(p.id().toString(), pageSnapshot(p, album));
                    Map<String, Object> scene = new LinkedHashMap<>();
                    scene.put("kind", "page");
                    scene.put("pageId", p.id().toString());
                    scene.put("pageNumber", p.pageIndex() + 1);
                    scenes.add(scene);
                }
                payload.put("pages", pagesMap);
                payload.put("album", albumSnapshot(album, coverMedia));
                normalized.put("albumId", albumId.toString());
                normalized.put("pageIds", chosen.stream().map(p -> p.id().toString()).toList());
                normalized.put("includeCover", cover);
            }
            case REELS -> {
                albumId = uuid(params, "albumId").orElseThrow(() -> ApiException.badRequest("Albüm seçilmedi"));
                AlbumRow album = album(spaceId, albumId);
                PagesView view = pages.viewOfSpace(spaceId, albumId);
                List<UUID> ids = uuids(params, "mediaIds");
                if (ids.isEmpty()) ids = mediaInPageOrder(spaceId, view).stream().limit(MAX_REELS_MEDIA).toList();
                if (ids.isEmpty()) throw ApiException.badRequest("Albümde hazır medya yok");
                if (ids.size() > MAX_REELS_MEDIA) throw ApiException.badRequest("Reels için en fazla " + MAX_REELS_MEDIA + " medya seçilebilir");
                List<MediaRow> media = readyMedia(spaceId, ids);
                for (MediaRow m : media) if (!m.albumId().equals(albumId)) throw ApiException.notFound("Medya bulunamadı");
                boolean cover = bool(params, "includeCover", true);
                boolean music = bool(params, "includeAlbumMusic", false);
                double seconds = (cover ? REELS_COVER : 0) + media.size() * REELS_MEDIA + REELS_CLOSING
                        - (media.size() + (cover ? 1 : 0)) * REELS_TRANSITION;
                if (seconds > REELS_MAX_SECONDS) throw ApiException.badRequest("Reels en fazla " + (int) REELS_MAX_SECONDS + " saniye olabilir");
                Map<UUID, Look> looks = looks(spaceId, album);
                UUID coverMedia = cover ? (media.isEmpty() ? null : media.get(0).id()) : null;
                if (cover) scenes.add(new LinkedHashMap<>(Map.of("kind", "cover", "format", "story")));
                for (MediaRow m : media) {
                    Map<String, Object> scene = new LinkedHashMap<>();
                    scene.put("kind", "story");
                    scene.put("format", "story");
                    scene.put("mediaId", m.id().toString());
                    scene.put("motion", m.moving());
                    scenes.add(looks.getOrDefault(m.id(), new Look(album.themeId(), null, null)).into(scene));
                    mediaMap.put(m.id().toString(), m.snapshot());
                }
                scenes.add(new LinkedHashMap<>(Map.of("kind", "closing", "format", "story")));
                payload.put("album", albumSnapshot(album, coverMedia));
                boolean withMusic = music && album.musicKey() != null;
                payload.put("musicKey", withMusic ? album.musicKey() : null);
                payload.put("timing", Map.of("cover", REELS_COVER, "media", REELS_MEDIA, "closing", REELS_CLOSING, "transition", REELS_TRANSITION));
                normalized.put("albumId", albumId.toString());
                normalized.put("mediaIds", media.stream().map(m -> m.id().toString()).toList());
                normalized.put("includeCover", cover);
                normalized.put("includeAlbumMusic", music);
                normalized.put("albumHasMusic", album.musicKey() != null);
            }
            case STICKER_PACK -> {
                List<UUID> ids = uuids(params, "mediaIds");
                if (ids.size() < MIN_STICKERS || ids.size() > MAX_STICKERS) {
                    throw ApiException.badRequest("Sticker paketi için " + MIN_STICKERS + "-" + MAX_STICKERS + " medya seçin");
                }
                List<MediaRow> media = readyMedia(spaceId, ids);
                boolean animated = bool(params, "animated", false);
                albumId = media.get(0).albumId();
                Map<UUID, AlbumRow> albums = new LinkedHashMap<>();
                Map<UUID, Map<UUID, Look>> looksByAlbum = new LinkedHashMap<>();
                for (MediaRow m : media) {
                    AlbumRow album = albums.computeIfAbsent(m.albumId(), a -> album(spaceId, a));
                    Look look = looksByAlbum.computeIfAbsent(album.id(), a -> looks(spaceId, album))
                            .getOrDefault(m.id(), new Look(album.themeId(), null, null));
                    Map<String, Object> scene = new LinkedHashMap<>();
                    scene.put("kind", "sticker");
                    scene.put("mediaId", m.id().toString());
                    scene.put("motion", animated && m.moving());
                    scenes.add(look.into(scene));
                    mediaMap.put(m.id().toString(), m.snapshot());
                }
                payload.put("album", albumSnapshot(albums.get(albumId), null));
                normalized.put("mediaIds", media.stream().map(m -> m.id().toString()).toList());
                normalized.put("animated", animated);
            }
            default -> throw ApiException.badRequest("Geçersiz dışa aktarma türü");
        }
        payload.put("media", mediaMap);
        payload.put("scenes", scenes);
        return new Built(normalized, payload, albumId);
    }

    private Map<String, Object> albumSnapshot(AlbumRow album, UUID coverMedia) {
        Map<String, Object> a = new LinkedHashMap<>();
        a.put("id", album.id().toString());
        a.put("title", album.title());
        a.put("themeId", album.themeId());
        a.put("coverMediaId", coverMedia == null ? null : coverMedia.toString());
        a.put("createdAt", album.createdAt().toString());
        return a;
    }

    private Map<String, Object> pageSnapshot(PageView p, AlbumRow album) {
        Map<String, Object> page = new LinkedHashMap<>();
        page.put("id", p.id().toString());
        page.put("albumId", album.id().toString());
        page.put("pageIndex", p.pageIndex());
        page.put("template", p.template());
        page.put("version", p.version());
        page.put("swatch", p.swatch());
        page.put("paper", p.paper());
        // the theme the page is drawn with: its own, or the album's
        page.put("themeId", p.themeId() != null ? p.themeId() : album.themeId());
        List<Map<String, Object>> items = new ArrayList<>();
        for (PageService.Item i : p.items()) {
            Map<String, Object> item = new LinkedHashMap<>();
            item.put("id", i.id().toString());
            item.put("kind", i.kind());
            item.put("mediaId", i.mediaId() == null ? null : i.mediaId().toString());
            item.put("slotIndex", i.slotIndex());
            item.put("x", i.x());
            item.put("y", i.y());
            item.put("width", i.width());
            item.put("rotation", i.rotation());
            item.put("zIndex", i.zIndex());
            item.put("variant", i.variant());
            item.put("version", i.version());
            items.add(item);
        }
        page.put("items", items);
        return page;
    }

    // ------------------------------------------------------------------ scoped lookups

    private void requireAlbum(UUID spaceId, UUID albumId) {
        album(spaceId, albumId);
    }

    private AlbumRow album(UUID spaceId, UUID albumId) {
        return jdbc.query("SELECT id, title, theme_id, music_key, created_at FROM album WHERE id = ? AND space_id = ? AND deleted_at IS NULL",
                        (rs, i) -> new AlbumRow(rs.getObject(1, UUID.class), rs.getString(2),
                                themes.isAllowed(rs.getString(3)) ? rs.getString(3) : themes.defaultTheme(), rs.getString(4),
                                rs.getTimestamp(5).toInstant()),
                        albumId, spaceId)
                .stream().findFirst().orElseThrow(() -> ApiException.notFound("Albüm bulunamadı"));
    }

    private static final String MEDIA_COLUMNS = "m.id, m.album_id, m.type, m.status, m.caption, "
            + "coalesce(m.taken_at, m.client_modified_at, m.created_at), m.width, m.height, m.duration_ms, "
            + "m.display_key, m.poster_key, m.loop_key, m.thumb_key, m.original_filename, m.content_type";

    private static MediaRow mediaRow(java.sql.ResultSet rs) throws java.sql.SQLException {
        return new MediaRow(rs.getObject(1, UUID.class), rs.getObject(2, UUID.class), rs.getString(3), rs.getString(4), rs.getString(5),
                rs.getTimestamp(6).toInstant(), (Integer) rs.getObject(7), (Integer) rs.getObject(8), (Long) rs.getObject(9),
                rs.getString(10), rs.getString(11), rs.getString(12), rs.getString(13), rs.getString(14), rs.getString(15));
    }

    /** Live media of the space's live albums, any processing state. */
    private List<MediaRow> mediaOf(UUID spaceId, java.util.Collection<UUID> ids) {
        if (ids.isEmpty()) return List.of();
        return jdbc.query("SELECT " + MEDIA_COLUMNS + " FROM media m JOIN album a ON a.id = m.album_id AND a.space_id = m.space_id "
                        + "WHERE m.space_id = ? AND m.id = ANY(?) AND m.deleted_at IS NULL AND a.deleted_at IS NULL "
                        + "AND m.status IN ('UPLOADED','PROCESSING','READY','FAILED') ORDER BY m.id",
                (rs, i) -> mediaRow(rs), spaceId, ids.toArray(new UUID[0]));
    }

    /** Every id must be media of this space (404 otherwise) that finished processing (409 otherwise); the order is kept. */
    private List<MediaRow> readyMedia(UUID spaceId, List<UUID> ids) {
        List<UUID> unique = new ArrayList<>(new LinkedHashSet<>(ids));
        Map<UUID, MediaRow> found = new LinkedHashMap<>();
        for (MediaRow m : mediaOf(spaceId, unique)) found.put(m.id(), m);
        List<MediaRow> result = new ArrayList<>();
        for (UUID id : unique) {
            MediaRow m = found.get(id);
            if (m == null) throw ApiException.notFound("Medya bulunamadı");
            if (!"READY".equals(m.status()) || m.displayKey() == null && m.posterKey() == null) {
                throw ApiException.conflict("Seçilen medya henüz hazır değil");
            }
            result.add(m);
        }
        return result;
    }

    /** media id -> its page's look; media on no page (the tray) are not in the map (they use the album's theme). */
    private Map<UUID, Look> looks(UUID spaceId, AlbumRow album) {
        Map<UUID, Look> result = new LinkedHashMap<>();
        for (PageView p : pages.viewOfSpace(spaceId, album.id()).pages()) {
            Look look = new Look(p.themeId() != null ? p.themeId() : album.themeId(), p.swatch(), p.paper());
            p.items().stream().filter(i -> i.mediaId() != null).forEach(i -> result.put(i.mediaId(), look));
        }
        return result;
    }

    /** READY media of the album in reading order (page order, slot / stacking order inside a page). */
    private List<UUID> mediaInPageOrder(UUID spaceId, PagesView view) {
        List<UUID> order = new ArrayList<>();
        for (PageView p : view.pages()) {
            p.items().stream().filter(i -> "MEDIA".equals(i.kind()) && i.mediaId() != null)
                    .sorted(java.util.Comparator.comparing((PageService.Item i) -> i.slotIndex() == null ? Integer.MAX_VALUE : i.slotIndex())
                            .thenComparing(i -> i.zIndex() == null ? 0 : i.zIndex()))
                    .forEach(i -> order.add(i.mediaId()));
        }
        Set<UUID> ready = new java.util.HashSet<>();
        for (MediaRow m : mediaOf(spaceId, order)) if ("READY".equals(m.status())) ready.add(m.id());
        return order.stream().filter(ready::contains).toList();
    }

    private UUID firstMedia(PagesView view) {
        for (PageView p : view.pages()) {
            for (PageService.Item i : p.items()) if (i.mediaId() != null) return i.mediaId();
        }
        return null;
    }

    // ------------------------------------------------------------------ params

    private static boolean bool(Map<String, Object> params, String key, boolean fallback) {
        Object v = params.get(key);
        if (v == null) return fallback;
        if (v instanceof Boolean b) return b;
        throw ApiException.badRequest("Geçersiz değer: " + key);
    }

    private static String str(Map<String, Object> params, String key, String fallback) {
        Object v = params.get(key);
        if (v == null) return fallback;
        if (v instanceof String s) return s;
        throw ApiException.badRequest("Geçersiz değer: " + key);
    }

    private static Optional<UUID> uuid(Map<String, Object> params, String key) {
        Object v = params.get(key);
        if (v == null) return Optional.empty();
        try {
            return Optional.of(UUID.fromString(String.valueOf(v)));
        } catch (IllegalArgumentException e) {
            throw ApiException.badRequest("Geçersiz değer: " + key);
        }
    }

    private static List<UUID> uuids(Map<String, Object> params, String key) {
        Object v = params.get(key);
        if (v == null) return List.of();
        if (!(v instanceof List<?> list)) throw ApiException.badRequest("Geçersiz değer: " + key);
        if (list.size() > 200) throw ApiException.badRequest("Çok fazla öğe");
        List<UUID> out = new ArrayList<>();
        for (Object o : list) {
            try {
                out.add(UUID.fromString(String.valueOf(o)));
            } catch (IllegalArgumentException e) {
                throw ApiException.badRequest("Geçersiz değer: " + key);
            }
        }
        return out;
    }
}
