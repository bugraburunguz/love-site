package com.lovesite.export.render;

import com.lovesite.export.ExportProperties;
import com.lovesite.export.ExportRenderer;
import com.lovesite.export.ExportService.ExportRow;
import com.lovesite.media.processing.ProcessRunner;
import com.lovesite.media.processing.ProcessingProperties;
import com.lovesite.role.RenderPort;
import com.lovesite.storage.StorageService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.text.Normalizer;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.zip.ZipEntry;
import java.util.zip.ZipOutputStream;

/**
 * The real renderer: Chromium draws every scene with the site's own components (SPA route /render/:jobId, data from the
 * loopback render endpoint with a 2-minute token), ffmpeg / vips turn the screenshots into the requested formats.
 *
 * Image sizes: POLAROID long edge 2000 px, STORY 1080 x 1920, POST and CAROUSEL 1080 x 1350, REELS 1080 x 1920 at 30 fps,
 * stickers 512 x 512 (drawn at 2x and scaled down, so captions stay crisp).
 *
 * WhatsApp sticker rules (github.com/WhatsApp/stickers, Android/README.md): exactly 512 x 512 WebP, static <= 100 KB, animated
 * <= 500 KB with frames of at least 8 ms and at most 10 s in total, tray icon 96 x 96 <= 50 KB, 3-30 stickers per pack. Our own
 * limits are stricter: animated at most 10 fps and a 3 s loop, at least 16 px of empty margin.
 */
@Component
public class ChromiumExportRenderer implements ExportRenderer {

    private static final Logger log = LoggerFactory.getLogger(ChromiumExportRenderer.class);

    static final long STATIC_STICKER_MAX = 100 * 1024;
    static final long ANIMATED_STICKER_MAX = 500 * 1024;
    static final long TRAY_MAX = 50 * 1024;
    static final double POLAROID_MOTION_SECONDS = 8;
    static final double STORY_MOTION_SECONDS = 10;

    private final RenderDriver driver;
    private final RenderTokens tokens;
    private final RenderPort port;
    private final StorageService storage;
    private final ExportProperties properties;
    private final ProcessingProperties tools;
    private final Compositor compositor;

    public ChromiumExportRenderer(RenderDriver driver, RenderTokens tokens, RenderPort port, StorageService storage,
                                  ExportProperties properties, ProcessingProperties tools) {
        this.driver = driver;
        this.tokens = tokens;
        this.port = port;
        this.storage = storage;
        this.properties = properties;
        this.tools = tools;
        this.compositor = new Compositor(tools.ffmpeg(), nicePrefix());
    }

    private List<String> nicePrefix() {
        return properties.nice() > 0 && RenderDriver.niceAvailable() ? List.of("nice", "-n", String.valueOf(properties.nice())) : List.of();
    }

