# love-site

Private scrapbook-style photo/video album for two people. Phase 1: skeleton (auth, DB, SPA hosting).

- `backend/` Spring Boot 4 (Java 21, Maven) - session auth, Flyway, Postgres
- `frontend/` React + Vite + TypeScript
- Single deployable image: the React build is served by Spring Boot as static resources (no CORS).

## Environment variables

See [.env.example](.env.example). Required in production: `PGHOST`, `PGPORT`, `PGDATABASE`, `PGUSER`, `PGPASSWORD`
and `USER1_*` / `USER2_*` (email, name, password). The app refuses to start if a seed variable is missing.
Users are only created when absent; changing a password env var later does not change an existing password.

## Local development

```bash
# Postgres
docker run -d --name lovesite-db -e POSTGRES_USER=lovesite -e POSTGRES_PASSWORD=lovesite -e POSTGRES_DB=lovesite -p 5432:5432 postgres:17

# Backend (profile "local" has DB and seed-user defaults, see application-local.yml)
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

Health: `/actuator/health` is public and includes a `mediaTools` check (ffmpeg, vips, HEIF support); it reports
DOWN if a tool is missing. For Railway's healthcheck path use `/actuator/health/liveness` so a missing media tool
does not mark the deploy as failed. Other actuator endpoints require authentication.

## Auth API

- `POST /api/auth/login` `{email, password}` -> user; 429 after 5 failures for an email (15 min lock, in-memory)
- `POST /api/auth/logout` -> 204
- `GET /api/auth/me` -> user or 401

CSRF: the `XSRF-TOKEN` cookie is set on every response; send it back as the `X-XSRF-TOKEN` header on non-GET calls.
