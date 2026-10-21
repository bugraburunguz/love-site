# syntax=docker/dockerfile:1

# ---- 1. Frontend build ----
FROM node:22-slim AS frontend
WORKDIR /frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

# ---- 2. Backend build (React build is bundled as static resources) ----
FROM maven:3.9-eclipse-temurin-21 AS backend
WORKDIR /backend
COPY backend/pom.xml backend/mvnw ./
COPY backend/.mvn ./.mvn
RUN chmod +x mvnw && ./mvnw -B -q dependency:go-offline
COPY backend/src ./src
COPY --from=frontend /frontend/dist ./src/main/resources/static
RUN ./mvnw -B -q -DskipTests package

# ---- 3. Render driver (Node + playwright-core; the Chromium itself is installed in the runtime image) ----
FROM node:22-slim AS renderer
WORKDIR /renderer
COPY renderer/package.json renderer/package-lock.json ./
RUN npm ci --omit=dev
COPY renderer/driver.mjs ./

# ---- 4. Runtime: JRE + media tools + headless Chromium for the exports ----
# Pinned to Ubuntu 24.04 (noble): Playwright (the export renderer) does not support newer Ubuntu releases yet
FROM eclipse-temurin:21-jre-noble
# pg_dump must be at least as new as the Postgres server it dumps (the nightly database backup). The distro package is
# older than the server Railway runs, so the client comes from the PostgreSQL apt repository. Bump PG_CLIENT_MAJOR together
# with the database version.
ARG PG_CLIENT_MAJOR=17
# libheif-plugin-libde265 is the HEVC decoder libvips needs for iPhone HEIC photos (only "recommended", so it must be named).
RUN apt-get update \
    && apt-get install -y --no-install-recommends ffmpeg libvips-tools libheif1 libheif-plugin-libde265 ca-certificates postgresql-common \
    && /usr/share/postgresql-common/pgdg/apt.postgresql.org.sh -y \
    && apt-get install -y --no-install-recommends postgresql-client-${PG_CLIENT_MAJOR} \
    && rm -rf /var/lib/apt/lists/*
# Fail the build (not the first upload) when a tool the pipeline relies on is missing.
RUN set -e; \
    fail() { echo "BUILD CHECK FAILED: $1"; exit 1; }; \
    ffmpeg -hide_banner -filters | grep -q ' zscale '  || fail "ffmpeg has no zscale filter (needed for HDR tone mapping)"; \
    ffmpeg -hide_banner -filters | grep -q ' tonemap ' || fail "ffmpeg has no tonemap filter"; \
    ffmpeg -hide_banner -filters | grep -q ' reverse ' || fail "ffmpeg has no reverse filter"; \
    ffmpeg -hide_banner -encoders | grep -q libx264    || fail "ffmpeg has no libx264 encoder"; \
    ffmpeg -hide_banner -encoders | grep -q libwebp    || fail "ffmpeg has no libwebp encoder"; \
    ffprobe -version > /dev/null                       || fail "ffprobe missing"; \
    vipsheader --version > /dev/null                   || fail "vipsheader missing"; \
    vips -l | grep -q heifload                         || fail "vips has no heifload"; \
    find /usr/lib -name 'libheif-libde265.so' | grep -q . || fail "libheif has no HEVC decoder plugin (iPhone HEIC would fail)"
# Print the client version in the build log and fail when it is not the major we asked for.
RUN pg_dump --version | tee /dev/stderr | grep -q "pg_dump (PostgreSQL) ${PG_CLIENT_MAJOR}\." \
    || { echo "BUILD CHECK FAILED: pg_dump is not version ${PG_CLIENT_MAJOR}"; exit 1; }
# Exports (worker role): Node runs the render driver, which drives one headless Chromium (Playwright's headless shell).
# Fonts: Noto covers Turkish letters in fallback fonts, Noto Color Emoji draws emoji in captions in colour. The SPA's own
# fonts (Caveat, Playfair ...) are self-hosted files the page loads itself.
COPY --from=renderer /usr/local/bin/node /usr/local/bin/node
COPY --from=renderer /renderer /app/renderer
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright
RUN apt-get update \
    && apt-get install -y --no-install-recommends fonts-noto-color-emoji fonts-noto-core fonts-dejavu-core fontconfig \
    && node /app/renderer/node_modules/playwright-core/cli.js install --with-deps --only-shell chromium \
    && rm -rf /var/lib/apt/lists/* /root/.cache \
    && chmod -R a+rX /ms-playwright /app/renderer
RUN set -e; \
    fail() { echo "BUILD CHECK FAILED: $1"; exit 1; }; \
    node --version > /dev/null                                   || fail "node missing"; \
    fc-list | grep -qi "Noto Color Emoji"                        || fail "no colour emoji font"; \
    ffmpeg -hide_banner -encoders | grep -q libwebp_anim         || fail "ffmpeg has no libwebp_anim encoder (animated stickers)"; \
    ffmpeg -hide_banner -filters | grep -q ' xfade '             || fail "ffmpeg has no xfade filter (reels transitions)"; \
    vips -l | grep -q webpsave                                   || fail "vips has no webpsave (stickers)"
RUN useradd --system --create-home app
USER app
# Chromium must start as the user the app runs as and draw colour emoji; the build fails otherwise
RUN node /app/renderer/driver.mjs --selftest
WORKDIR /app
COPY --from=backend /backend/target/app.jar app.jar
EXPOSE 8080
# JVM memory: a FIXED heap limit, not a share of the container. A platform container may be allowed several GB; with a
# percentage the heap may grow that far, and G1 keeps what it took. The app needs far less (see docs/reports/ram.md).
# - JAVA_MAX_HEAP: heap limit (default 448m)
# - G1PeriodicGCInterval: an idle process runs a GC every minute and gives unused heap back to the system
# - JAVA_MAX_RAM_PERCENTAGE: optional, the old behaviour (a share of the container) instead of JAVA_MAX_HEAP
# - JAVA_OPTS: replaces all of the flags below
ENV JAVA_MAX_HEAP=448m
ENTRYPOINT ["sh", "-c", "if [ -n \"$JAVA_MAX_RAM_PERCENTAGE\" ]; then HEAP=\"-XX:MaxRAMPercentage=$JAVA_MAX_RAM_PERCENTAGE\"; else HEAP=\"-Xmx$JAVA_MAX_HEAP\"; fi; exec java ${JAVA_OPTS:-$HEAP -Xms64m -Xss512k -XX:MaxMetaspaceSize=192m -XX:ReservedCodeCacheSize=64m -XX:+UseG1GC -XX:G1PeriodicGCInterval=60000 -XX:+ExitOnOutOfMemoryError} -jar app.jar"]