    @Override
    @SuppressWarnings("unchecked")
    public Result render(ExportRow job, Path work) throws Exception {
        List<Map<String, Object>> scenes = (List<Map<String, Object>>) job.payload().get("scenes");
        Map<String, Object> media = (Map<String, Object>) job.payload().get("media");
        double dpr = "STICKER_PACK".equals(job.type()) ? 2 : 1;
        List<Path> pngs = new ArrayList<>();
        for (int i = 0; i < scenes.size(); i++) pngs.add(work.resolve(String.format("scene-%02d.png", i)));
        String url = port.baseUrl() + "/render/" + job.id() + "?token=" + tokens.issue(job.id());
        long t0 = System.nanoTime();
        List<RenderDriver.SceneInfo> shots = driver.render(url, dpr, pngs, properties.pageTimeout());
        long kb = driver.residentKb();
        log.info("Rendered {} scene(s) of export {} in {} ms{}", shots.size(), job.id(), (System.nanoTime() - t0) / 1_000_000,
                kb > 0 ? " (render driver RSS " + kb / 1024 + " MB)" : "");
        for (RenderDriver.SceneInfo s : shots) {
            if (s.overflow()) log.warn("Export {}: a caption overflowed its strip", job.id());
            // scenes with video windows were shot twice with two key colours: turn that into a real alpha channel
            if (Boolean.TRUE.equals(s.info().get("keyed"))) {
                Path second = s.png().resolveSibling(s.png().getFileName().toString().replace(".png", ".key2.png"));
                Matte.apply(s.png(), second, s.png());
            }
        }

        Videos videos = new Videos(media, work);
        String shortId = job.id().toString().substring(0, 8);
        List<Map<String, Object>> meta = new ArrayList<>();
        for (RenderDriver.SceneInfo s : shots) {
            Map<String, Object> m = new java.util.LinkedHashMap<>();
            m.put("width", s.width() * dpr);
            m.put("height", s.height() * dpr);
            m.put("overflow", s.overflow());
            if (s.info().get("polaroid") != null) m.put("polaroid", s.info().get("polaroid"));
            m.put("videos", s.videos().size());
            meta.add(m);
        }
        Result result = switch (job.type()) {
            case "POLAROID" -> polaroid(job, shots.get(0), scenes.get(0), videos, work, shortId);
            case "STORY", "POST" -> story(job, shots.get(0), scenes.get(0), videos, work, shortId);
            case "CAROUSEL" -> carousel(shots, work);
            case "REELS" -> reels(job, shots, scenes, videos, work);
            case "STICKER_PACK" -> stickers(shots, scenes, videos, work, dpr);
            default -> throw new IOException("unknown export type " + job.type());
        };
        return result.withMeta(meta);
    }

    // ------------------------------------------------------------------ types

    private Result polaroid(ExportRow job, RenderDriver.SceneInfo shot, Map<String, Object> scene, Videos videos, Path work, String id)
            throws IOException, InterruptedException {
        if (Boolean.TRUE.equals(scene.get("motion"))) {
            Path mp4 = work.resolve("polaroid-" + id + ".mp4");
            moving(shot, videos, 1, POLAROID_MOTION_SECONDS, mp4);
            return new Result(List.of(new OutputFile(mp4, mp4.getFileName().toString(), "video/mp4", "main")), List.of());
        }
        if ("page".equals(scene.get("background"))) {
            Path jpg = jpeg(shot.png(), work.resolve("polaroid-" + id + ".jpg"));
            return new Result(List.of(new OutputFile(jpg, jpg.getFileName().toString(), "image/jpeg", "main")), List.of());
        }
        Path png = work.resolve("polaroid-" + id + ".png");
        Files.move(shot.png(), png);
        return new Result(List.of(new OutputFile(png, png.getFileName().toString(), "image/png", "main")), List.of());
    }

    private Result story(ExportRow job, RenderDriver.SceneInfo shot, Map<String, Object> scene, Videos videos, Path work, String id)
            throws IOException, InterruptedException {
        String name = ("STORY".equals(job.type()) ? "story-" : "post-") + id;
        if (Boolean.TRUE.equals(scene.get("motion"))) {
            Path mp4 = work.resolve(name + ".mp4");
            moving(shot, videos, 1, STORY_MOTION_SECONDS, mp4);
            return new Result(List.of(new OutputFile(mp4, mp4.getFileName().toString(), "video/mp4", "main")), List.of());
        }
        Path jpg = jpeg(shot.png(), work.resolve(name + ".jpg"));
        return new Result(List.of(new OutputFile(jpg, jpg.getFileName().toString(), "image/jpeg", "main")), List.of());
    }

    private Result carousel(List<RenderDriver.SceneInfo> shots, Path work) throws IOException, InterruptedException {
        List<OutputFile> files = new ArrayList<>();
        for (int i = 0; i < shots.size(); i++) {
            Path jpg = jpeg(shots.get(i).png(), work.resolve(String.format("carousel-%02d.jpg", i + 1)));
            files.add(new OutputFile(jpg, jpg.getFileName().toString(), "image/jpeg", "main"));
        }
        Path zip = work.resolve("carousel.zip");
        zip(zip, files.stream().map(f -> Map.entry(f.name(), f.path())).toList(), null);
        files.add(new OutputFile(zip, "carousel.zip", "application/zip", "zip"));
        return new Result(files, List.of());
    }

