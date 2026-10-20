"""
Browser smoke test: the whole journey of a new couple against the production image.

  admin creates a space -> invitation link -> registration -> an album for each theme -> photo + video upload ->
  both become READY -> edit a page (FREE template, add a sticker) -> album music -> a user of ANOTHER space gets 404.

It also fails on any Content-Security-Policy violation or uncaught page error seen in the browser on the way.
Test media are generated with ffmpeg at the start; nothing personal is involved. Screenshots go to $OUTPUT_DIR.
"""
import json
import os
import subprocess
import sys
import time
import uuid
from pathlib import Path

from playwright.sync_api import BrowserContext, Page, expect, sync_playwright

BASE = os.environ.get("BASE_URL", "http://localhost:18081").rstrip("/")
ADMIN_EMAIL = os.environ.get("ADMIN_EMAIL", "admin@e2e.test")
ADMIN_PASSWORD = os.environ.get("ADMIN_PASSWORD", "e2e-admin-password")
OUT = Path(os.environ.get("OUTPUT_DIR", "output"))
PASSWORD = "e2e-user-password-1"

problems: list[str] = []


def step(text: str) -> None:
    print(f"==> {text}", flush=True)


def ffmpeg(*args: str) -> None:
    subprocess.run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", *args], check=True)


def make_media(folder: Path) -> tuple[Path, Path, Path]:
    folder.mkdir(parents=True, exist_ok=True)
    photo, video, song = folder / "photo.jpg", folder / "clip.mp4", folder / "song.mp3"
    ffmpeg("-f", "lavfi", "-i", "testsrc2=size=1280x960", "-frames:v", "1", str(photo))
    ffmpeg("-f", "lavfi", "-i", "testsrc2=size=640x360:rate=24:duration=2", "-c:v", "libx264", "-pix_fmt", "yuv420p", str(video))
    ffmpeg("-f", "lavfi", "-i", "sine=frequency=440:duration=2", "-c:a", "libmp3lame", str(song))
    return photo, video, song


def watch(page: Page, label: str) -> None:
    """Records CSP violations and uncaught errors of this page."""
    def on_console(msg):
        text = msg.text
        if "Content Security Policy" in text or "Refused to" in text:
            problems.append(f"[{label}] CSP: {text[:300]}")

    page.on("console", on_console)
    page.on("pageerror", lambda err: problems.append(f"[{label}] page error: {str(err)[:300]}"))


def new_user_context(browser, label: str) -> tuple[BrowserContext, Page]:
    ctx = browser.new_context(base_url=BASE, viewport={"width": 1280, "height": 900})
    ctx.set_default_timeout(60_000)
    page = ctx.new_page()
    watch(page, label)
    return ctx, page


def login(page: Page, email: str, password: str) -> None:
    page.goto("/login")
    page.get_by_label("E-posta").fill(email)
    page.get_by_label("Şifre").fill(password)
    page.get_by_role("button", name="Kapağı aç").click()
    page.wait_for_url(f"{BASE}/")


def create_space(page: Page, name: str) -> str:
    page.goto("/admin")
    page.get_by_label("Alan adı").fill(name)
    page.get_by_role("button", name="Alanı oluştur ve davet bağlantısı al").click()
    link = page.locator(".admin-list li", has_text=name).locator('input[aria-label="Davet bağlantısı"]')
    expect(link).to_be_visible()
    url = link.input_value()
    # the link is built from APP_PUBLIC_URL, not from whatever address the admin browses from
    assert url.startswith(BASE + "/invite/"), f"invite link {url!r} does not start with APP_PUBLIC_URL {BASE}"
    return url


def register(page: Page, invite_url: str, name: str, email: str) -> None:
    page.goto(invite_url)
    page.get_by_label("Adın").fill(name)
    page.get_by_label("E-posta").fill(email)
    page.get_by_label("Şifre (en az 10 karakter)").fill(PASSWORD)
    page.get_by_role("button", name="Hesabı oluştur").click()
    page.wait_for_url(f"{BASE}/")


