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
| `APP_ALLOWED_ORIGINS` | the app's public origin, e.g. `https://love-site.up.railway.app` (comma separated; no trailing slash) |
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

## Müzik kutusu (arka plan müziği)

The bottom-left music box plays one song from the bucket. It only appears when the object `audio/theme` exists, and it only
starts on a tap (never automatically). The file is not part of the repo; put it in the bucket yourself:

```bash
# any S3 client works; with the AWS CLI (credentials = the bucket's access key, region auto)
export AWS_ACCESS_KEY_ID=<S3_ACCESS_KEY_ID> AWS_SECRET_ACCESS_KEY=<S3_SECRET_ACCESS_KEY> AWS_DEFAULT_REGION=auto
aws s3 cp theme.mp3 s3://<S3_BUCKET>/audio/theme --endpoint-url https://t3.storageapi.dev --content-type audio/mpeg
```

Or in the Railway bucket's Files tab create a folder `audio` and upload the file named exactly `theme` (no extension).
`GET /api/settings/music` returns `204` until the object exists, and a presigned URL afterwards. Use music you have the
rights to use.

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
`max-attempts` (3) are explicit, and the optional music lookup has a 4 s total budget. `GET /api/settings/music` answers
`204` (no music) for a missing file *and* for any bucket error, logging `Music lookup failed, answering 204` as a warning.

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
