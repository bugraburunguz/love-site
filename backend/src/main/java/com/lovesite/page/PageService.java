package com.lovesite.page;

import com.lovesite.system.ApiException;
import com.lovesite.user.CurrentUser;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;

/**
 * Persistent album pages. Every write first locks the album row (SELECT ... FOR UPDATE), so all changes of one album are
 * serialised: concurrent uploads, moves and template changes can never produce two items in one slot. On top of that the
 * page / item `version` columns protect users from silently overwriting each other (409 with the current state).
 *
 * Everything is scoped by space in the query itself; ids of other spaces behave like ids that do not exist.
 */
@Service
public class PageService {

    public static final int MAX_AUTO = 4;
    private static final Set<String> TEMPLATES = Set.of("AUTO", "FEATURED", "FREE");
    private static final String LISTED = "('UPLOADED','PROCESSING','READY','FAILED')";

    public record Item(UUID id, String kind, UUID mediaId, Integer slotIndex, Double x, Double y, Double width,
                       Double rotation, Integer zIndex, String variant, int version) {
    }

    public record PageView(UUID id, UUID albumId, int pageIndex, String template, int version, String swatch, String paper,
                           List<Item> items) {
    }

    /** Pages in order plus the tray: live media of the album that sit on no page. */
    public record PagesView(List<PageView> pages, List<UUID> tray) {
    }

    public record Geometry(Double x, Double y, Double width, Double rotation, Integer zIndex) {
    }

    public record InitPage(String template, List<UUID> mediaIds) {
    }

    public record ItemGeometry(UUID id, Double x, Double y, Double width, Double rotation, Integer zIndex) {
    }

    private record PageRow(UUID id, UUID albumId, UUID spaceId, int index, String template, int version) {
    }

    private final JdbcTemplate jdbc;

