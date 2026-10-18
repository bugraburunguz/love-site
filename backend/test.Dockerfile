# Image to run the backend tests with the real media tools (ffmpeg, vips, HEIF codecs), same OS as the production image:
#   docker build -t love-site-test -f backend/test.Dockerfile backend
#   docker run --rm -v "$PWD/backend:/w" -v m2cache:/root/.m2 -v /var/run/docker.sock:/var/run/docker.sock \
#     -e TESTCONTAINERS_HOST_OVERRIDE=host.docker.internal -e TESTCONTAINERS_RYUK_DISABLED=true -w /w love-site-test ./mvnw test
FROM eclipse-temurin:21-jdk-noble
RUN apt-get update \
    && apt-get install -y --no-install-recommends ffmpeg libvips-tools libheif1 libheif-plugin-libde265 libheif-plugin-x265 ca-certificates postgresql-common \
    && /usr/share/postgresql-common/pgdg/apt.postgresql.org.sh -y \
    && apt-get install -y --no-install-recommends postgresql-client-17 \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /w
