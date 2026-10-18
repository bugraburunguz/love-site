"""
Phase 7 checks against the production image (web + worker): exports in every format, their technical properties (image
headers, ffprobe), the visual comparison with the site, emoji / long Turkish captions, a spread with two page themes, the
role split and the site's responsiveness while an export renders.

Run on its own (it creates its own space and user through the admin):  python exports.py
smoke.py runs it too, after the main journey.
"""
import io
import json
import os
import statistics
import subprocess
import time
import urllib.error
import urllib.request
import uuid
import zipfile
from pathlib import Path

from PIL import Image, ImageChops, ImageStat
from playwright.sync_api import BrowserContext, Page, expect

BASE = os.environ.get("BASE_URL", "http://localhost:18081").rstrip("/")
WORKER = os.environ.get("WORKER_URL", "http://worker:8080").rstrip("/")
OUT = Path(os.environ.get("OUTPUT_DIR", "output")) / "exports"
# emoji in the visible lines, then far more text than two lines hold (it must be clamped, never spill out of the strip)
CAPTION = "Çay bahçesi 😍🌹 İstanbul'da şişli bir öğleden sonra güldüğümüz o gün 🎉 hiç bitmesin istedik, ğüşıöç İĞÜŞÖÇ çok uzun bir yazı"

# visual comparison: mean absolute difference per channel (0-255) after scaling both images to the same size
POLAROID_THRESHOLD = 12.0
STORY_THRESHOLD = 22.0

report: dict = {"timings": {}, "visual": {}, "formats": {}, "latency": {}, "notes": []}


def step(text: str) -> None:
    print(f"==> [exports] {text}", flush=True)


def ffmpeg(*args: str) -> None:
    subprocess.run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", *args], check=True)


def ffprobe(path: Path) -> dict:
    out = subprocess.run(["ffprobe", "-v", "error", "-print_format", "json", "-show_format", "-show_streams", str(path)],
                         check=True, capture_output=True, text=True).stdout
    return json.loads(out)


def xsrf(ctx: BrowserContext) -> str:
    for c in ctx.cookies():
        if c["name"] == "XSRF-TOKEN":
            return urllib.parse.unquote(c["value"])
    ctx.request.get(BASE + "/api/auth/me")
    return xsrf(ctx)


import urllib.parse  # noqa: E402  (used by xsrf)


def send(ctx: BrowserContext, method: str, path: str, body=None):
    headers = {"X-XSRF-TOKEN": xsrf(ctx), "Content-Type": "application/json"}
    data = json.dumps(body) if body is not None else None
    return ctx.request.fetch(BASE + path, method=method, headers=headers, data=data)


def api_json(ctx: BrowserContext, method: str, path: str, body=None, ok=(200, 201, 202)):
    r = send(ctx, method, path, body)
    assert r.status in ok, f"{method} {path} -> {r.status}: {r.text()[:300]}"
    return r.json() if r.text() else None


def wait_until(check, what: str, timeout: float = 300, every: float = 2):
    deadline = time.time() + timeout
    while time.time() < deadline:
        result = check()
        if result:
            return result
        time.sleep(every)
    raise AssertionError(f"timed out waiting for {what}")


def make_media(folder: Path) -> dict:
    folder.mkdir(parents=True, exist_ok=True)
    files = {
        "landscape": folder / "landscape.jpg",
        "portrait": folder / "portrait.jpg",
        "clip": folder / "clip.mp4",
        "song": folder / "song.mp3",
    }
    ffmpeg("-f", "lavfi", "-i", "testsrc2=size=1280x960", "-frames:v", "1", str(files["landscape"]))
    ffmpeg("-f", "lavfi", "-i", "smptehdbars=size=960x1280", "-frames:v", "1", str(files["portrait"]))
    ffmpeg("-f", "lavfi", "-i", "testsrc2=size=640x360:rate=24:duration=3", "-c:v", "libx264", "-pix_fmt", "yuv420p", str(files["clip"]))
    ffmpeg("-f", "lavfi", "-i", "sine=frequency=330:duration=4", "-c:a", "libmp3lame", str(files["song"]))
    return files