    @SuppressWarnings("unchecked")
    private Result reels(ExportRow job, List<RenderDriver.SceneInfo> shots, List<Map<String, Object>> scenes, Videos videos, Path work)
            throws IOException, InterruptedException {
        Map<String, Object> timing = (Map<String, Object>) job.payload().get("timing");
        double transition = ((Number) timing.get("transition")).doubleValue();
        int n = shots.size();
        double[] dur = new double[n];
        Path[] source = new Path[n];
        boolean[] still = new boolean[n];
        for (int i = 0; i < n; i++) {
            String kind = (String) scenes.get(i).get("kind");
            dur[i] = ((Number) timing.get(switch (kind) {
                case "cover" -> "cover";
                case "closing" -> "closing";
                default -> "media";
            })).doubleValue();
            RenderDriver.SceneInfo shot = shots.get(i);
            if (Boolean.TRUE.equals(scenes.get(i).get("motion")) && !shot.videos().isEmpty()) {
                Path clip = work.resolve(String.format("clip-%02d.mp4", i));
                run(compositor.scene(shot.png(), (int) Math.round(shot.width()), (int) Math.round(shot.height()), windows(shot, videos, 1),
                        dur[i], 30, false, Compositor.Output.MP4_INTERMEDIATE, 0, clip));
                source[i] = clip;
                still[i] = false;
            } else {
                source[i] = shot.png();
                still[i] = true;
            }
        }
        // body of scene i, then the slide from i to i+1, ... (each segment encoded with the same settings, joined without re-encoding)
        List<Path> segments = new ArrayList<>();
        double total = 0;
        for (int i = 0; i < n; i++) {
            double from = i == 0 ? 0 : transition;
            double to = i == n - 1 ? dur[i] : dur[i] - transition;
            if (to - from > 0.01) {
                Path body = work.resolve(String.format("seg-%02d-a.mp4", i));
                run(compositor.body(Compositor.input(source[i], still[i], from, to - from), to - from, body));
                segments.add(body);
                total += to - from;
            }
            if (i < n - 1) {
                Path trans = work.resolve(String.format("seg-%02d-b.mp4", i));
                run(compositor.transition(Compositor.input(source[i], still[i], dur[i] - transition, transition),
                        Compositor.input(source[i + 1], still[i + 1], 0, transition), transition, "smoothleft", trans));
                segments.add(trans);
                total += transition;
            }
        }
        Path list = work.resolve("segments.txt");
        StringBuilder lines = new StringBuilder();
        for (Path s : segments) lines.append("file '").append(s.toAbsolutePath()).append("'\n");
        Files.writeString(list, lines.toString());
        Path music = null;
        List<String> notes = new ArrayList<>();
        String musicKey = (String) job.payload().get("musicKey");
        if (musicKey != null) {
            music = work.resolve("music");
            storage.download(musicKey, music);
        } else if (Boolean.TRUE.equals(job.params().get("includeAlbumMusic"))) {
            notes.add("Albümün müziği olmadığı için video sessiz.");
        }
        Map<String, Object> album = (Map<String, Object>) job.payload().get("album");
        Path out = work.resolve("reels-" + slug((String) album.get("title")) + ".mp4");
        run(compositor.join(list, music, total, out));
        return new Result(List.of(new OutputFile(out, out.getFileName().toString(), "video/mp4", "main")), notes);
    }

