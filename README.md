# love-site

Private scrapbook-style photo/video album for two people. Phase 1: skeleton (auth, DB, SPA hosting).

- `backend/` Spring Boot 4 (Java 21, Maven) - session auth, Flyway, Postgres
- `frontend/` React + Vite + TypeScript
- Single deployable image: the React build is served by Spring Boot as static resources (no CORS).

## Environment variables

See [.env.example](.env.example). Required in production: `PGHOST`, `PGPORT`, `PGDATABASE`, `PGUSER`, `PGPASSWORD`,
`USER1_*` / `USER2_*` (email, name, password) and the bucket variables below.
The app refuses to start if a seed or bucket variable is missing.
Users are only created when absent; changing a password env var later does not change an existing password.

### Spaces (Phase 3.5)

| Variable | Default | Meaning |
|---|---|---|
| `ADMIN_EMAIL` | empty | this account is the platform admin (`/admin`); it must already exist (e.g. `USER1_EMAIL`) |
| `INITIAL_SPACE_NAME` | `Bizim Alanımız` | name of the first space (existing data / first install) |
| `INITIAL_SPACE_LIMIT_GB` | `400` | its storage limit |

`USER1_*` / `USER2_*` are only used for the **first** space (USER1 owner, USER2 member). Every other couple joins through
an invitation, never through environment variables.

### Storage bucket (Railway)