    public PageService(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    // ------------------------------------------------------------------ reads

    @Transactional(readOnly = true)
    public PagesView view(CurrentUser me, UUID albumId) {
        UUID spaceId = me.requireSpace();
        requireAlbum(spaceId, albumId, false);
        return build(spaceId, albumId);
    }

    private PagesView build(UUID spaceId, UUID albumId) {
        List<PageRow> rows = jdbc.query(
                "SELECT id, album_id, space_id, page_index, template, version FROM page WHERE album_id = ? AND space_id = ? ORDER BY page_index",
                (rs, i) -> pageRow(rs), albumId, spaceId);
        Map<UUID, List<Item>> items = new LinkedHashMap<>();
        jdbc.query("SELECT i.id, i.kind, i.media_id, i.slot_index, i.x, i.y, i.width, i.rotation, i.z_index, i.variant, i.version, i.page_id "
                + "FROM page_item i JOIN page p ON p.id = i.page_id WHERE p.album_id = ? AND p.space_id = ? "
                + "ORDER BY i.slot_index NULLS LAST, i.z_index NULLS LAST, i.id", rs -> {
            items.computeIfAbsent(rs.getObject(12, UUID.class), k -> new ArrayList<>()).add(itemRow(rs));
        }, albumId, spaceId);
        Map<UUID, String[]> looks = new LinkedHashMap<>();
        jdbc.query("SELECT id, swatch, paper FROM page WHERE album_id = ? AND space_id = ?",
                rs -> { looks.put(rs.getObject(1, UUID.class), new String[] {rs.getString(2), rs.getString(3)}); }, albumId, spaceId);
        List<PageView> pages = rows.stream()
                .map(r -> {
                    String[] look = looks.getOrDefault(r.id(), new String[2]);
                    return new PageView(r.id(), r.albumId(), r.index(), r.template(), r.version(), look[0], look[1],
                            items.getOrDefault(r.id(), List.of()));
                })
                .toList();
        List<UUID> tray = jdbc.query("SELECT m.id FROM media m WHERE m.space_id = ? AND m.album_id = ? AND m.deleted_at IS NULL "
                + "AND m.status IN " + LISTED + " AND NOT EXISTS (SELECT 1 FROM page_item i WHERE i.media_id = m.id) ORDER BY m.created_at, m.id",
                (rs, i) -> rs.getObject(1, UUID.class), spaceId, albumId);
        return new PagesView(pages, tray);
    }

    private PageView pageView(UUID pageId) {
        PageRow r = jdbc.queryForObject("SELECT id, album_id, space_id, page_index, template, version FROM page WHERE id = ?",
                (rs, i) -> pageRow(rs), pageId);
        String[] look = jdbc.queryForObject("SELECT swatch, paper FROM page WHERE id = ?",
                (rs, i) -> new String[] {rs.getString(1), rs.getString(2)}, pageId);
        return new PageView(r.id(), r.albumId(), r.index(), r.template(), r.version(), look[0], look[1], items(pageId));
    }

    private static PageRow pageRow(java.sql.ResultSet rs) throws java.sql.SQLException {
        return new PageRow(rs.getObject(1, UUID.class), rs.getObject(2, UUID.class), rs.getObject(3, UUID.class), rs.getInt(4),
                rs.getString(5), rs.getInt(6));
    }

    private static Item itemRow(java.sql.ResultSet rs) throws java.sql.SQLException {
        return new Item(rs.getObject(1, UUID.class), rs.getString(2), rs.getObject(3, UUID.class), (Integer) rs.getObject(4),
                (Double) rs.getObject(5), (Double) rs.getObject(6), (Double) rs.getObject(7), (Double) rs.getObject(8),
                (Integer) rs.getObject(9), rs.getString(10), rs.getInt(11));
    }

    private List<Item> items(UUID pageId) {
        return jdbc.query("SELECT id, kind, media_id, slot_index, x, y, width, rotation, z_index, variant, version FROM page_item "
                + "WHERE page_id = ? ORDER BY slot_index NULLS LAST, z_index NULLS LAST, id", (rs, i) -> itemRow(rs), pageId);
    }

    /** Media items of a page in reading order (slot order on AUTO / FEATURED, stacking order on FREE). */
    private List<Item> mediaItems(PageRow page) {
        List<Item> list = new ArrayList<>(items(page.id()).stream().filter(i -> "MEDIA".equals(i.kind())).toList());
        if ("FREE".equals(page.template())) {
            list.sort(Comparator.comparing((Item i) -> i.zIndex() == null ? 0 : i.zIndex()).thenComparing(Item::id));
        }
        return list;
    }

    // ------------------------------------------------------------------ locking and lookups

    private void requireAlbum(UUID spaceId, UUID albumId, boolean lock) {
        List<UUID> found = jdbc.query("SELECT id FROM album WHERE id = ? AND space_id = ? AND deleted_at IS NULL" + (lock ? " FOR UPDATE" : ""),
                (rs, i) -> rs.getObject(1, UUID.class), albumId, spaceId);
        if (found.isEmpty()) throw ApiException.notFound("Albüm bulunamadı");
    }

    private Optional<PageRow> findPage(UUID spaceId, UUID pageId) {
        return jdbc.query("SELECT id, album_id, space_id, page_index, template, version FROM page WHERE id = ? AND space_id = ?",
                (rs, i) -> pageRow(rs), pageId, spaceId).stream().findFirst();
    }

    /** Page of the caller's space, with its album row locked. */
    private PageRow lockedPage(CurrentUser me, UUID pageId) {
        UUID spaceId = me.requireSpace();
        PageRow first = findPage(spaceId, pageId).orElseThrow(() -> ApiException.notFound("Sayfa bulunamadı"));
        requireAlbum(spaceId, first.albumId(), true);
        return findPage(spaceId, pageId).orElseThrow(() -> ApiException.notFound("Sayfa bulunamadı"));
    }

    private record ItemCtx(Item item, PageRow page) {
    }

    private ItemCtx lockedItem(CurrentUser me, UUID itemId) {
        UUID spaceId = me.requireSpace();
        List<UUID> pageIds = jdbc.query("SELECT page_id FROM page_item WHERE id = ? AND space_id = ?",
                (rs, i) -> rs.getObject(1, UUID.class), itemId, spaceId);
        if (pageIds.isEmpty()) throw ApiException.notFound("Öğe bulunamadı");
        PageRow page = lockedPage(me, pageIds.get(0));
        Item item = items(page.id()).stream().filter(i -> i.id().equals(itemId)).findFirst()
                .orElseThrow(() -> ApiException.notFound("Öğe bulunamadı"));
        return new ItemCtx(item, page);
    }

    private void checkPageVersion(PageRow page, Integer provided, boolean required) {
        if (provided == null) {
            if (required) throw ApiException.badRequest("Sürüm bilgisi gerekli");
            return;
        }
        if (provided != page.version()) {
            throw ApiException.conflict("Sayfa başka bir yerde değişti").with("current", pageView(page.id()));
        }
    }

    // ------------------------------------------------------------------ small writes

    private void bump(UUID pageId) {
        jdbc.update("UPDATE page SET version = version + 1, updated_at = now() WHERE id = ?", pageId);
    }

    /** Renumbers the media slots of an AUTO / FEATURED page to 0..n-1 (FREE pages have no slots). */
    private void compact(UUID pageId) {
        String template = jdbc.queryForObject("SELECT template FROM page WHERE id = ?", String.class, pageId);
        if ("FREE".equals(template)) return;
        List<UUID> ids = jdbc.query("SELECT id FROM page_item WHERE page_id = ? AND kind = 'MEDIA' ORDER BY slot_index NULLS LAST, id",
                (rs, i) -> rs.getObject(1, UUID.class), pageId);
        for (int i = 0; i < ids.size(); i++) {
            jdbc.update("UPDATE page_item SET slot_index = ? WHERE id = ? AND slot_index IS DISTINCT FROM ?", i, ids.get(i), i);
        }
    }

    private void shiftPages(UUID albumId, int fromIndex, int by) {
        jdbc.update("UPDATE page SET page_index = page_index + ? WHERE album_id = ? AND page_index >= ?", by, albumId, fromIndex);
    }

    private UUID insertPage(UUID spaceId, UUID albumId, int index, String template) {
        return jdbc.queryForObject("INSERT INTO page (album_id, space_id, page_index, template) VALUES (?, ?, ?, ?) RETURNING id",
                UUID.class, albumId, spaceId, index, template);
    }

    private int pageCount(UUID albumId) {
        Integer n = jdbc.queryForObject("SELECT count(*) FROM page WHERE album_id = ?", Integer.class, albumId);
        return n == null ? 0 : n;
    }

    private void insertMedia(UUID spaceId, UUID pageId, UUID mediaId, int slot) {
        jdbc.update("INSERT INTO page_item (page_id, space_id, kind, media_id, slot_index) VALUES (?, ?, 'MEDIA', ?, ?)",
                pageId, spaceId, mediaId, slot);
    }

    private static final Geometry DEFAULT_GEOMETRY = new Geometry(500.0, 700.0, 400.0, 0.0, null);

    private static void checkGeometry(Geometry g) {
        check(g.x(), -500, 1500, "x");
        check(g.y(), -500, 1900, "y");
        check(g.width(), 20, 1400, "genişlik");
        check(g.rotation(), -360, 360, "döndürme");
        if (g.zIndex() != null && (g.zIndex() < 0 || g.zIndex() > 100000)) throw ApiException.badRequest("Geçersiz katman değeri");
    }

    private static void check(Double value, double lo, double hi, String name) {
        if (value == null) return;
        if (value.isNaN() || value.isInfinite() || value < lo || value > hi) throw ApiException.badRequest("Geçersiz " + name + " değeri");
    }

    private int nextZ(UUID pageId) {
        Integer max = jdbc.queryForObject("SELECT max(z_index) FROM page_item WHERE page_id = ?", Integer.class, pageId);
        return max == null ? 1 : max + 1;
    }

    /** Puts an existing item onto a page: slot (and shifting) for AUTO / FEATURED, geometry for FREE. */
    private void attach(UUID itemId, PageRow page, Integer slot, Geometry geometry) {
        if ("FREE".equals(page.template())) {
            Geometry g = geometry == null ? DEFAULT_GEOMETRY : geometry;
            double x = g.x() == null ? DEFAULT_GEOMETRY.x() : g.x();
            double y = g.y() == null ? DEFAULT_GEOMETRY.y() : g.y();
            double w = g.width() == null ? DEFAULT_GEOMETRY.width() : g.width();
            double rot = g.rotation() == null ? 0 : g.rotation();
            int z = g.zIndex() == null ? nextZ(page.id()) : g.zIndex();
            jdbc.update("UPDATE page_item SET page_id = ?, slot_index = NULL, x = ?, y = ?, width = ?, rotation = ?, z_index = ?, version = version + 1 WHERE id = ?",
                    page.id(), x, y, w, rot, z, itemId);
        } else {
            int at = slot == null ? Integer.MAX_VALUE / 2 : slot;
            jdbc.update("UPDATE page_item SET slot_index = slot_index + 1 WHERE page_id = ? AND kind = 'MEDIA' AND slot_index >= ? AND id <> ?",
                    page.id(), at, itemId);
            jdbc.update("UPDATE page_item SET page_id = ?, slot_index = ?, x = NULL, y = NULL, width = NULL, rotation = NULL, z_index = NULL, version = version + 1 WHERE id = ?",
                    page.id(), at, itemId);
        }
    }

    private Geometry geometryOf(Item item) {
        return new Geometry(item.x(), item.y(), item.width(), item.rotation(), item.zIndex());
    }

    private String normalizeTemplate(String template) {
        String t = template == null ? "AUTO" : template.trim().toUpperCase(java.util.Locale.ROOT);
        if (!TEMPLATES.contains(t)) throw ApiException.badRequest("Geçersiz sayfa şablonu");
        return t;
    }

    /** New AUTO pages (chunks of 4) right behind `pageIndex`, holding the given items in order. */
    private void moveOverflow(UUID spaceId, UUID albumId, int pageIndex, List<Item> overflow) {
        if (overflow.isEmpty()) return;
        int chunks = (overflow.size() + MAX_AUTO - 1) / MAX_AUTO;
        shiftPages(albumId, pageIndex + 1, chunks);
        for (int c = 0; c < chunks; c++) {
            UUID page = insertPage(spaceId, albumId, pageIndex + 1 + c, "AUTO");
            List<Item> part = overflow.subList(c * MAX_AUTO, Math.min(overflow.size(), (c + 1) * MAX_AUTO));
            for (int s = 0; s < part.size(); s++) {
                jdbc.update("UPDATE page_item SET page_id = ?, slot_index = ?, x = NULL, y = NULL, width = NULL, rotation = NULL, z_index = NULL, version = version + 1 WHERE id = ?",
                        page, s, part.get(s).id());
            }
        }
    }

    // ------------------------------------------------------------------ initialize / pages

    /** One-time import of the layout the frontend computed so far. Does nothing when the album already has pages. */
    @Transactional
    public PagesView initialize(CurrentUser me, UUID albumId, List<InitPage> pages) {
        UUID spaceId = me.requireSpace();
        requireAlbum(spaceId, albumId, true);
        if (pageCount(albumId) > 0 || pages == null || pages.isEmpty()) return build(spaceId, albumId);

        Set<UUID> allowed = new HashSet<>(jdbc.query("SELECT id FROM media WHERE space_id = ? AND album_id = ? AND deleted_at IS NULL AND status IN " + LISTED,
                (rs, i) -> rs.getObject(1, UUID.class), spaceId, albumId));
        if (pages.size() > 5000) throw ApiException.badRequest("Çok fazla sayfa");
        Set<UUID> seen = new HashSet<>();
        int index = 0;
        for (InitPage p : pages) {
            String template = normalizeTemplate(p.template());
            List<UUID> ids = p.mediaIds() == null ? List.of() : p.mediaIds();
            if ("FREE".equals(template)) throw ApiException.badRequest("Başlangıç sayfaları serbest olamaz");
            if (ids.isEmpty() || ids.size() > ("FEATURED".equals(template) ? 1 : MAX_AUTO)) throw ApiException.badRequest("Geçersiz sayfa içeriği");
            for (UUID id : ids) {
                if (!allowed.contains(id)) throw ApiException.notFound("Medya bulunamadı");
                if (!seen.add(id)) throw ApiException.badRequest("Aynı medya iki kez yerleştirilemez");
            }
            UUID page = insertPage(spaceId, albumId, index++, template);
            for (int s = 0; s < ids.size(); s++) insertMedia(spaceId, page, ids.get(s), s);
        }
        return build(spaceId, albumId);
    }

    @Transactional
    public PagesView createPage(CurrentUser me, UUID albumId, int afterPageIndex, String template) {
        UUID spaceId = me.requireSpace();
        requireAlbum(spaceId, albumId, true);
        int count = pageCount(albumId);
        if (afterPageIndex < -1 || afterPageIndex > count - 1) throw ApiException.badRequest("Geçersiz sayfa konumu");
        shiftPages(albumId, afterPageIndex + 1, 1);
        insertPage(spaceId, albumId, afterPageIndex + 1, normalizeTemplate(template));
        return build(spaceId, albumId);
    }

    @Transactional
    public PagesView reorder(CurrentUser me, UUID albumId, List<UUID> pageIds) {
        UUID spaceId = me.requireSpace();
        requireAlbum(spaceId, albumId, true);
        List<UUID> current = jdbc.query("SELECT id FROM page WHERE album_id = ? ORDER BY page_index", (rs, i) -> rs.getObject(1, UUID.class), albumId);
        if (pageIds == null || pageIds.size() != current.size() || !new HashSet<>(pageIds).equals(new HashSet<>(current))) {
            throw ApiException.conflict("Sayfalar başka bir yerde değişti").with("current", build(spaceId, albumId));
        }
        for (int i = 0; i < pageIds.size(); i++) {
            jdbc.update("UPDATE page SET page_index = ?, updated_at = now() WHERE id = ?", i, pageIds.get(i));
        }
        return build(spaceId, albumId);
    }

    private static final Set<String> SWATCHES = Set.of("light", "soft", "accent", "deep", "dark");
    private static final Set<String> PAPERS = Set.of("plain", "lined", "textured", "special");
    /** themeId:stickerId, both lower-case slugs */
    private static final java.util.regex.Pattern VARIANT = java.util.regex.Pattern.compile("^[a-z][a-z0-9-]{1,30}:[a-z][a-z0-9-]{1,40}$");
    public static final int MAX_STICKERS = 20;

    /** null / blank leaves the value alone, "DEFAULT" goes back to the theme's own choice. */
    private static String slot(String requested, Set<String> allowed, String current, String what) {
        if (requested == null || requested.isBlank()) return current;
        if ("DEFAULT".equalsIgnoreCase(requested)) return null;
        if (!allowed.contains(requested)) throw ApiException.badRequest("Geçersiz " + what);
        return requested;
    }

    @Transactional
    public PagesView patchPage(CurrentUser me, UUID pageId, String requestedTemplate, Integer version, List<ItemGeometry> frozen,
                               String swatch, String paper) {
        PageRow page = lockedPage(me, pageId);
        checkPageVersion(page, version, true);

        String[] look = jdbc.queryForObject("SELECT swatch, paper FROM page WHERE id = ?",
                (rs, i) -> new String[] {rs.getString(1), rs.getString(2)}, page.id());
        String newSwatch = slot(swatch, SWATCHES, look[0], "sayfa rengi");
        String newPaper = slot(paper, PAPERS, look[1], "kağıt dokusu");
        boolean lookChanged = !java.util.Objects.equals(newSwatch, look[0]) || !java.util.Objects.equals(newPaper, look[1]);
        if (lookChanged) {
            jdbc.update("UPDATE page SET swatch = ?, paper = ?, version = version + 1, updated_at = now() WHERE id = ?", newSwatch, newPaper, page.id());
        }

        String target = requestedTemplate == null ? page.template() : normalizeTemplate(requestedTemplate);
        if (target.equals(page.template())) return build(page.spaceId(), page.albumId());

        List<Item> media = mediaItems(page);
        switch (target) {
            case "FEATURED" -> {
                List<Item> overflow = media.size() > 1 ? media.subList(1, media.size()) : List.of();
                moveOverflow(page.spaceId(), page.albumId(), page.index(), new ArrayList<>(overflow));
                clearToSlots(media.subList(0, Math.min(1, media.size())));
            }
            case "AUTO" -> {
                List<Item> overflow = media.size() > MAX_AUTO ? media.subList(MAX_AUTO, media.size()) : List.of();
                moveOverflow(page.spaceId(), page.albumId(), page.index(), new ArrayList<>(overflow));
                clearToSlots(media.subList(0, Math.min(MAX_AUTO, media.size())));
            }
            case "FREE" -> {
                Map<UUID, ItemGeometry> byId = new LinkedHashMap<>();
                if (frozen != null) frozen.forEach(g -> byId.put(g.id(), g));
                for (Item it : media) {
                    ItemGeometry g = byId.get(it.id());
                    if (g == null || g.x() == null || g.y() == null || g.width() == null) {
                        throw ApiException.badRequest("Serbest düzene geçmek için tüm öğelerin konumu gerekli");
                    }
                    checkGeometry(new Geometry(g.x(), g.y(), g.width(), g.rotation(), g.zIndex()));
                }
                int z = 10;
                for (Item it : media) {
                    ItemGeometry g = byId.get(it.id());
                    jdbc.update("UPDATE page_item SET slot_index = NULL, x = ?, y = ?, width = ?, rotation = ?, z_index = ?, version = version + 1 WHERE id = ?",
                            g.x(), g.y(), g.width(), g.rotation() == null ? 0 : g.rotation(), g.zIndex() == null ? z : g.zIndex(), it.id());
                    z++;
                }
            }
            default -> throw ApiException.badRequest("Geçersiz sayfa şablonu");
        }
        jdbc.update("UPDATE page SET template = ?, version = version + 1, updated_at = now() WHERE id = ?", target, page.id());
        return build(page.spaceId(), page.albumId());
    }

    private void clearToSlots(List<Item> keep) {
        for (int s = 0; s < keep.size(); s++) {
            jdbc.update("UPDATE page_item SET slot_index = ?, x = NULL, y = NULL, width = NULL, rotation = NULL, z_index = NULL, version = version + 1 WHERE id = ?",
                    s, keep.get(s).id());
        }
    }

    @Transactional
    public PagesView deletePage(CurrentUser me, UUID pageId, Integer version) {
        PageRow page = lockedPage(me, pageId);
        checkPageVersion(page, version, false);
        // items go with the page (cascade); their media falls back to the tray
        jdbc.update("DELETE FROM page WHERE id = ?", page.id());
        jdbc.update("UPDATE page SET page_index = page_index - 1 WHERE album_id = ? AND page_index > ?", page.albumId(), page.index());
        return build(page.spaceId(), page.albumId());
    }

    // ------------------------------------------------------------------ items

    @Transactional
    public Item patchItem(CurrentUser me, UUID itemId, Geometry g, Integer version) {
        ItemCtx ctx = lockedItem(me, itemId);
        if (version == null) throw ApiException.badRequest("Sürüm bilgisi gerekli");
        if (version != ctx.item().version()) {
            throw ApiException.conflict("Öğe başka bir yerde değişti").with("current", pageView(ctx.page().id()));
        }
        if ("MEDIA".equals(ctx.item().kind()) && !"FREE".equals(ctx.page().template())) {
            throw ApiException.conflict("Bu sayfa serbest düzende değil");
        }
        checkGeometry(g);
        jdbc.update("UPDATE page_item SET x = coalesce(cast(? as double precision), x), y = coalesce(cast(? as double precision), y), "
                        + "width = coalesce(cast(? as double precision), width), rotation = coalesce(cast(? as double precision), rotation), "
                        + "z_index = coalesce(cast(? as integer), z_index), version = version + 1 WHERE id = ?",
                g.x(), g.y(), g.width(), g.rotation(), g.zIndex(), itemId);
        return items(ctx.page().id()).stream().filter(i -> i.id().equals(itemId)).findFirst().orElseThrow();
    }

    /** Tray -> page. */
    @Transactional
    public PagesView createItem(CurrentUser me, UUID pageId, UUID mediaId, String kind, Integer slotIndex, Geometry g, String variant) {
        if ("STICKER".equals(kind)) return createSticker(me, pageId, g, variant);
        if (kind != null && !"MEDIA".equals(kind)) throw ApiException.badRequest("Bu öğe türü eklenemez");
        if (mediaId == null) throw ApiException.badRequest("Medya gerekli");
        PageRow page = lockedPage(me, pageId);
        UUID spaceId = page.spaceId();
        List<UUID> albums = jdbc.query("SELECT album_id FROM media WHERE id = ? AND space_id = ? AND deleted_at IS NULL AND status IN " + LISTED,
                (rs, i) -> rs.getObject(1, UUID.class), mediaId, spaceId);
        if (albums.isEmpty() || !albums.get(0).equals(page.albumId())) throw ApiException.notFound("Medya bulunamadı");
        Integer placed = jdbc.queryForObject("SELECT count(*) FROM page_item WHERE media_id = ?", Integer.class, mediaId);
        if (placed != null && placed > 0) throw ApiException.conflict("Bu medya zaten bir sayfada");
        if (g != null) checkGeometry(g);

        List<Item> onPage = mediaItems(page);
        switch (page.template()) {
            case "AUTO" -> {
                if (onPage.size() >= MAX_AUTO) throw ApiException.conflict("Bu sayfa dolu");
            }
            case "FEATURED" -> onPage.forEach(old -> jdbc.update("DELETE FROM page_item WHERE id = ?", old.id())); // old photo goes to the tray
            default -> { }
        }
        UUID id = jdbc.queryForObject("INSERT INTO page_item (page_id, space_id, kind, media_id) VALUES (?, ?, 'MEDIA', ?) RETURNING id",
                UUID.class, page.id(), spaceId, mediaId);
        attach(id, page, "FEATURED".equals(page.template()) ? Integer.valueOf(0) : slotIndex, g);
        compact(page.id());
        bump(page.id());
        return build(spaceId, page.albumId());
    }

    /** A sticker is a free layer on top of the page, whatever its template; at most 20 per page. */
    private PagesView createSticker(CurrentUser me, UUID pageId, Geometry g, String variant) {
        if (variant == null || !VARIANT.matcher(variant).matches()) throw ApiException.badRequest("Geçersiz çıkartma");
        if (g == null || g.x() == null || g.y() == null) throw ApiException.badRequest("Çıkartmanın konumu gerekli");
        checkGeometry(g);
        PageRow page = lockedPage(me, pageId);
        Integer count = jdbc.queryForObject("SELECT count(*) FROM page_item WHERE page_id = ? AND kind = 'STICKER'", Integer.class, page.id());
        if (count != null && count >= MAX_STICKERS) throw ApiException.badRequest("Bir sayfaya en fazla " + MAX_STICKERS + " çıkartma eklenebilir");
        Integer maxZ = jdbc.queryForObject("SELECT max(z_index) FROM page_item WHERE page_id = ? AND kind = 'STICKER'", Integer.class, page.id());
        int z = g.zIndex() != null ? g.zIndex() : (maxZ == null ? 1000 : maxZ + 1);
        jdbc.update("INSERT INTO page_item (page_id, space_id, kind, x, y, width, rotation, z_index, variant) VALUES (?, ?, 'STICKER', ?, ?, ?, ?, ?, ?)",
                page.id(), page.spaceId(), g.x(), g.y(), g.width() == null ? 140.0 : g.width(), g.rotation() == null ? 0.0 : g.rotation(), z, variant);
        bump(page.id());
        return build(page.spaceId(), page.albumId());
    }

    @Transactional
    public PagesView moveItem(CurrentUser me, UUID itemId, UUID targetPageId, Integer slotIndex, Integer version, Geometry g) {
        ItemCtx ctx = lockedItem(me, itemId);
        Item item = ctx.item();
        PageRow src = ctx.page();
        if (!"MEDIA".equals(item.kind())) throw ApiException.badRequest("Bu öğe taşınamaz");
        if (version != null && version != item.version()) {
            throw ApiException.conflict("Öğe başka bir yerde değişti").with("current", pageView(src.id()));
        }
        PageRow dst = findPage(src.spaceId(), targetPageId).orElseThrow(() -> ApiException.notFound("Sayfa bulunamadı"));
        if (!dst.albumId().equals(src.albumId())) throw ApiException.notFound("Sayfa bulunamadı");
        if (g != null) checkGeometry(g);

        if (src.id().equals(dst.id())) {
            if ("FREE".equals(src.template())) throw ApiException.badRequest("Serbest sayfada konumu değiştirmek için öğeyi güncelleyin");
            List<UUID> order = new ArrayList<>(mediaItems(src).stream().map(Item::id).toList());
            order.remove(item.id());
            int at = slotIndex == null ? order.size() : Math.max(0, Math.min(slotIndex, order.size()));
            order.add(at, item.id());
            for (int i = 0; i < order.size(); i++) {
                jdbc.update("UPDATE page_item SET slot_index = ?, version = version + 1 WHERE id = ? AND slot_index IS DISTINCT FROM ?", i, order.get(i), i);
            }
            bump(src.id());
            return build(src.spaceId(), src.albumId());
        }

        List<Item> dstMedia = mediaItems(dst);
        Geometry oldGeometry = geometryOf(item);
        Integer oldSlot = item.slotIndex();
        Item swapped = null;
        switch (dst.template()) {
            case "AUTO" -> {
                if (dstMedia.size() >= MAX_AUTO) throw ApiException.conflict("Bu sayfa dolu");
            }
            case "FEATURED" -> swapped = dstMedia.isEmpty() ? null : dstMedia.get(0);
            default -> { }
        }
        if (swapped != null) attach(swapped.id(), src, oldSlot, oldGeometry); // the single photo of the target takes our place
        attach(item.id(), dst, "FEATURED".equals(dst.template()) ? Integer.valueOf(0) : slotIndex, g);
        compact(src.id());
        compact(dst.id());
        bump(src.id());
        bump(dst.id());
        return build(src.spaceId(), src.albumId());
    }

    @Transactional
    public PagesView deleteItem(CurrentUser me, UUID itemId, Integer version) {
        ItemCtx ctx = lockedItem(me, itemId);
        if (version != null && version != ctx.item().version()) {
            throw ApiException.conflict("Öğe başka bir yerde değişti").with("current", pageView(ctx.page().id()));
        }
        jdbc.update("DELETE FROM page_item WHERE id = ?", itemId);
        compact(ctx.page().id());
        bump(ctx.page().id());
        return build(ctx.page().spaceId(), ctx.page().albumId());
    }

    // ------------------------------------------------------------------ media-driven changes

    /** "Öne çıkar": the media gets a FEATURED page of its own right behind the page it was on (or at the end, from the tray). */
    @Transactional
    public PagesView feature(CurrentUser me, UUID mediaId) {
        UUID spaceId = me.requireSpace();
        List<UUID> albums = jdbc.query("SELECT album_id FROM media WHERE id = ? AND space_id = ? AND deleted_at IS NULL AND status IN " + LISTED,
                (rs, i) -> rs.getObject(1, UUID.class), mediaId, spaceId);
        if (albums.isEmpty()) throw ApiException.notFound("Medya bulunamadı");
        UUID albumId = albums.get(0);
        requireAlbum(spaceId, albumId, true);

        List<UUID> itemIds = jdbc.query("SELECT id FROM page_item WHERE media_id = ?", (rs, i) -> rs.getObject(1, UUID.class), mediaId);
        if (itemIds.isEmpty()) {
            if (pageCount(albumId) == 0) throw ApiException.conflict("Albümün sayfaları henüz oluşturulmadı");
            UUID page = insertPage(spaceId, albumId, pageCount(albumId), "FEATURED");
            insertMedia(spaceId, page, mediaId, 0);
            return build(spaceId, albumId);
        }
        UUID itemId = itemIds.get(0);
        UUID srcId = jdbc.queryForObject("SELECT page_id FROM page_item WHERE id = ?", UUID.class, itemId);
        PageRow src = findPage(spaceId, srcId).orElseThrow();
        if ("FEATURED".equals(src.template()) && mediaItems(src).size() == 1) return build(spaceId, albumId);

        shiftPages(albumId, src.index() + 1, 1);
        UUID featured = insertPage(spaceId, albumId, src.index() + 1, "FEATURED");
        PageRow dst = findPage(spaceId, featured).orElseThrow();
        attach(itemId, dst, 0, null);
        compact(src.id());
        bump(src.id());
        Integer left = jdbc.queryForObject("SELECT count(*) FROM page_item WHERE page_id = ?", Integer.class, src.id());
        if (left != null && left == 0) { // nothing left on the old page: do not leave an empty page behind
            jdbc.update("DELETE FROM page WHERE id = ?", src.id());
            jdbc.update("UPDATE page SET page_index = page_index - 1 WHERE album_id = ? AND page_index > ?", albumId, src.index());
        }
        return build(spaceId, albumId);
    }

    /** Called when an upload completes. Albums that have no pages yet are left alone (the first open initializes them). */
    @Transactional
    public void autoPlace(UUID spaceId, UUID albumId, UUID mediaId, boolean featured) {
        List<UUID> locked = jdbc.query("SELECT id FROM album WHERE id = ? AND space_id = ? AND deleted_at IS NULL FOR UPDATE",
                (rs, i) -> rs.getObject(1, UUID.class), albumId, spaceId);
        if (locked.isEmpty()) return;
        Integer placed = jdbc.queryForObject("SELECT count(*) FROM page_item WHERE media_id = ?", Integer.class, mediaId);
        if (placed != null && placed > 0) return;
        int count = pageCount(albumId);
        if (count == 0) return;

        PageRow last = jdbc.query("SELECT id, album_id, space_id, page_index, template, version FROM page WHERE album_id = ? ORDER BY page_index DESC LIMIT 1",
                (rs, i) -> pageRow(rs), albumId).get(0);
        int inLast = mediaItems(last).size();
        if (!featured && "AUTO".equals(last.template()) && inLast < MAX_AUTO) {
            insertMedia(spaceId, last.id(), mediaId, inLast);
            bump(last.id());
        } else {
            UUID page = insertPage(spaceId, albumId, count, featured ? "FEATURED" : "AUTO");
            insertMedia(spaceId, page, mediaId, 0);
        }
    }

    /** Called when media is soft-deleted: it leaves its page. */
    @Transactional
    public void removeMedia(UUID spaceId, UUID mediaId) {
        List<UUID> pages = jdbc.query("SELECT i.page_id FROM page_item i WHERE i.media_id = ? AND i.space_id = ?",
                (rs, i) -> rs.getObject(1, UUID.class), mediaId, spaceId);
        if (pages.isEmpty()) return;
        UUID albumId = jdbc.queryForObject("SELECT album_id FROM page WHERE id = ?", UUID.class, pages.get(0));
        jdbc.query("SELECT id FROM album WHERE id = ? FOR UPDATE", rs -> { }, albumId);
        jdbc.update("DELETE FROM page_item WHERE media_id = ?", mediaId);
        compact(pages.get(0));
        bump(pages.get(0));
    }
}