    private Result stickers(List<RenderDriver.SceneInfo> shots, List<Map<String, Object>> scenes, Videos videos, Path work, double dpr)
            throws IOException, InterruptedException {
        List<Map.Entry<String, Path>> zipEntries = new ArrayList<>();
        List<OutputFile> files = new ArrayList<>();
        List<String> notes = new ArrayList<>();
        Path firstPng = null;
        for (int i = 0; i < shots.size(); i++) {
            RenderDriver.SceneInfo shot = shots.get(i);
            String n = String.format("%02d", i + 1);
            Path png = work.resolve("sticker-" + n + ".png");
            vips("resize", shot.png().toString(), png.toString(), String.valueOf(1 / dpr));
            if (firstPng == null) firstPng = png;
            Path webp = null;
            if (Boolean.TRUE.equals(scenes.get(i).get("motion")) && !shot.videos().isEmpty()) {
                webp = animatedSticker(shot, videos, dpr, work.resolve("sticker-" + n + "-anim.webp"));
                if (webp == null) notes.add(n + ". sticker hareketli haliyle 500 KB'a sığmadı, sabit olarak eklendi.");
            }
            if (webp == null) webp = staticSticker(png, work.resolve("sticker-" + n + ".webp"));
            zipEntries.add(Map.entry("stickers/" + n + ".webp", webp));
            zipEntries.add(Map.entry("png/" + n + ".png", png));
            files.add(new OutputFile(png, "sticker-" + n + ".png", "image/png", "png"));
        }
        Path tray = work.resolve("tray.png");
        vips("thumbnail", firstPng.toString(), tray + "[compression=9,strip]", "96", "--height", "96", "--size", "force");
        if (Files.size(tray) > TRAY_MAX) vips("copy", firstPng.toString(), tray + "[compression=9,palette,strip]");
        zipEntries.add(Map.entry("tray.png", tray));
        Path zip = work.resolve("whatsapp-sticker-paketi.zip");
        zip(zip, zipEntries, readme(shots.size()));
        files.add(0, new OutputFile(zip, zip.getFileName().toString(), "application/zip", "zip"));
        return new Result(files, notes);
    }

    // ------------------------------------------------------------------ helpers

    /** Static WebP: quality is lowered step by step until the file fits WhatsApp's 100 KB. */
    Path staticSticker(Path png, Path out) throws IOException, InterruptedException {
        for (int q = 90; q >= 20; q -= 10) {
            vips("copy", png.toString(), out + "[Q=" + q + ",strip,alpha_q=90]");
            if (Files.size(out) <= STATIC_STICKER_MAX) return out;
        }
        vips("copy", png.toString(), out + "[Q=10,strip,alpha_q=50]");
        if (Files.size(out) > STATIC_STICKER_MAX) throw new IOException("static sticker does not fit 100 KB");
        return out;
    }

    /** Animated WebP: 10 fps, a 3 s boomerang; null when it cannot be made to fit 500 KB (the caller falls back to static). */
    Path animatedSticker(RenderDriver.SceneInfo shot, Videos videos, double dpr, Path out) throws IOException, InterruptedException {
        int w = (int) Math.round(shot.width() * dpr);
        int h = (int) Math.round(shot.height() * dpr);
        for (int q = 75; q >= 20; q -= 11) {
            run(compositor.scene(shot.png(), w, h, windows(shot, videos, dpr), 3.0, 10, true, Compositor.Output.WEBP_ANIM, q, out));
            if (Files.size(out) <= ANIMATED_STICKER_MAX) return out;
        }
        return null;
    }

    private void moving(RenderDriver.SceneInfo shot, Videos videos, double dpr, double seconds, Path out) throws IOException, InterruptedException {
        run(compositor.scene(shot.png(), (int) Math.round(shot.width() * dpr), (int) Math.round(shot.height() * dpr),
                windows(shot, videos, dpr), seconds, 30, false, Compositor.Output.MP4, 0, out));
    }

    @SuppressWarnings("unchecked")
    private List<Compositor.Window> windows(RenderDriver.SceneInfo shot, Videos videos, double dpr) throws IOException {
        List<Compositor.Window> result = new ArrayList<>();
        for (Map<String, Object> v : shot.videos()) {
            Path file = videos.loop((String) v.get("mediaId"));
            if (file == null) continue;
            Map<String, Object> f = (Map<String, Object>) v.get("filter");
            String colour = f == null ? "" : ColorMatrix.filter(num(f, "sepia", 0), num(f, "saturate", 1), num(f, "contrast", 1), num(f, "brightness", 1));
            result.add(new Compositor.Window(file, num(v, "cx", 0) * dpr, num(v, "cy", 0) * dpr, num(v, "w", 0) * dpr, num(v, "h", 0) * dpr,
                    num(v, "angle", 0), colour));
        }
        return result;
    }

