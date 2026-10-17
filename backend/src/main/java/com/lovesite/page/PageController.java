package com.lovesite.page;

import com.lovesite.page.PageService.Geometry;
import com.lovesite.page.PageService.InitPage;
import com.lovesite.page.PageService.Item;
import com.lovesite.page.PageService.ItemGeometry;
import com.lovesite.page.PageService.PagesView;
import com.lovesite.user.CurrentUser;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.UUID;

@RestController
public class PageController {

    public record InitializeRequest(List<InitPage> pages) {
    }

    public record CreatePageRequest(Integer afterPageIndex, String template) {
    }

    public record ReorderRequest(List<UUID> pageIds) {
    }

    public record PatchPageRequest(String template, Integer version, List<ItemGeometry> items, String swatch, String paper) {
    }

    public record PatchItemRequest(Double x, Double y, Double width, Double rotation, Integer zIndex, Integer version) {
    }

    public record MoveRequest(UUID targetPageId, Integer slotIndex, Integer version, Double x, Double y, Double width, Double rotation, Integer zIndex) {
    }

    public record CreateItemRequest(UUID pageId, UUID mediaId, String kind, Integer slotIndex, Double x, Double y, Double width,
                                    Double rotation, Integer zIndex, String variant) {
    }

    private final PageService pages;

    public PageController(PageService pages) {
        this.pages = pages;
    }

    @GetMapping("/api/albums/{albumId}/pages")
    public PagesView list(CurrentUser me, @PathVariable UUID albumId) {
        return pages.view(me, albumId);
    }

    @PostMapping("/api/albums/{albumId}/pages/initialize")
    public PagesView initialize(CurrentUser me, @PathVariable UUID albumId, @RequestBody InitializeRequest request) {
        return pages.initialize(me, albumId, request.pages());
    }

    @PostMapping("/api/albums/{albumId}/pages")
    @ResponseStatus(HttpStatus.CREATED)
    public PagesView create(CurrentUser me, @PathVariable UUID albumId, @RequestBody CreatePageRequest request) {
        return pages.createPage(me, albumId, request.afterPageIndex() == null ? -1 : request.afterPageIndex(), request.template());
    }

    @PostMapping("/api/albums/{albumId}/pages/reorder")
    public PagesView reorder(CurrentUser me, @PathVariable UUID albumId, @RequestBody ReorderRequest request) {
        return pages.reorder(me, albumId, request.pageIds());
    }

    @PatchMapping("/api/pages/{id}")
    public PagesView patchPage(CurrentUser me, @PathVariable UUID id, @RequestBody PatchPageRequest request) {
        return pages.patchPage(me, id, request.template(), request.version(), request.items(), request.swatch(), request.paper());
    }

    @DeleteMapping("/api/pages/{id}")
    public PagesView deletePage(CurrentUser me, @PathVariable UUID id, @RequestParam(required = false) Integer version) {
        return pages.deletePage(me, id, version);
    }

    @PatchMapping("/api/page-items/{id}")
    public Item patchItem(CurrentUser me, @PathVariable UUID id, @RequestBody PatchItemRequest request) {
        return pages.patchItem(me, id, new Geometry(request.x(), request.y(), request.width(), request.rotation(), request.zIndex()),
                request.version());
    }

    @PostMapping("/api/page-items/{id}/move")
    public PagesView move(CurrentUser me, @PathVariable UUID id, @RequestBody MoveRequest request) {
        return pages.moveItem(me, id, request.targetPageId(), request.slotIndex(), request.version(),
                new Geometry(request.x(), request.y(), request.width(), request.rotation(), request.zIndex()));
    }

    @PostMapping("/api/page-items")
    @ResponseStatus(HttpStatus.CREATED)
    public PagesView createItem(CurrentUser me, @RequestBody CreateItemRequest request) {
        return pages.createItem(me, request.pageId(), request.mediaId(), request.kind(), request.slotIndex(),
                new Geometry(request.x(), request.y(), request.width(), request.rotation(), request.zIndex()), request.variant());
    }

    @DeleteMapping("/api/page-items/{id}")
    public PagesView deleteItem(CurrentUser me, @PathVariable UUID id, @RequestParam(required = false) Integer version) {
        return pages.deleteItem(me, id, version);
    }

    @PostMapping("/api/media/{id}/feature")
    public PagesView feature(CurrentUser me, @PathVariable UUID id) {
        return pages.feature(me, id);
    }
}
