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

# ---- 3. Runtime: JRE + media tools for the processing pipeline ----
FROM eclipse-temurin:21-jre
# libheif-plugin-libde265 is the HEVC decoder libvips needs for iPhone HEIC photos (only "recommended", so it must be named).
RUN apt-get update \
    && apt-get install -y --no-install-recommends ffmpeg libvips-tools libheif1 libheif-plugin-libde265 \
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
RUN useradd --system --create-home app
USER app
WORKDIR /app
COPY --from=backend /backend/target/app.jar app.jar
EXPOSE 8080
ENTRYPOINT ["java", "-XX:MaxRAMPercentage=75", "-jar", "app.jar"]