    private static double num(Map<String, Object> m, String key, double fallback) {
        Object v = m.get(key);
        return v instanceof Number n ? n.doubleValue() : fallback;
    }

    /** The loop files of the job's media, downloaded once. */
    private final class Videos {
        private final Map<String, Object> media;
        private final Path work;
        private final Map<String, Path> files = new HashMap<>();

        Videos(Map<String, Object> media, Path work) {
            this.media = media;
            this.work = work;
        }

        @SuppressWarnings("unchecked")
        Path loop(String mediaId) {
            return files.computeIfAbsent(mediaId, id -> {
                Object m = media.get(id);
                String key = m instanceof Map<?, ?> map ? (String) ((Map<String, Object>) map).get("loopKey") : null;
                if (key == null) return null;
                Path target = work.resolve("loop-" + id.substring(0, 8) + ".mp4");
                storage.download(key, target);
                return target;
            });
        }
    }

    private Path jpeg(Path png, Path out) throws IOException, InterruptedException {
        vips("copy", png.toString(), out + "[Q=92,strip]");
        return out;
    }

    private void vips(String... args) throws IOException, InterruptedException {
        List<String> c = new ArrayList<>(nicePrefix());
        c.add(tools.vips());
        c.addAll(List.of(args));
        ProcessRunner.runChecked(c, properties.toolTimeout());
    }

    private void run(List<String> command) throws IOException, InterruptedException {
        ProcessRunner.runChecked(command, properties.toolTimeout());
    }

    static void zip(Path zip, List<Map.Entry<String, Path>> entries, String readme) throws IOException {
        try (OutputStream os = Files.newOutputStream(zip); ZipOutputStream out = new ZipOutputStream(os, StandardCharsets.UTF_8)) {
            if (readme != null) {
                out.putNextEntry(new ZipEntry("OKU.txt"));
                out.write(readme.getBytes(StandardCharsets.UTF_8));
                out.closeEntry();
            }
            for (Map.Entry<String, Path> e : entries) {
                out.putNextEntry(new ZipEntry(e.getKey()));
                Files.copy(e.getValue(), out);
                out.closeEntry();
            }
        }
    }

    static String readme(int count) {
        return """
                WhatsApp sticker paketi (%d sticker)
                ===================================

                Bu klasörde:
                - stickers/  : WhatsApp'ın kurallarına uygun 512x512 WebP sticker'lar
                - tray.png   : paketin simgesi (96x96)
                - png/       : aynı sticker'ların şeffaf PNG halleri

                Paketi WhatsApp'a eklemek:
                1. Telefonuna bir "sticker maker" (sticker oluşturucu) uygulaması kur.
                2. Uygulamada yeni bir paket oluştur ve "içe aktar" ile stickers/ klasöründeki dosyaları seç
                   (bazı uygulamalar zip dosyasını doğrudan da kabul eder).
                3. Paket simgesi istenirse tray.png'yi seç.
                4. "WhatsApp'a ekle" de.

                Tek bir sticker için:
                png/ klasöründeki bir PNG'yi WhatsApp'ta bir sohbette sticker menüsündeki
                "Oluştur" (sticker oluşturucu) ile aç ve kaydet.
                """.formatted(count);
    }

    /** Album title -> safe file name part (Turkish letters to ASCII). */
    static String slug(String title) {
        if (title == null) return "album";
        String t = title.toLowerCase(new Locale("tr")).replace('ı', 'i');
        t = Normalizer.normalize(t, Normalizer.Form.NFD).replaceAll("\\p{M}", "");
        t = t.replaceAll("[^a-z0-9]+", "-").replaceAll("(^-|-$)", "");
        if (t.length() > 40) t = t.substring(0, 40).replaceAll("-$", "");
        return t.isEmpty() ? "album" : t;
    }
}