def upload(page: Page, ctx: BrowserContext, album_id: str, files: list[Path]) -> list[dict]:
    page.goto(f"/albums/{album_id}")
    page.locator('input[type="file"][accept="image/*,video/*"]').set_input_files([str(f) for f in files])
    page.get_by_role("dialog", name="Yüklenecek dosyalar").get_by_role("button", name="Yükle").click()

    def ready():
        items = ctx.request.get(f"{BASE}/api/albums/{album_id}/media").json()
        states = {i["status"] for i in items}
        assert "FAILED" not in states, items
        return items if len(items) >= len(files) and states == {"READY"} else None

    items = wait_until(ready, "uploads to become READY")
    page.reload()  # the first open with media lays out the pages
    wait_until(lambda: ctx.request.get(f"{BASE}/api/albums/{album_id}/pages").json()["pages"], "pages", 30, 1)
    return items


def export(ctx: BrowserContext, type_: str, params: dict, label: str, timeout: float = 600) -> dict:
    started = time.time()
    job = api_json(ctx, "POST", "/api/exports", {"type": type_, "params": params})

    def done():
        j = ctx.request.get(f"{BASE}/api/exports/{job['id']}").json()
        assert j["status"] != "FAILED", f"{label} failed: {j}"
        return j if j["status"] == "READY" else None

    j = wait_until(done, f"export {label}", timeout, 2)
    report["timings"][label] = round(time.time() - started, 1)
    return j


def fetch(ctx: BrowserContext, f: dict, name: str | None = None) -> Path:
    r = ctx.request.get(f["url"])
    assert r.status == 200, f"download {f['name']}: {r.status}"
    assert "attachment" in (r.headers.get("content-disposition") or ""), r.headers
    path = OUT / (name or f["name"])
    path.write_bytes(r.body())
    return path


def mean_diff(a: Image.Image, b: Image.Image) -> float:
    a = a.convert("RGB")
    b = b.convert("RGB").resize(a.size, Image.LANCZOS)
    return sum(ImageStat.Stat(ImageChops.difference(a, b)).mean) / 3


def coloured_pixels(img: Image.Image) -> int:
    rgb = img.convert("RGB")
    hsv = rgb.convert("HSV")
    return sum(1 for (h, s, v) in hsv.getdata() if s > 110 and v > 90)


def frame_at(video: Path, seconds: float) -> Image.Image:
    out = video.with_suffix(f".{seconds:.0f}s.png")
    ffmpeg("-ss", str(seconds), "-i", str(video), "-frames:v", "1", str(out))
    return Image.open(out)


def moving_picture_visible(video: Path, seconds: float, min_share: float) -> float:
    """The test clip (testsrc2) is very colourful, paper and frame are not: the share of strongly coloured pixels in a frame
    tells whether the video really shows through its window."""
    img = frame_at(video, seconds)
    img.thumbnail((360, 640))
    share = coloured_pixels(img) / (img.width * img.height)
    assert share >= min_share, f"{video.name} at {seconds}s: only {share:.1%} coloured pixels, the video is not visible"
    return share


def check_png_polaroid(path: Path) -> Image.Image:
    img = Image.open(path)
    assert img.format == "PNG", img.format
    assert img.mode == "RGBA", f"polaroid PNG has no alpha channel ({img.mode})"
    assert max(img.size) == 2000, f"long edge {img.size}"
    assert img.getpixel((0, 0))[3] == 0 and img.getpixel((img.width - 1, img.height - 1))[3] == 0, "corners are not transparent"
    return img


def site_polaroid(page: Page, album_id: str, media_id: str, label: str) -> Image.Image:
    """The same polaroid on the site: a FREE page, frame width 880, not rotated, screenshot of the frame only."""
    page.goto(f"/albums/{album_id}")
    fig = page.locator(".page .polaroid__tilt").first
    expect(fig).to_be_visible()
    page.wait_for_timeout(1500)
    page.evaluate("document.fonts.ready")
    shot = OUT / f"site-{label}.png"
    fig.screenshot(path=str(shot), animations="disabled")
    return Image.open(shot)


