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
