# syntax=docker/dockerfile:1

# ---- 1. Frontend build ----
FROM node:22-slim AS frontend
WORKDIR /frontend
COPY frontend/package.json frontend/package-lock.json* ./
RUN if [ -f package-lock.json ]; then npm ci; else npm install; fi
COPY frontend/ ./
RUN npm run build

# ---- 2. Backend build (React build is bundled as static resources) ----
FROM maven:3.9-eclipse-temurin-21 AS backend
WORKDIR /backend
COPY backend/pom.xml ./
RUN mvn -B -q dependency:go-offline
COPY backend/src ./src
COPY --from=frontend /frontend/dist ./src/main/resources/static
RUN mvn -B -q -DskipTests package

# ---- 3. Runtime: JRE + media tools for the upcoming media phase ----
FROM eclipse-temurin:21-jre
RUN apt-get update \
    && apt-get install -y --no-install-recommends ffmpeg libvips-tools libheif1 \
    && rm -rf /var/lib/apt/lists/*
RUN useradd --system --create-home app
USER app
WORKDIR /app
COPY --from=backend /backend/target/app.jar app.jar
EXPOSE 8080
ENTRYPOINT ["java", "-XX:MaxRAMPercentage=75", "-jar", "app.jar"]