Create a Storage Bucket in the project and add these variables to the app service, using Railway variable references
(Railway names the bucket's own variables `ENDPOINT`, `BUCKET`, `ACCESS_KEY_ID`, `SECRET_ACCESS_KEY`, `REGION`):

| Variable | Value |
| --- | --- |
| `S3_ENDPOINT` | `${{<Bucket service>.ENDPOINT}}` |
| `S3_BUCKET` | `${{<Bucket service>.BUCKET}}` (the S3 bucket name, not `RAILWAY_BUCKET_NAME`) |
| `S3_ACCESS_KEY_ID` | `${{<Bucket service>.ACCESS_KEY_ID}}` |
| `S3_SECRET_ACCESS_KEY` | `${{<Bucket service>.SECRET_ACCESS_KEY}}` |
| `S3_REGION` | `${{<Bucket service>.REGION}}` (defaults to `auto`) |
| `APP_PUBLIC_URL` | the app's public address, e.g. `https://love-site.up.railway.app` or your custom domain (see Phase 6 below) |
| `APP_ALLOWED_ORIGINS` | optional: origins allowed to upload to the bucket (comma separated, no trailing slash); defaults to the origin of `APP_PUBLIC_URL` |
| `S3_PATH_STYLE` | leave unset (virtual-hosted style); `true` only for old path-style buckets or MinIO |

On startup the app calls `PutBucketCors` for `APP_ALLOWED_ORIGINS` (PUT, GET, HEAD, `Content-Type`, exposes `ETag`).
If that call fails the app still starts and logs `Could not configure bucket CORS`; direct browser uploads then fail
with a CORS error until the rule is set (see Railway's "uploading & serving" docs for the `aws s3api put-bucket-cors` form).
The bucket is private: all access is through presigned URLs.

Optional limits (defaults in `application.yml`): `app.media.max-image-size` (30MB), `app.media.max-video-size` (300MB),
`app.media.max-batch-size` (50).

## Local development

```bash
# Postgres
docker run -d --name lovesite-db -e POSTGRES_USER=lovesite -e POSTGRES_PASSWORD=lovesite -e POSTGRES_DB=lovesite -p 5432:5432 postgres:17

# Local S3 (any S3-compatible server works; the local profile expects minioadmin/minioadmin on :9000, bucket "lovesite")
# Backend (profile "local" has DB, S3 and seed-user defaults, see application-local.yml)
cd backend && SPRING_PROFILES_ACTIVE=local mvn spring-boot:run

# Frontend (Vite dev server on :5173, proxies /api to :8080)
cd frontend && npm install && npm run dev
```

## Docker / Railway

```bash
docker build -t love-site .
```

Deploy on Railway using the root `Dockerfile` with a Postgres service attached. Set `USER*` variables.
Railway's `DATABASE_URL` is intentionally ignored; the app builds the JDBC URL from `PG*`.

Health: set Railway's **healthcheck path to `/actuator/health/liveness`**. `/actuator/health` also includes a
`mediaTools` check (ffmpeg, vips, HEIF support) and reports DOWN if a tool is missing; details are only shown to
authenticated users. No other actuator endpoint is exposed.

## Auth API

- `POST /api/auth/login` `{email, password}` -> user; 429 after 5 failures for an email (15 min lock, in-memory)
- `POST /api/auth/logout` -> 204
- `GET /api/auth/me` -> user or 401

CSRF: the `XSRF-TOKEN` cookie is set on every response; send it back as the `X-XSRF-TOKEN` header on non-GET calls.

## Albums and uploads

- `GET/POST /api/albums`, `PATCH/DELETE /api/albums/{id}` (delete is a soft delete)
- `GET /api/albums/{id}/media` - uploaded media with presigned GET URLs (stable for ~50 min so browsers can cache)
- `POST /api/albums/{id}/uploads` - batch of up to 50 files; each gets `PRESIGNED` (PUT the file with the returned
  `contentType`), `DUPLICATE` (same sha256 in the album) or `ERROR`; one bad file never fails the batch
- `POST /api/media/{id}/complete` - verifies size and type with HeadObject; idempotent
- `DELETE /api/media/{id}` - soft delete, the object stays in the bucket

Pending uploads older than 24 h are removed hourly. Run the backend tests (Testcontainers needs Docker) with
`cd backend && ./mvnw test`.

## Design notes (Phase 4)

- Tokens (colours, shadows, radii, layers, `--media-filter`, grain) live in `frontend/src/styles/tokens.css`. Fonts are
  self-hosted through `@fontsource` (Cinzel 600, Cormorant Garamond 400/400 italic, Caveat 500; latin + latin-ext for Turkish).
- A page is a fixed 1000 x 1400 unit canvas. `layout/autoLayout.ts` is a pure function (`autoLayout(media, seed, aspects?)`) that
  returns `PageLayout[]`; `components/book/PageCanvas.tsx` draws a `PageLayout` and nothing else. In Phase 5 stored layouts
  replace `autoLayout` and the renderer does not change. `LivingPhoto` and `PageCanvas` take an `interactive` prop to turn
  hover tilt and click off for an editing mode.
- Photo/video choice is one rule in `media/display.ts`: processed copy (`displayUrl` / `loopUrl` / `posterUrl`) when the API
  provides it, otherwise the original if the browser can show it, otherwise the "banyo ediliyor" placeholder.
- Videos are muted and loop, play only while on screen and never more than 6 at once (`media/playback.ts`).
- Screenshots of every screen (desktop and mobile) are in `docs/screenshots/`.

## Page layout rules

`autoLayout` (frontend/src/layout) builds the pages of a book:

- An album of 2+ photos always has an **even number of pages**, so every spread has two filled pages (sizes differ by at most
  one: 4 photos -> 2+2, 5 -> 3+2, 9 -> 3+2+2+2). From 4 photos on every page holds 2-4; 2 photos give 1+1 and 3 give 2+1;
  one photo gets a single page.
- Frame widths: ~520 for one photo, 420-460 for two, 360-400 for three, 300-340 for four. A page whose polaroids add up to
  less than ~55% of the usable area (bounding boxes) is enlarged until it is full; a crowded page of tall photos is shrunk
  only as far as the rules require.
- Every frame, rotated and including its caption strip, stays at least 40 units inside the page and above the page-number
  strip; an item may hide at most 15% of another picture and never a caption; tape sits on a polaroid's top edge and never
  touches a picture; stickers go only into empty space.
- Text size is `max(design size x page scale, screen minimum)`: design sizes are caption >= 24 and date >= 22 page units,
  screen minimums are 13 px (caption) and 10 px (date). The layout takes the same metrics (page scale, narrow screen or not)
  as input, so the caption strip, the bounding boxes and the overlap rules always match what is drawn. On narrow screens
  (book area under 700 px) the caption is a single line with an ellipsis; the lightbox shows and edits the full text.
  Measured at 390 px wide: caption 13.5 px, date 10.4 px; at 320 px: 13.1 / 10.1 px; on a 1440 px desktop: 17 / 11.7 px.
- Unknown aspect ratios default to 9:16; real ratios come from the API (later) or are measured in the browser, cached per
  album in memory, and applied in one batch.

`cd frontend && npm test` checks all of this for 1-40 photos of mixed ratios across 50 seeds, including that a spread with
one empty page is reported as an error. Measured over those albums: 97.7% of pages reach 55% fill (average 62%, minimum 47%,
only some lone landscape photos and landscape-plus-portrait pages stay below).

## Bucket client limits

The S3 client does not rely on SDK defaults: `app.storage.connect-timeout` (3s), `read-timeout` (10s, socket inactivity) and
`max-attempts` (3) are explicit; presigned URLs are computed locally, so a slow bucket cannot stall album requests.

## Security headers

Spring Security sends `Strict-Transport-Security: max-age=31536000; includeSubDomains` (HTTPS requests only),
`Referrer-Policy: no-referrer` and a Content-Security-Policy whose bucket origin is derived from `S3_ENDPOINT`
(`https://<bucket>.<host>` for virtual-hosted buckets, the endpoint itself when `S3_PATH_STYLE=true`):

```
default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; img-src 'self' blob: <bucket>; media-src 'self' blob: <bucket>;
connect-src 'self' <bucket>; font-src 'self'; style-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'
```

`'wasm-unsafe-eval'` is needed because uploads hash files with hash-wasm (WebAssembly); it does not allow `eval()`.
No inline styles or scripts are needed (textures are real files, not data: URLs).

## Photo dates

Uploads send `File.lastModified`; the server stores it as `media.client_modified_at` (ignored if missing, non-positive or in
the future). The album shows that date, falling back to the upload time. Phase 3 will prefer the EXIF date and use this as
the fallback.

## Media processing (Phase 3)

Every verified upload becomes `UPLOADED` and is picked up by an in-process queue (no separate service):
`UPLOADED -> PROCESSING -> READY`, or `FAILED` after the last attempt. The original is never modified or deleted and is never
sent to the browser; the album only uses generated variants.

- **Queue:** a poller (every 3 s, plus a kick right after an upload completes) claims one due `UPLOADED` row with
  `SELECT ... FOR UPDATE SKIP LOCKED` and marks it `PROCESSING` in a short transaction; the work runs outside any
  transaction on a bounded pool (`app.processing.concurrency`, default 1) and the result is written in another one.
  A job stuck in `PROCESSING` for 15 min (crash, restart) is re-queued and counts as a failed attempt. Failures retry after
  1 min, 5 min, 15 min (`app.processing.backoff`); the 3rd failure sets `FAILED`. Existing `UPLOADED` rows are processed
  automatically after a deploy. `POST /api/media/{id}/reprocess` re-queues a `FAILED` or `READY` item with a fresh counter.
- **External tools** (`ffmpeg`, `ffprobe`, `vips`) run with argument lists (no shell), both output streams drained, a timeout
  per process (photo 60 s, video 180 s) and the whole process tree killed on timeout. Temporary files are removed in `finally`.
- **Variants** are written next to the original, in `.../media/{mediaId}/v{n}/` (the directory is derived from the stored
  `original_key`, so old `albums/...` and new `spaces/...` keys both work), with
  `Cache-Control: private, max-age=31536000, immutable`; the row points at version *n* only after every object is uploaded, then
  the previous version's objects are deleted. No EXIF/GPS/ICC in any variant.
  - Photos (format detected from content, HEIC via `heifload`): `thumb.webp` (long edge 480, Q78) and `display.webp`
    (long edge 1600, Q82); orientation applied, sRGB, never enlarged. Capture date from EXIF `DateTimeOriginal`
    (+ `OffsetTimeOriginal`, else `app.processing.default-timezone` = Europe/Istanbul; dates before 2000 or in the future are ignored).
  - Videos: silent boomerang `loop.mp4` (first 3 s forward then backward, long edge 720, <= 30 fps, H.264 yuv420p, CRF 26,
    faststart; videos under 1 s are used whole) and `poster.webp`. HLG / PQ sources are tone-mapped to SDR bt709
    (`zscale` + `tonemap`). Capture date from `creation_time`.
- **API:** the media DTO has `status`, `thumbUrl`, `displayUrl`, `loopUrl`, `posterUrl`, `width`, `height`, `durationMs` and a
  computed `displayDate` (`taken_at` > device modified time > upload time). URLs are null until `READY`; `FAILED` carries no
  detail (the cause stays in `media.last_error` and the log). `GET /api/media?ids=a,b` returns the current state of a few items
  (the album page polls only the unfinished ones, every 5 s).
- **Docker image:** installs `ffmpeg`, `libvips-tools`, `libheif1` and `libheif-plugin-libde265` (the HEVC decoder iPhone HEIC needs;
  it is only a "recommended" package, so it is named explicitly). The build fails if ffmpeg lacks `zscale`, `tonemap`, `reverse`,
  `libx264` or `libwebp`, or if vips has no `heifload` or libheif no HEVC plugin.

### Running the tests with the real tools

The processing tests use synthetic media made on the fly with ffmpeg/vips (nothing personal is committed) and skip themselves
when those tools are missing. To run everything (including HEIC and HLG) use the test image, which has the same OS and
tools as production plus an HEVC encoder:

```bash
docker build -t love-site-test -f backend/test.Dockerfile backend
docker run --rm -v "$PWD/backend:/w" -v m2cache:/root/.m2 -v /var/run/docker.sock:/var/run/docker.sock   -e TESTCONTAINERS_HOST_OVERRIDE=host.docker.internal -e TESTCONTAINERS_RYUK_DISABLED=true -w /w love-site-test ./mvnw test
```

## Spaces, authorization and quota (Phase 3.5)

A **space** is one couple's private area: `space` + `space_member` (a user belongs to exactly one space; roles `OWNER` /
`MEMBER`, at most 2 members). `album.space_id` and `media.space_id` are mandatory. `app_user.is_admin` marks the platform admin.

### The scoping rule

> **Every query that serves a request carries the space id of the signed-in user. There is no repository method that finds
> an album or media by id alone, and nobody ever loads a record first and checks its space afterwards.**

The space id comes from `CurrentUser` (resolved once per request from the session, injected as a controller parameter), never
from the URL or body. An id of another space therefore behaves exactly like an id that does not exist: `404` with the same body.
Presigned URLs are only generated from records that were loaded through a scoped query. The background worker is system-level
(it claims jobs across spaces) and works from the row it claimed. The admin sees names, member names and usage numbers; no endpoint
exposes another space's albums or media. When adding an endpoint: take `CurrentUser me`, call a `...SpaceId...` repository method.

`TenantIsolationTest` is the IDOR matrix (every id endpoint probed with another space's ids, plus lists, admin).

### Invitations (no public signup)

- Admin: `POST /api/admin/spaces {name, limitGb}` creates a space and returns an owner invitation link; `GET /api/admin/spaces`,
  `PATCH /api/admin/spaces/{id}` (name / limit), `POST /api/admin/spaces/{id}/invites` (new owner link while the space has no owner).
  UI: `/admin`.
- Owner: `POST /api/space/invites` creates the partner link (UI: "Partnerini davet et" on the shelf). **A new partner link
  replaces the previous unused one** (the old link stops working); a full space (2 members) cannot invite.
- Link: `/invite/{token}`. `GET /api/invites/{token}` and `POST /api/invites/{token}/accept {displayName,email,password>=10}` are
  public. The token is 32 random bytes (base64url), valid 7 days, single use; only its SHA-256 is stored. Unknown, used, expired
  and "space full" all answer the same generic 404. Wrong guesses are throttled per client IP (5 failures -> 15 min lock; the
  IP is the rightmost `X-Forwarded-For` entry, because Spring's forwarded-header filter would otherwise expose the spoofable
  leftmost one). A signed-in user gets "Zaten bir alana üyesin". Accepting creates the user, joins the space and signs in.
- There is **no password reset and no email sending**. If someone forgets their password, the admin sets a new hash by hand:
  generate a BCrypt hash (`htpasswd -bnBC 10 "" 'NewPassword' | tr -d ':
' | sed 's/$2y/$2a/'`) and run
  `UPDATE app_user SET password_hash = '<hash>' WHERE email = '<email>';` in the Postgres console, then tell them the new password.

### Quota and trash

- Usage = `sum(size_bytes + variants_bytes)` of all media of the space that are not `REJECTED`: soft-deleted items still count until
  they are purged, pending uploads count with their declared size. The worker stores `variants_bytes` when it finishes a version
  (a final overflow by the generated variants is accepted).
- `POST .../uploads` locks the space row (`SELECT ... FOR UPDATE`) and answers `QUOTA_EXCEEDED` per file (the rest of the batch
  still goes through); `complete` re-checks the real size under the same lock and then answers `413` with `code: QUOTA_EXCEEDED`.
  `GET /api/space` returns usage and limit; the shelf shows a bar with warnings at 90 % and 100 %.
- Deleting an album or media only hides it. `TrashPurgeJob` runs daily at 03:30 (Europe/Istanbul) and, after
  `app.space.trash-retention` (30 days), deletes the bucket objects (original and variants) and the rows, which finally frees the
  space. There is no restore UI.

### Fair queue

`claimNext` orders candidates by (space already has a job `PROCESSING`) first false, then `space.last_served_at` (never served
first), then the job's age, still with `FOR UPDATE SKIP LOCKED`. One couple importing hundreds of videos cannot starve the others:
with one worker the spaces take turns; with several workers an idle space is preferred over one that is already being processed.

### Migration to spaces

`V6__spaces.sql` adds the tables and nullable `space_id` columns; `V7__InitialSpace` (Java migration) creates the initial space
when data exists (name/limit from `INITIAL_SPACE_*`, `USER1` owner, `USER2` member, falling back to the two oldest accounts),
attaches every album and media row, marks `ADMIN_EMAIL` as admin and then makes `space_id` NOT NULL. Existing storage keys are not
touched. On a fresh install the startup seeder creates the initial space instead.

## Persistent pages (Phase 5a)

`page` (album, `page_index`, template `AUTO` / `FEATURED` / `FREE`, `version`) and `page_item` (kind, media, `slot_index` for AUTO /
FEATURED, `x y width rotation z_index` for FREE, `version`). A media item sits on at most one page (unique `page_item.media_id`);
live media on no page is the **tray**. AUTO and FEATURED pages store only the order, the frontend computes the positions at render time
(`layoutAutoPage` / `layoutFeaturedPage`, deterministic per page id + media id); FREE pages store the positions (page units, 1000 x 1400).

- All page writes lock the album row first (`SELECT ... FOR UPDATE`), so concurrent uploads / edits of one album are serialised.
  `version` on pages and items protects users from overwriting each other: a stale write answers **409** with the current page in
  `current`; the frontend reloads that page and shows "Sayfa başka bir yerde değişti, güncellendi".
- `GET /api/albums/{id}/pages`, `POST .../pages/initialize` (one-time import of the distribution the old layout made; no-op when pages exist),
  `POST .../pages`, `POST .../pages/reorder`, `PATCH/DELETE /api/pages/{id}`, `PATCH /api/page-items/{id}`,
  `POST /api/page-items/{id}/move`, `POST/DELETE /api/page-items`, `POST /api/media/{id}/feature`. Same IDOR rule as everywhere.
- A completed upload goes to the last page when it is AUTO with fewer than 4 photos, otherwise to a new AUTO page; "Tek sayfa" uploads
  (`featured: true` in the upload request) get a new FEATURED page. Albums without pages are left alone until the first open initializes them.
- Editor: pencil button -> edit mode (hover/lightbox/ambient off). FREE pages: drag, rotate handle, scale handle (interact.js, touch works).
  AUTO pages: drag a photo onto another photo (reorder) or page. Page bar (reorder by dragging, add, delete, template), item bar, tray.
  To add an editing feature, extend `PageEditor` (`components/book/editor.ts`).

## Themes, page look, stickers and album music (Phase 5b)

A **theme is data**: one folder `frontend/src/themes/<id>/` with a `theme.ts` (the `ThemeDef` shape in `themes/types.ts`) and its
files under `assets/` (papers, cover ornament, fasteners, stickers, music box, cursor). Nothing branches on a theme id.
Six themes exist: `romantik` (default), `buyulu`, `arkadaslar`, `seyahat`, `yilbasi`, `cadilar-bayrami`. All artwork is original
(generic magic / autumn / travel / winter imagery; no names, characters, crests or slogans of any film, book or franchise).

**Adding a theme = two steps:** (1) create `themes/<id>/theme.ts` + `assets/` and import it in `themes/registry.ts`;
(2) add the id to `app.themes.allowed` (backend, `application.yml` / `ThemeProperties`). `themes.test.ts` checks the schema
for every registered theme: 5 swatches and 4 papers (semantic slots), 10-12 stickers, every referenced file exists, contrast of
every swatch >= 4.5:1, photo filter inside the limits (sepia <= 0.35, contrast 0.95-1.12, saturate 0.8-1.1, no hue rotation),
at most 30 ambient particles, no `<text>` in stickers (text is converted to paths), no fonts imported at start-up.

- **Fonts** load when an album of the theme opens (`theme.fonts.load` = dynamic `import()` of `@fontsource` files); only the base
  fonts (Cinzel, Cormorant Garamond, Caveat) are in the start-up bundle. Creepster and Mountains of Christmas have no latin-ext
  subset: Turkish letters outside Latin-1 (ğ ş ı İ) fall back to the next font of the stack.
- **Pages** have `swatch` (`light|soft|accent|deep|dark`) and `paper` (`plain|lined|textured|special`) slots, `null` = the theme
  default; `PATCH /api/pages/{id}` takes `swatch` / `paper` (`"DEFAULT"` resets). Papers are mid-grey pictures blended (soft-light)
  onto the swatch colour, so every paper suits every colour and a "dark" page stays dark after a theme change.
- **Stickers** (`POST /api/page-items` with `kind: STICKER`, `variant: "themeId:stickerId"`) are free layers on every template,
  at most 20 per page; the layout engine ignores them. Unknown theme or sticker ids draw nothing.
- **Frame skin** only changes colours, texture, corner ornaments and the stamp perforation of the polaroid; its outer geometry is
  identical in all themes, so layout code and its overflow tests do not know about themes.
- **Ambient animation** (`components/Ambient.tsx`): one canvas, <= 30 particles, ~30 fps; off with `prefers-reduced-motion`, in edit
  mode, while the lightbox is open and while the tab is hidden; switch in the album header (remembered in `localStorage`).
  Hover bursts, the custom cursor (`buyulu`), sticker wiggle and the compass needle (`seyahat`) follow the same rules and only run
  with a real mouse (`effectsAllowed` in `components/ambient/effects.ts`).
- **Album music**: `POST /api/albums/{id}/music/upload` {filename, contentType, sizeBytes} -> presigned PUT (audio/mpeg, mp4, x-m4a,
  aac, ogg; <= 20 MB; counted in the space quota, also while pending), `POST .../music/complete` (HeadObject check, the previous
  object is deleted), `DELETE .../music`. Key: `spaces/{spaceId}/albums/{albumId}/audio/{uuid}`. The album response carries `musicUrl`
  and `musicName`. The trash purge removes the song together with its album. The space-wide `GET /api/settings/music` (and the global
  `audio/theme` objects) is gone: an `audio/theme` object that is still in the bucket is no longer read and can be deleted by hand.
  The music box plays only after a tap, fades out when the album is left, and does not exist for albums without a song.

## Custom domain, backup, Motion Photo, final checks (Phase 6)

### Public address (`APP_PUBLIC_URL`)

One setting names the app's address: `APP_PUBLIC_URL=https://example.com` (scheme + host, no path). Nothing else in the code or
the configuration contains a domain. It is used for:

- **invitation links** (`/api/space/invites`, `/api/admin/spaces`): the response carries an absolute `url` built from it. Without
  the variable the link is built by the browser from the address the owner is browsing (`path` is always returned too);
- the **default of `APP_ALLOWED_ORIGINS`** and so the **bucket CORS rule**: if `APP_ALLOWED_ORIGINS` is not set the origin of
  `APP_PUBLIC_URL` is used. Setting `APP_ALLOWED_ORIGINS` explicitly (comma separated) wins;
- the optional **redirect** (`REDIRECT_TO_PUBLIC_URL=true`, default off): GET/HEAD *page* requests that arrive on a
  `*.up.railway.app` host get a `301` to `APP_PUBLIC_URL` with the same path and query. `/api/**` and `/actuator/health/**` are
  never redirected (a POST must not turn into a GET, and Railway's health probe uses the platform host);
- the **cookie's `Secure` flag**: an `https://` address keeps the default (`Secure`), an `http://` address (local / closed test network)
  turns it off, since a `Secure` cookie is never sent back over http. An explicit `COOKIE_SECURE` always wins; a startup warning
  appears when `APP_PUBLIC_URL` and `COOKIE_SECURE` contradict each other.

The session cookie is *host only* (no `Domain` attribute), `HttpOnly`, `SameSite=Lax`, so it needs no domain setting; the Content-Security-Policy uses `'self'`, which is relative to whatever host served the page. Both are covered by
`PublicUrlTest` (CSP header on the custom domain, redirect rules, invite URL) and by the browser smoke test.

#### Moving to a custom domain, in this order

1. **Add the domain** in Railway: service -> Settings -> Networking -> Custom Domain. Railway shows the DNS record(s) to create.
2. **Create the DNS records** at the registrar / DNS provider exactly as shown (for a bare domain use an ALIAS/ANAME or
   Cloudflare's CNAME flattening). Wait until Railway shows the domain as active and the certificate as issued. (With Cloudflare
   in front: SSL mode "Full (strict)".)
3. **Set the variables** on the app service and redeploy:
   - `APP_PUBLIC_URL=https://example.com`
   - `APP_ALLOWED_ORIGINS=https://example.com,https://<old>.up.railway.app` (temporarily: the old address must still be allowed
     to upload until everybody has moved). Check the log: `Public URL https://example.com ...` and
     `Bucket CORS configured for origins [...]`.
4. **Try it** on `https://example.com`: sign in (sessions belong to the host, everybody has to sign in once on the new address),
   upload a photo (this proves the bucket CORS rule), create a partner invitation and check that the link starts with the new
   address.
5. **Tell the other users** the new address and update bookmarks / home-screen shortcuts.
6. **Turn the redirect on**: `REDIRECT_TO_PUBLIC_URL=true`, redeploy. Old page links now answer `301` to the new domain; the API and
   the health probe on the Railway host keep working. (Leave Railway's healthcheck path at `/actuator/health/liveness`.)
7. **Clean up**: remove `APP_ALLOWED_ORIGINS` (so only the new origin is derived) and redeploy. Invitation links that were created
   before the move keep working: on the old host they are redirected, path included.

### Backup (second bucket)

Optional but recommended. Any S3-compatible provider works (the code only uses `ListObjectsV2`, `PutObject`, `DeleteObject`);
**Cloudflare R2** is a good fit (no egress fees). Leave the variables unset and backup is simply off (one `Backup is OFF` warning
at startup).

| Variable | Value |
| --- | --- |
| `BACKUP_S3_ENDPOINT` | e.g. R2: `https://<account id>.r2.cloudflarestorage.com` |
| `BACKUP_S3_BUCKET` | a *different* bucket from the media bucket, ideally at another provider |
| `BACKUP_S3_ACCESS_KEY_ID` / `BACKUP_S3_SECRET_ACCESS_KEY` | an access key limited to that bucket (object read + write) |
| `BACKUP_S3_REGION` | `auto` (default) for R2 |
| `BACKUP_S3_PATH_STYLE` | `false` (default); `true` for MinIO-like servers |

Every night at 04:00 (Europe/Istanbul, after the 03:30 trash purge) the app runs, one after the other:

- **database**: `pg_dump --format=custom` -> `db/YYYY-MM-DD.dump`; the newest 14 days are kept, older dated dumps are deleted.
  The image contains `postgresql-client-17` from the PostgreSQL apt repository (`ARG PG_CLIENT_MAJOR` in the `Dockerfile`; the
  build prints the version and fails if it is not that major). **`pg_dump` must be at least as new as the database server**:
  raise `PG_CLIENT_MAJOR` before upgrading the Railway Postgres. The password reaches `pg_dump` through `PGPASSWORD`, never
  through the command line.
- **media**: the **originals and album songs only** (`spaces/...` keys, copied one-to-one; thumbnails, display images and loops are
  rebuilt by the queue). Incremental: an object that is already at the target with the same key and size is skipped. Copies are
  streamed from the media bucket to the target (nothing is loaded into memory). Items in the trash are backed up like everything
  else. When the trash purge removes an original (or a song is replaced / removed) the copy at the target stays **30 more days**
  (table `purged_object`), then the nightly run deletes it there.

The **admin screen** (`/admin`) shows, for media and database, the time of the last run, its status (successful / failed),
the number of objects at the target and their total size, a failure message, "Şimdi yedekle" (`POST /api/admin/backup/run`) and
"Tümünü yeniden işle". A run with an unreadable object is marked failed but still copies everything else; the log has the key.

#### Restore

Rehearse this once before you need it.

1. Stop writes: scale the app service to zero (or just stop it).
2. **Database** (an empty database, `pg_restore` of the same or a newer major than the dump):
   ```bash
   # download the newest dump (R2 example; any S3 client works)
   aws s3 cp s3://<backup bucket>/db/2030-01-20.dump ./restore.dump --endpoint-url https://<account id>.r2.cloudflarestorage.com
   pg_restore --no-owner --no-privileges --dbname "$DATABASE_URL" restore.dump
   ```
   Flyway's history table is part of the dump, so the app starts normally afterwards. On a database that already has tables add
   `--clean --if-exists`.
3. **Media**: copy the `spaces/` prefix from the backup bucket into the (new) media bucket, **keeping the keys unchanged**
   (rclone copies between two providers directly):
   ```bash
   rclone copy backup:<backup bucket>/spaces media:<media bucket>/spaces --transfers 8 --progress
   ```
4. Start the app and, as the admin, click **"Tümünü yeniden işle"** on `/admin` (or `POST /api/admin/reprocess-all`).
   Thumbnails, display images and loops are not in the backup: every live photo and video is put back in the processing
   queue under the normal fair-queue rule and gets new variants. Until its turn an item shows the "developing" placeholder.
   The same button is useful after a pipeline improvement.
5. Check a few albums, the quota on `/admin` and the music of an album.

### Android Motion Photo

A JPEG taken as a Motion Photo carries a short MP4. The photo worker looks for it only when the file says so (XMP
`GCamera:MotionPhoto="1"` / `GCamera:MicroVideo="1"`, or the Samsung `MotionPhoto_Data` tag), takes the offset from the XMP
(`Item:Length` of the `MotionPhoto` item, `MicroVideoOffset`), checks that an MP4 header (`ftyp`) really is there, and otherwise
searches for one. The end of the video is found by walking its boxes, so a Samsung trailer is cut off. The clip then goes
through the normal video pipeline (HDR tone mapping, boomerang, poster). The media stays an `IMAGE`; `loopUrl` / `posterUrl` are
filled. In the UI the polaroid plays the loop over the still (under the same "at most 6 playing" rule as videos; not at all with
reduced motion) and the lightbox shows the loop over the large still. A broken offset or video never fails the photo: it is
delivered as an ordinary still. Photos processed before this phase get their loop after **"Tümünü yeniden işle"**.

### Request limits

Besides the failure locks (5 wrong passwords lock an e-mail for 15 minutes from any address; 5 wrong invitation tokens lock an
address) there are fixed-window request limits (`app.rate-limit.*`, in memory, one instance): **login** 30 attempts per address
per 10 minutes; **upload start** (`POST /api/albums/{id}/uploads`, up to 50 files each) 120 per user and 300 per address per hour.
Over the limit the API answers `429`. The address is the rightmost `X-Forwarded-For` entry (the one the platform router appends;
anything the client sends is to its left).

### Final checks

- **Dependencies**: `npm audit --omit=dev` (0 vulnerabilities) and an OSV scan of the Maven dependency tree
  (`osv-scanner scan source pom.xml`); the Tomcat and Jackson versions are pinned in `pom.xml` (`tomcat.version`,
  `jackson-bom.version`) to the fixed releases. Re-run both before a release.
- **Logs**: `LogHygieneTest` runs login, invitation, upload start and error flows with the application logger at DEBUG and fails if a
  password, invitation token, session cookie, presigned signature or storage secret appears in a log line, and scans the source for
  log statements that pass such values.
- **Error pages**: unknown addresses and albums of other spaces show a Turkish 404 page, render errors a Turkish error page, both in
  the look of the current theme (`components/ErrorScreen.tsx`, `ErrorBoundary.tsx`). The server still answers `200` for these SPA
  routes (the React router decides); API errors keep their proper status codes.
- **Browser smoke test**: see [e2e/README.md](e2e/README.md).