def api(ctx: BrowserContext, path: str):
    return ctx.request.get(BASE + path)


def wait_until(check, what: str, timeout: float = 180, every: float = 2):
    deadline = time.time() + timeout
    last = None
    while time.time() < deadline:
        last = check()
        if last:
            return last
        time.sleep(every)
    raise AssertionError(f"timed out waiting for {what}")


def calendar_check(page: Page, ctx: BrowserContext) -> None:
    import datetime
    # wide screens: the calendar sits next to the shelf; narrow ones reach it through the bottom tab bar
    page.set_viewport_size({"width": 1440, "height": 900})
    page.goto("/")
    expect(page.locator("aside.home__calendar .calendar__cell").first).to_be_visible()
    expect(page.locator(".bottom-tabs")).to_be_hidden()
    page.wait_for_timeout(800)
    page.screenshot(path=str(OUT / "home-calendar-wide.png"))
    page.set_viewport_size({"width": 390, "height": 844})
    page.goto("/")
    expect(page.locator("aside.home__calendar")).to_have_count(0)
    page.wait_for_timeout(500)
    page.screenshot(path=str(OUT / "home-tabs-phone.png"))
    page.locator(".bottom-tabs").get_by_role("link", name="Takvim").click()
    page.wait_for_url("**/takvim")
    expect(page.get_by_role("heading", name="Takvimimiz")).to_be_visible()
    page.set_viewport_size({"width": 1280, "height": 900})
    # the test photos carry no EXIF date: they sit on the day they were made and are marked "?"
    today = datetime.date.today()
    month = api(ctx, f"/api/calendar/month?month={today:%Y-%m}").json()
    assert month["days"], month
    day = month["days"][-1]["date"]
    assert any(d["uncertain"] for d in month["days"]), month
    cell = page.locator(f'a.calendar__cell[href^="/takvim/gun/{day}"]')
    expect(cell).to_be_visible()
    page.screenshot(path=str(OUT / "calendar-month.png"))
    cell.click()
    expect(page.locator(".calendar__day-item").first).to_be_visible()
    page.wait_for_timeout(800)
    page.screenshot(path=str(OUT / "calendar-day.png"))
    before = len(page.locator(".calendar__day-item").all())

    page.get_by_role("button", name="? Tarih belirsiz — tarihi düzelt").first.click()
    dialog = page.get_by_role("dialog", name="Tarihi düzelt")
    dialog.get_by_label("Gün").fill("2024-02-14")
    dialog.get_by_label("Saat").fill("19:30")
    dialog.get_by_role("button", name="Kaydet").click()
    expect(page.locator(".calendar__day-item")).to_have_count(before - 1)
    moved = api(ctx, "/api/calendar/day?date=2024-02-14").json()["media"]
    assert len(moved) == 1 and moved[0]["media"]["dateOverridden"] and not moved[0]["media"]["dateUncertain"], moved

    page.goto("/takvim?ay=2024-02")
    page.get_by_role("button", name="Özel günler").click()
    dialog = page.get_by_role("dialog", name="Özel günlerimiz")
    dialog.get_by_role("button", name="Özel gün ekle").click()
    dialog.get_by_label("Ad").fill("Sevgililer günü")
    dialog.get_by_label("Tarih").fill("2024-02-14")
    dialog.get_by_role("radio", name="Kalp").click()
    dialog.get_by_role("button", name="Kaydet").click()
    expect(dialog.get_by_text("Sevgililer günü")).to_be_visible()
    dialog.get_by_role("button", name="Kapat").click()
    cell = page.locator('a.calendar__cell[href^="/takvim/gun/2024-02-14"]')
    expect(cell.locator(".calendar__thumb")).to_be_visible()
    expect(cell.locator(".calendar__specials")).to_be_visible()
    page.screenshot(path=str(OUT / "calendar-special.png"))
    cell.click()
    expect(page.get_by_text("Sevgililer günü")).to_be_visible()

    # the diary: my own note on the day, saved by itself, still there after a reload
    note = page.get_by_label("Benim notum")
    note.fill("Bugün sahilde yürüdük, akşam da en sevdiğimiz yerde yemek yedik 🌅")
    expect(page.get_by_text("Kaydedildi")).to_be_visible(timeout=10_000)
    page.reload()
    expect(page.get_by_label("Benim notum")).to_have_value("Bugün sahilde yürüdük, akşam da en sevdiğimiz yerde yemek yedik 🌅")
    notes = api(ctx, "/api/calendar/day?date=2024-02-14").json()["notes"]
    assert len(notes) == 1 and notes[0]["mine"], notes
    page.screenshot(path=str(OUT / "calendar-day-note.png"))
    page.get_by_role("button", name="Albümde göster").first.click()
    page.wait_for_url("**/albums/**")
    expect(page.locator(".page .polaroid").first).to_be_visible()

    page.goto("/takvim?ay=2024-02")
    expect(page.locator('a.calendar__cell[href^="/takvim/gun/2024-02-14"] .calendar__note-mark')).to_be_visible()
    page.goto("/takvim?yil=2024")
    expect(page.locator(".calendar__dot--special")).to_have_count(1)
    expect(page.locator(".calendar__dot--note")).to_have_count(1)
    page.screenshot(path=str(OUT / "calendar-year.png"))
    page.set_viewport_size({"width": 390, "height": 844})
    page.goto(f"/takvim?ay={today:%Y-%m}")
    page.wait_for_timeout(600)
    page.screenshot(path=str(OUT / "calendar-month-phone.png"))
    page.set_viewport_size({"width": 1280, "height": 900})


