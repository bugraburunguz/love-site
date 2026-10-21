# Browser smoke test (Playwright)

One test walks through the journey of a new couple in a real browser against the **production image** (the root `Dockerfile`:
React build served by Spring, ffmpeg / vips / pg_dump from the image), with Postgres and an S3-compatible server
(CloudServer) standing in for the bucket:

1. the platform admin signs in and creates two spaces (A and B); the invitation links must start with `APP_PUBLIC_URL`;
2. user A registers through the link (and the used link no longer works);
3. user A creates an album for **each of the six themes** and opens each one;
4. a photo and a video are uploaded to one album and both reach `READY`;
5. the page is edited: `FREE` template, a sticker is added and stored;
6. album music is uploaded;
7. user B (other space) gets `404` from the API for A's album and sees the Turkish 404 page; unknown addresses show it too;
8. the public privacy pages (`/gizlilik`, `/hesap-silme`) open without a session, and user B (the only member of space B)
   deletes their account from the shelf menu: back on the login page, the session is gone, the account cannot sign in again
   and user A still has every album;
9. the readiness probe answers and the Content-Security-Policy contains the bucket origin;
10. **Phase 7 (`exports.py`)**: the stack runs as two services like production (`app` = `APP_ROLE=web`, `worker` =
   `APP_ROLE=worker`). The worker answers only its health check, its loopback render port is unreachable, `/internal/**` and
   `/render/**` do not exist on the web service. A spread with two page themes keeps paper and ambient canvas inside each page.
   Every export type is made and checked from its bytes (PNG alpha + 2000 px, JPEG sizes, ffprobe: H.264, 30 fps, 1080 x 1920,
   durations, no audio by default / AAC with the album song, the video really visible in its window, WebP stickers 512 x 512
   ≤ 100 KB / animated ≤ 500 KB, tray 96 x 96 ≤ 50 KB), emoji in colour and no caption overflow, "same content" is not
   rendered twice, each theme's POLAROID and STORY are compared with the same polaroid on the site (mean pixel difference,
   thresholds in `exports.py`), the lightbox menu / share dialog / export card, a phone emulation, and the API latency while an
   export renders. Numbers go to `output/exports/report.json`.

The test also fails when the browser reports a Content-Security-Policy violation or an uncaught page error at any point.
Screenshots (admin, shelf, one per theme, album with media, edit mode, 404 page) are written to `e2e/output/` (git-ignored).
The test media are generated with ffmpeg inside the runner; nothing personal is involved.

## Run it

Needs Docker with the compose plugin (the first run downloads images and builds the app, ~5-10 minutes; later runs are faster).

```bash
./e2e/run.sh            # build, start, run the test, remove everything again
KEEP=1 ./e2e/run.sh     # leave the stack running afterwards: http://localhost:18081, admin@e2e.test / e2e-admin-password
```

Exit code `0` means the whole journey worked. On failure the last lines of the app log are printed.

## Files

| File | Purpose |
| --- | --- |
| `docker-compose.yml` | `postgres`, `s3` (+ `s3-init` creates the bucket), `app` (production image), `runner` (profile `run`) |
| `run.sh` | builds and starts the stack, runs the runner, tears down |
| `runner.sh` | inside the Playwright container: installs ffmpeg and `playwright==1.55.0`, waits for the app, runs `smoke.py` |
| `smoke.py` | the test (Playwright sync API, Python) |
| `exports.py` | Phase 7 checks; run alone with `SCRIPT=exports.py docker compose --profile run run --rm runner` (stack started) |

The stack uses `APP_PUBLIC_URL=http://app:8080`, so the run also proves that invite links and the bucket CORS rule really derive
from that one variable. Credentials in `docker-compose.yml` are throw-away values for this closed network.