def make_free(ctx: BrowserContext, album_id: str) -> tuple[str, str]:
    view = ctx.request.get(f"{BASE}/api/albums/{album_id}/pages").json()
    page = view["pages"][0]
    item = [i for i in page["items"] if i["kind"] == "MEDIA"][0]
    api_json(ctx, "PATCH", f"/api/pages/{page['id']}", {"template": "FREE", "version": page["version"],
                                                       "items": [{"id": item["id"], "x": 500, "y": 640, "width": 880, "rotation": 0, "zIndex": 10}]})
    return page["id"], item["mediaId"]


def unrotate(img: Image.Image, p: dict) -> Image.Image:
    """Cuts the polaroid out of a story image: rotate back around its centre, then crop its rectangle."""
    cx, cy, w, h, rot = p["x"], p["y"], p["width"], p["height"], p["rotation"]
    r = int(max(w, h))
    box = img.convert("RGB").crop((int(cx - r), int(cy - r), int(cx + r), int(cy + r)))
    back = box.rotate(rot, resample=Image.BICUBIC)  # PIL turns counter-clockwise, CSS turned clockwise
    return back.crop((int(r - w / 2), int(r - h / 2), int(r + w / 2), int(r + h / 2)))


def run(browser, ctx: BrowserContext, page: Page, media_dir: Path) -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    theme_albums = []
    for theme in ("romantik", "buyulu", "arkadaslar", "seyahat", "yilbasi", "cadilar-bayrami"):
        a = api_json(ctx, "POST", "/api/albums", {"title": f"Tema {theme}", "themeId": theme})
        theme_albums.append((a["title"], a["id"]))
    files = make_media(media_dir)

    step("role split: the worker only answers the health check, its render port is not reachable")
    for path, want in (("/actuator/health/liveness", 200), ("/api/auth/me", 404), ("/api/albums", 404), ("/", 404)):
        try:
            code = urllib.request.urlopen(WORKER + path, timeout=5).status
        except urllib.error.HTTPError as e:
            code = e.code
        assert code == want, f"worker {path} -> {code}, expected {want}"
    try:
        urllib.request.urlopen(WORKER.replace(":8080", ":8099") + "/render/x", timeout=5)
        raise AssertionError("the worker's render port is reachable from outside the container")
    except urllib.error.URLError as e:
        assert not isinstance(e, urllib.error.HTTPError), "render port answered over the network"
    assert ctx.request.get(f"{BASE}/internal/render/{uuid.uuid4()}?token=x").status == 404
    assert ctx.request.get(f"{BASE}/render/{uuid.uuid4()}").status == 404

    step("an album for the exports: two photos and a video")
    album = api_json(ctx, "POST", "/api/albums", {"title": "Dışa aktarma ğüşİ", "themeId": "romantik"})
    album_id = album["id"]
    items = upload(page, ctx, album_id, [files["landscape"], files["portrait"], files["clip"]])
    by_name = {i["originalFilename"]: i for i in items}
    land, port, clip = by_name["landscape.jpg"], by_name["portrait.jpg"], by_name["clip.mp4"]
    api_json(ctx, "PATCH", f"/api/media/{land['id']}", {"caption": CAPTION})

    step("a spread with two page themes: paper and ambient stay inside each page")
    view = ctx.request.get(f"{BASE}/api/albums/{album_id}/pages").json()
    assert len(view["pages"]) >= 2, view
    second = view["pages"][1]
    api_json(ctx, "PATCH", f"/api/pages/{second['id']}", {"version": second["version"], "themeId": "buyulu"})
    page.set_viewport_size({"width": 1600, "height": 1000})
    page.goto(f"/albums/{album_id}")
    expect(page.locator(".page").nth(1)).to_be_visible()
    page.wait_for_timeout(2500)
    info = page.evaluate("""() => [...document.querySelectorAll('.book__half > .page')].map(p => {
        const r = p.getBoundingClientRect(); const c = p.querySelector('canvas.page__ambient');
        const cr = c ? c.getBoundingClientRect() : null;
        return { theme: p.dataset.pageTheme, overflow: getComputedStyle(p).overflow, page: [r.left, r.top, r.right, r.bottom],
                 canvas: cr ? [cr.left, cr.top, cr.right, cr.bottom] : null, bg: getComputedStyle(p).backgroundColor }
    })""")
    assert len(info) == 2 and info[0]["theme"] != info[1]["theme"], info
    for p in info:
        assert p["overflow"] == "hidden", p
        assert p["canvas"], f"no ambient canvas on the {p['theme']} page"
        c, r = p["canvas"], p["page"]
        assert c[0] >= r[0] - 0.5 and c[1] >= r[1] - 0.5 and c[2] <= r[2] + 0.5 and c[3] <= r[3] + 0.5, f"ambient canvas leaves its page: {p}"
    page.screenshot(path=str(OUT / "spread-two-themes.png"))
    report["notes"].append(f"mixed spread: {info[0]['theme']} | {info[1]['theme']}, one ambient canvas per page, clipped")

    step("POLAROID transparent PNG (emoji + long Turkish caption)")
    j = export(ctx, "POLAROID", {"mediaId": land["id"], "background": "transparent"}, "POLAROID png")
    png = check_png_polaroid(fetch(ctx, j["files"][0]))
    assert j["meta"] and j["meta"][0]["overflow"] is False, j["meta"]
    frame = png.crop(png.getchannel("A").point(lambda a: 255 if a > 250 else 0).getbbox())
    strip = frame.crop((0, int(frame.height * 0.8), frame.width, frame.height))
    emoji = coloured_pixels(strip)
    assert emoji > 300, f"the caption strip has only {emoji} coloured pixels: emoji not in colour?"
    report["formats"]["POLAROID png"] = f"{png.size} RGBA, {emoji} coloured caption pixels"
    again = api_json(ctx, "POST", "/api/exports", {"type": "POLAROID", "params": {"mediaId": land["id"], "background": "transparent"}})
    assert again["id"] == j["id"] and again["status"] == "READY", "same content was rendered again"

    step("POLAROID on the page (JPEG) and moving polaroid (MP4)")
    j = export(ctx, "POLAROID", {"mediaId": land["id"], "background": "page"}, "POLAROID jpg")
    jpg = Image.open(fetch(ctx, j["files"][0]))
    assert jpg.format == "JPEG" and max(jpg.size) == 2000, (jpg.format, jpg.size)
    j = export(ctx, "POLAROID", {"mediaId": clip["id"], "motion": True}, "POLAROID mp4")
    pol_mp4 = fetch(ctx, j["files"][0])
    probe = ffprobe(pol_mp4)
    report["formats"]["POLAROID mp4 video share"] = round(moving_picture_visible(pol_mp4, 2, 0.25), 3)
    v = [s for s in probe["streams"] if s["codec_type"] == "video"][0]
    assert v["codec_name"] == "h264" and not [s for s in probe["streams"] if s["codec_type"] == "audio"], probe
    assert max(v["width"], v["height"]) == 1080, (v["width"], v["height"])
    assert 7.5 <= float(probe["format"]["duration"]) <= 8.5, probe["format"]["duration"]
    report["formats"]["POLAROID mp4"] = f"{v['width']}x{v['height']} h264 {float(probe['format']['duration']):.1f}s silent"

    step("STORY / POST")
    j = export(ctx, "STORY", {"mediaId": land["id"]}, "STORY jpg")
    story = Image.open(fetch(ctx, j["files"][0]))
    assert story.size == (1080, 1920), story.size
    j = export(ctx, "STORY", {"mediaId": clip["id"]}, "STORY mp4")
    story_mp4 = fetch(ctx, j["files"][0])
    report["formats"]["STORY mp4 video share"] = round(moving_picture_visible(story_mp4, 4, 0.08), 3)
    probe = ffprobe(story_mp4)
    v = [s for s in probe["streams"] if s["codec_type"] == "video"][0]
    assert (v["width"], v["height"]) == (1080, 1920) and 9.5 <= float(probe["format"]["duration"]) <= 10.5, (v, probe["format"])
    j = export(ctx, "POST", {"mediaId": port["id"]}, "POST jpg")
    post = Image.open(fetch(ctx, j["files"][0]))
    assert post.size == (1080, 1350), post.size
    report["formats"]["STORY/POST"] = "1080x1920 jpg, 1080x1920 mp4 10s, 1080x1350 jpg"

    step("CAROUSEL (cover + pages)")
    page_ids = [p["id"] for p in ctx.request.get(f"{BASE}/api/albums/{album_id}/pages").json()["pages"]]
    j = export(ctx, "CAROUSEL", {"albumId": album_id, "pageIds": page_ids, "includeCover": True}, "CAROUSEL")
    images = [f for f in j["files"] if f["role"] == "main"]
    assert len(images) == len(page_ids) + 1, j["files"]
    for n, f in enumerate(images):
        img = Image.open(fetch(ctx, f))
        assert img.size == (1080, 1350), (f["name"], img.size)
    report["formats"]["CAROUSEL"] = f"{len(images)} x 1080x1350 jpg + zip"

    step("REELS silent, then with the album song")
    j = export(ctx, "REELS", {"albumId": album_id, "mediaIds": [land["id"], clip["id"], port["id"]], "includeCover": True}, "REELS 3")
    reels_file = fetch(ctx, j["files"][0], "reels-silent.mp4")
    # cover 1.5 s, photo 2.5 s, then the video scene: its middle is at about 4.5 s
    report["formats"]["REELS video scene share"] = round(moving_picture_visible(reels_file, 4.6, 0.08), 3)
    probe = ffprobe(reels_file)
    v = [s for s in probe["streams"] if s["codec_type"] == "video"][0]
    assert (v["width"], v["height"]) == (1080, 1920) and v["codec_name"] == "h264", v
    assert eval(v["r_frame_rate"]) == 30, v["r_frame_rate"]
    assert float(probe["format"]["duration"]) <= 90
    assert not [s for s in probe["streams"] if s["codec_type"] == "audio"], "default reels has an audio stream"
    reels_len = float(probe["format"]["duration"])
    page.goto(f"/albums/{album_id}")
    page.get_by_role("button", name="Albüm ayarları").click()
    settings = page.get_by_role("dialog", name="Albüm ayarları")
    settings.locator('input[type="file"]').set_input_files(str(files["song"]))
    expect(settings.get_by_role("button", name="Müziği değiştir")).to_be_visible()
    settings.get_by_role("button", name="Kapat").click()
    j = export(ctx, "REELS", {"albumId": album_id, "mediaIds": [land["id"], clip["id"], port["id"]], "includeCover": True, "includeAlbumMusic": True}, "REELS music")
    probe = ffprobe(fetch(ctx, j["files"][0], "reels-music.mp4"))
    assert [s for s in probe["streams"] if s["codec_type"] == "audio"], "includeAlbumMusic gave no audio stream"
    report["formats"]["REELS"] = f"1080x1920 h264 30fps {reels_len:.1f}s (3 media + cover + closing), silent; with music: aac"

    step("REELS of 10 photos (timing)")
    ten = [Path(media_dir / f"p{i}.jpg") for i in range(10)]
    for i, f in enumerate(ten):
        ffmpeg("-f", "lavfi", "-i", f"testsrc2=size=1200x900", "-vf", f"hue=h={i * 36}", "-frames:v", "1", str(f))
    album10 = api_json(ctx, "POST", "/api/albums", {"title": "On fotoğraf", "themeId": "seyahat"})["id"]
    up10 = upload(page, ctx, album10, ten)
    j = export(ctx, "REELS", {"albumId": album10, "includeCover": True}, "REELS 10 photos", timeout=900)
    probe = ffprobe(fetch(ctx, j["files"][0], "reels-10.mp4"))
    report["formats"]["REELS 10"] = f"{float(probe['format']['duration']):.1f}s for {len(up10)} photos"

    step("STICKER_PACK (animated)")
    j = export(ctx, "STICKER_PACK", {"mediaIds": [land["id"], port["id"], clip["id"]], "animated": True}, "STICKER_PACK")
    zpath = fetch(ctx, [f for f in j["files"] if f["role"] == "zip"][0])
    with zipfile.ZipFile(zpath) as z:
        names = z.namelist()
        stickers = [n for n in names if n.startswith("stickers/") and n.endswith(".webp")]
        assert 3 <= len(stickers) <= 30 and "tray.png" in names and "OKU.txt" in names, names
        sizes = []
        for n in stickers:
            data = z.read(n)
            img = Image.open(io.BytesIO(data))
            animated = getattr(img, "is_animated", False)
            assert img.size == (512, 512), (n, img.size)
            assert len(data) <= (500 if animated else 100) * 1024, (n, len(data), animated)
            sizes.append(f"{n.split('/')[-1]}:{len(data) // 1024}KB{' anim' if animated else ''}")
            if n.endswith("03.webp"):  # the video
                assert animated and img.n_frames >= 10, f"the video sticker is not animated ({img.n_frames} frame(s))"
                img.seek(img.n_frames // 3)
                share = coloured_pixels(img.convert("RGBA")) / (512 * 512)
                assert share > 0.08, f"animated sticker frame shows no video ({share:.1%})"
        tray = z.read("tray.png")
        assert Image.open(io.BytesIO(tray)).size == (96, 96) and len(tray) <= 50 * 1024
    report["formats"]["STICKER_PACK"] = ", ".join(sizes) + f", tray {len(tray) // 1024}KB; notes: {j['notes']}"

    step("visual comparison with the site, every theme")
    for title, theme_album in theme_albums:
        up = upload(page, ctx, theme_album, [files["landscape"]])
        mid = up[0]["id"]
        api_json(ctx, "PATCH", f"/api/media/{mid}", {"caption": "Bir yaz akşamı 🌅"})
        make_free(ctx, theme_album)
        theme_id = [a for a in ctx.request.get(BASE + "/api/albums").json() if a["id"] == theme_album][0]["themeId"]
        site = site_polaroid(page, theme_album, mid, theme_id)
        j = export(ctx, "POLAROID", {"mediaId": mid, "background": "transparent", "watermark": False}, f"POLAROID {theme_id}")
        png = Image.open(fetch(ctx, j["files"][0], f"polaroid-{theme_id}.png"))
        frame = png.crop(png.getchannel("A").point(lambda a: 255 if a > 250 else 0).getbbox())
        flat = Image.new("RGB", frame.size, (255, 255, 255))
        flat.paste(frame, mask=frame.getchannel("A"))
        d_pol = mean_diff(site, flat)
        j = export(ctx, "STORY", {"mediaId": mid, "watermark": False}, f"STORY {theme_id}")
        story = Image.open(fetch(ctx, j["files"][0], f"story-{theme_id}.jpg"))
        cut = unrotate(story, j["meta"][0]["polaroid"])
        cut.save(OUT / f"story-cut-{theme_id}.png")
        # the top band can carry the theme's tape in the story; compare below it
        h = site.height
        d_story = mean_diff(site.crop((0, int(h * 0.1), site.width, h)), cut.crop((0, int(cut.height * 0.1), cut.width, cut.height)))
        report["visual"][theme_id] = {"polaroid": round(d_pol, 2), "story": round(d_story, 2)}
        assert d_pol <= POLAROID_THRESHOLD, f"{theme_id}: polaroid differs from the site by {d_pol:.1f}"
        assert d_story <= STORY_THRESHOLD, f"{theme_id}: story polaroid differs from the site by {d_story:.1f}"

    step("lightbox menu and share dialog (desktop)")
    page.set_viewport_size({"width": 1280, "height": 900})
    page.goto(f"/albums/{album_id}")
    for close in page.get_by_role("button", name="Kartı kapat").all():
        close.click()
    page.locator(".page .polaroid").first.click()
    page.get_by_role("button", name="Diğer işlemler").click()
    page.screenshot(path=str(OUT / "lightbox-menu.png"))
    page.get_by_role("menuitem", name="Instagram gönderisi").click()
    card = page.locator(".export-card", has_text="Instagram gönderisi").first
    expect(card).to_be_visible()
    expect(card.get_by_text("Hazır", exact=True)).to_be_visible(timeout=300_000)
    expect(card.get_by_role("button", name="İndir")).to_be_visible()
    page.screenshot(path=str(OUT / "export-card-desktop.png"))
    page.get_by_role("button", name="Paylaş").first.click()
    dialog = page.get_by_role("dialog", name="Paylaş")
    expect(dialog.get_by_text("Son 24 saat")).to_be_visible()
    page.screenshot(path=str(OUT / "share-dialog.png"))
    dialog.get_by_role("button", name="Reels oluştur").click()
    dialog = page.get_by_role("dialog", name="Reels oluştur")
    dialog.get_by_label("Albüm müziğini ekle").check()
    expect(dialog.get_by_text("Telifli müzik içeren videolar Instagram'da sessize alınabilir")).to_be_visible()
    page.screenshot(path=str(OUT / "reels-dialog.png"))
    dialog.get_by_role("button", name="Geri").click()
    page.get_by_role("dialog", name="Paylaş").get_by_role("button", name="WhatsApp sticker paketi").click()
    page.screenshot(path=str(OUT / "sticker-dialog.png"))
    page.keyboard.press("Escape")

    step("phone emulation: the export card on a touch screen")
    phone = browser.new_context(base_url=BASE, viewport={"width": 390, "height": 844}, is_mobile=True, has_touch=True,
                                storage_state=ctx.storage_state())
    m = phone.new_page()
    m.goto(f"/albums/{album_id}")
    expect(m.locator(".export-card").first).to_be_visible()
    can_share = m.evaluate("typeof navigator.canShare === 'function'")
    m.wait_for_timeout(1500)
    m.screenshot(path=str(OUT / "export-card-phone.png"))
    report["notes"].append(f"phone emulation (headless Chromium/Linux): navigator.canShare available = {can_share}")
    phone.close()

    step("the site stays fast while an export renders")
    def timed(n: int) -> list[float]:
        out = []
        for _ in range(n):
            t = time.time()
            assert ctx.request.get(f"{BASE}/api/albums/{album_id}/pages").status == 200
            out.append((time.time() - t) * 1000)
            time.sleep(0.1)
        return out
    idle = timed(20)
    api_json(ctx, "POST", "/api/exports", {"type": "REELS", "params": {"albumId": album10, "includeCover": False}})
    time.sleep(3)
    busy = timed(20)
    report["latency"] = {"idle_median_ms": round(statistics.median(idle), 1), "during_export_median_ms": round(statistics.median(busy), 1),
                         "during_export_max_ms": round(max(busy), 1)}
    assert statistics.median(busy) < max(250, statistics.median(idle) * 4), report["latency"]

    (OUT / "report.json").write_text(json.dumps(report, indent=2, ensure_ascii=False), encoding="utf-8")
    print(json.dumps(report, indent=2, ensure_ascii=False))


if __name__ == "__main__":
    import sys
    sys.path.insert(0, os.path.dirname(__file__))
    import smoke
    from playwright.sync_api import sync_playwright

    tag = uuid.uuid4().hex[:6]
    with sync_playwright() as p:
        browser = p.chromium.launch()
        admin_ctx, admin = smoke.new_user_context(browser, "admin")
        smoke.login(admin, smoke.ADMIN_EMAIL, smoke.ADMIN_PASSWORD)
        invite = smoke.create_space(admin, f"Export {tag}")
        ctx, page = smoke.new_user_context(browser, "exporter")
        smoke.register(page, invite, "Deniz", f"deniz-{tag}@e2e.test")
        run(browser, ctx, page, Path(os.environ.get("OUTPUT_DIR", "output")) / "media-exports")
        browser.close()
    if smoke.problems:
        print("PROBLEMS SEEN IN THE BROWSER:")
        for line in smoke.problems:
            print("  " + line)
        sys.exit(1)
    print("OK: exports")