def mobile_api_check() -> None:
    """What the Capacitor apps do (they run on capacitor://localhost / https://localhost and call the API across origins)."""
    import urllib.error
    import urllib.request

    def call(method, path, body=None, headers=None, base=BASE):
        req = urllib.request.Request(base + path, method=method, data=json.dumps(body).encode() if body is not None else None,
                                     headers={"Content-Type": "application/json", **(headers or {})})
        try:
            with urllib.request.urlopen(req, timeout=20) as r:
                return r.status, dict(r.headers), r.read()
        except urllib.error.HTTPError as e:
            return e.code, dict(e.headers), e.read()

    app = {"X-Client": "love-site-app", "Origin": "capacitor://localhost"}
    status, headers, _ = call("OPTIONS", "/api/albums", headers={"Origin": "capacitor://localhost", "Access-Control-Request-Method": "POST",
                                                                  "Access-Control-Request-Headers": "content-type,x-client,x-auth-token"})
    assert status == 200 and headers.get("Access-Control-Allow-Origin") == "capacitor://localhost", (status, headers)
    status, _, _ = call("OPTIONS", "/api/albums", headers={"Origin": "https://evil.example", "Access-Control-Request-Method": "POST"})
    assert status == 403, f"CORS preflight from a foreign origin gave {status}"
    status, headers, body = call("POST", "/api/auth/login", {"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}, app)
    assert status == 200, (status, body[:200])
    token = headers.get("X-Auth-Token")
    assert token and "SESSION=" not in headers.get("Set-Cookie", "") and "XSRF-TOKEN" not in headers.get("Set-Cookie", ""), headers
    auth = {**app, "X-Auth-Token": token}
    status, _, body = call("POST", "/api/albums", {"title": "Telefondan"}, auth)
    assert status == 201, (status, body[:200])
    album = json.loads(body)["id"]
    jpeg = (OUT / "media" / "photo.jpg").read_bytes()
    status, _, body = call("POST", f"/api/albums/{album}/uploads", {"files": [{"clientId": "1", "filename": "telefon.jpg", "contentType": "image/jpeg",
                                                                              "sizeBytes": len(jpeg)}]}, auth)
    item = json.loads(body)["items"][0]
    assert item["result"] == "PRESIGNED", item
    # the bucket accepts the app origin for direct uploads (its CORS rule includes the app origins)
    pre = urllib.request.Request(item["uploadUrl"], method="OPTIONS", headers={"Origin": "https://localhost", "Access-Control-Request-Method": "PUT",
                                                                               "Access-Control-Request-Headers": "content-type"})
    with urllib.request.urlopen(pre, timeout=20) as r:
        assert r.headers.get("Access-Control-Allow-Origin") in ("https://localhost", "*"), dict(r.headers)
    put = urllib.request.Request(item["uploadUrl"], method="PUT", data=jpeg, headers={"Content-Type": item["contentType"], "Origin": "https://localhost"})
    with urllib.request.urlopen(put, timeout=30) as r:
        assert r.status == 200
    status, _, body = call("POST", f"/api/media/{item['mediaId']}/complete", None, auth)
    assert status == 200, (status, body[:200])
    # the token is worthless without the app header, and dead after logout
    assert call("GET", "/api/albums", headers={"X-Auth-Token": token})[0] == 401
    assert call("POST", "/api/auth/logout", None, auth)[0] == 204
    assert call("GET", "/api/albums", headers=auth)[0] == 401


def main() -> int:
    OUT.mkdir(parents=True, exist_ok=True)
    photo, video, song = make_media(OUT / "media")
    tag = uuid.uuid4().hex[:6]
    themes: list[tuple[str, str]] = []  # (theme name, album id)

    with sync_playwright() as p:
        browser = p.chromium.launch()

        step("admin signs in and creates two spaces")
        admin_ctx, admin = new_user_context(browser, "admin")
        login(admin, ADMIN_EMAIL, ADMIN_PASSWORD)
        invite_a = create_space(admin, f"Alan A {tag}")
        invite_b = create_space(admin, f"Alan B {tag}")
        admin.screenshot(path=str(OUT / "admin.png"))

        step("user A registers through the invitation link")
        a_ctx, a = new_user_context(browser, "user A")
        register(a, invite_a, "Ayse", f"ayse-{tag}@e2e.test")
        expect(a.get_by_role("button", name="Yeni albüm")).to_be_visible()
        # the invitation is single use
        again = a_ctx.new_page()
        again.goto(invite_a)
        expect(again.get_by_text("Zaten bir alana üyesin")).to_be_visible()
        again.close()

        step("an album for each theme")
        a.get_by_role("button", name="Yeni albüm").click()
        names = [t.inner_text().strip().split("\n")[-1] for t in a.locator(".theme-card").all()]
        assert len(names) == 6, f"expected 6 themes, got {names}"
        a.get_by_role("button", name="Vazgeç").click()
        for name in names:
            a.get_by_role("button", name="Yeni albüm").click()
            dialog = a.get_by_role("dialog", name="Yeni albüm")
            dialog.get_by_label("Albümün adı").fill(f"{name} albümü")
            dialog.locator(".theme-card", has_text=name).click()
            dialog.get_by_role("button", name="Oluştur").click()
            expect(a.get_by_role("link", name=f"{name} albümü albümünü aç")).to_be_visible()
        listing = api(a_ctx, "/api/albums").json()
        for album in listing:
            themes.append((album["title"], album["id"]))
        assert len(themes) == 6, listing
        a.screenshot(path=str(OUT / "shelf.png"))

        step("every album opens in its own theme")
        for title, album_id in themes:
            a.goto(f"/albums/{album_id}")
            expect(a.get_by_role("heading", name=title)).to_be_visible()
            a.wait_for_timeout(600)
            a.screenshot(path=str(OUT / f"album-{album_id[:8]}.png"))

        title, album_id = themes[0]
        step(f"upload a photo and a video to '{title}'")
        a.goto(f"/albums/{album_id}")
        a.locator('input[type="file"][accept="image/*,video/*"]').set_input_files([str(photo), str(video)])
        a.get_by_role("dialog", name="Yüklenecek dosyalar").get_by_role("button", name="Yükle").click()

        def all_ready():
            items = api(a_ctx, f"/api/albums/{album_id}/media").json()
            states = {i["status"] for i in items}
            assert "FAILED" not in states and "REJECTED" not in states, f"processing failed: {items}"
            return items if len(items) == 2 and states == {"READY"} else None

        items = wait_until(all_ready, "photo and video to become READY")
        kinds = {i["type"] for i in items}
        assert kinds == {"IMAGE", "VIDEO"}, kinds
        a.reload()
        expect(a.locator(".polaroid").first).to_be_visible()
        a.wait_for_timeout(800)
        a.screenshot(path=str(OUT / "album-with-media.png"))

        step("edit the page: FREE template and a sticker")
        a.get_by_role("button", name="Albümü düzenle").click()
        group = a.get_by_role("group", name="Sayfa düzeni")
        expect(group).to_be_visible()
        group.get_by_role("button", name="Serbest").click()
        wait_until(lambda: api(a_ctx, f"/api/albums/{album_id}/pages").json()["pages"][0]["template"] == "FREE", "FREE template", 30, 1)
        a.get_by_role("button", name="Renk, doku, çıkartma").click()
        a.get_by_role("button", name="Çıkartmalar").click()
        a.locator(".sticker-grid button").first.click()

        def has_sticker():
            pages = api(a_ctx, f"/api/albums/{album_id}/pages").json()["pages"]
            return any(i["kind"] == "STICKER" for pg in pages for i in pg["items"])

        wait_until(has_sticker, "the sticker to be stored", 30, 1)
        a.screenshot(path=str(OUT / "edit-free.png"))
        a.get_by_role("button", name="Düzenlemeyi bitir").click()

        step("album music")
        a.get_by_role("button", name="Albüm ayarları").click()
        settings = a.get_by_role("dialog", name="Albüm ayarları")
        settings.locator('input[type="file"]').set_input_files(str(song))
        expect(settings.get_by_role("button", name="Müziği değiştir")).to_be_visible()
        mine = [x for x in api(a_ctx, "/api/albums").json() if x["id"] == album_id][0]
        assert mine["musicUrl"], "album has no music after the upload"
        settings.get_by_role("button", name="Kapat").click()

        if os.environ.get("SKIP_EXPORTS") != "1":  # SKIP_EXPORTS=1: a quicker run without the export checks
            step("Phase 7: exports (formats, visual comparison, roles, mixed page themes)")
            import exports
            exports.run(browser, a_ctx, a, OUT / "media-exports")
        a.set_viewport_size({"width": 1280, "height": 900})

        step("a user of another space gets 404")
        b_ctx, b = new_user_context(browser, "user B")
        register(b, invite_b, "Ali", f"ali-{tag}@e2e.test")
        for path in (f"/api/albums/{album_id}/media", f"/api/albums/{album_id}/pages"):
            status = api(b_ctx, path).status
            assert status == 404, f"{path} gave {status} to another space"
        b.goto(f"/albums/{album_id}")
        expect(b.get_by_role("heading", name="Bu sayfa bulunamadı")).to_be_visible()
        b.screenshot(path=str(OUT / "other-space-404.png"))
        b.goto("/boyle/bir/sayfa/yok")
        expect(b.get_by_role("heading", name="Bu sayfa bulunamadı")).to_be_visible()
        assert api(b_ctx, "/api/albums").json() == [], "user B sees albums of another space"

        step("calendar: month, day, fixing an uncertain date, special days, year")
        calendar_check(a, a_ctx)

        step("store app API: session token in a header, CORS for the app origins only, uploads from the app origin")
        mobile_api_check()

        step("health and headers")
        health = api(b_ctx, "/actuator/health/readiness")
        assert health.status == 200
        csp = health.headers.get("content-security-policy", "")
        assert "default-src 'self'" in csp and "s3:8000" in csp, csp

        browser.close()

    (OUT / "problems.json").write_text(json.dumps(problems, indent=2), encoding="utf-8")
    if problems:
        print("PROBLEMS SEEN IN THE BROWSER:")
        for line in problems:
            print("  " + line)
        return 1
    print("OK: the whole journey worked")
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except Exception as exc:  # keep the traceback readable in CI logs
        print(f"FAILED: {exc!r}")
        raise
