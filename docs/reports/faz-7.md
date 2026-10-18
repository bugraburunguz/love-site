# Faz 7 raporu — dışa aktarma (polaroid, Instagram formatları, WhatsApp sticker paketi), web/worker ayrımı, sayfa bazında tema

## Değişiklikler

**Sayfa bazında tema (ek)** — ayrıntı `docs/reports/faz-5b.md` "Ek" bölümünde.
- `V11__page_theme.sql`: `page.theme_id` (null = albüm teması). `PATCH /api/pages/{id}` `themeId` (açık `null` → albüm teması; alan yoksa dokunulmaz), `POST /api/albums/{id}/pages/theme` (tek transaction, sürüm kontrolü, başka alanın sayfası listede → tüm istek 404, hiçbir şey değişmez).
- Frontend: `themes/pageTheme.ts` (çözümleme, kapsam), `cssVars` albüm/sayfa diye ikiye ayrıldı, `PageCanvas` her sayfayı kendi temasının `ThemeContext`'i ve değişkenleriyle çiziyor, otomatik süsleme (tutturucu/sticker) sayfa temasından. Ambient artık tek tam ekran canvas değil: **her sayfanın kendi canvas'ı**, sayfanın `overflow:hidden` alanında (yayında yarı parçacık). Hover burst sayfa-yerel. Lightbox fotoğrafı sayfasının temasıyla gösteriyor. Düzenleme panelinde "Sayfa teması" sekmesi (örnek sayfalar + "Albüm teması", kapsam: Bu yayına uygula / Sadece bu sayfa / Bu sayfa ve sonrakiler (onaylı); mobilde "Bu ve karşı sayfa"). Albümdeki tüm sayfa temalarının fontları dinamik yükleniyor.

**Servis ayrımı (`APP_ROLE`)**
- `role/AppRole`, `role/Roles` (TEK tablo, aşağıda), `role/RoleWebConfig` (127.0.0.1'e bağlı ek Tomcat connector'ı + en önde çalışan rol kapısı filtresi), `role/RenderPort` (gerçek port; testlerde 0 = boş port).
- Her zamanlanmış iş / poller / açılış görevi `roles.runs(Job.X)` soruyor. `APP_ROLE` boşsa her şey tek süreçte (eski davranış).
- Admin "Şimdi yedekle": web servisi iş çalıştırmadığı için `ops_request` satırı yazıyor, worker'daki `OpsRequestPoller` ~5 sn içinde başlatıyor. `markInterruptedRuns` yalnızca worker'da (web yeniden başlarken worker'ın çalışan yedeğini "başarısız" işaretlemesin).
- `Dockerfile`: runtime **Ubuntu 24.04'e sabitlendi** (`eclipse-temurin:21-jre-noble`; `21-jre` artık 26.04 ve Playwright desteklemiyor), Node 22 + playwright-core 1.55 + Chromium headless shell, `fonts-noto-core`, `fonts-noto-color-emoji`, `fonts-dejavu-core`. Build, Chromium'un `app` kullanıcısıyla açıldığını ve emojiyi **renkli** çizdiğini (`driver.mjs --selftest`) ve ffmpeg'de `libwebp_anim`/`xfade`, vips'te `webpsave` olduğunu doğrulamazsa düşüyor. JVM bellek oranı `JAVA_MAX_RAM_PERCENTAGE` ile ayarlanabilir (worker'da 50).

**Export işleri**
- `V12__exports.sql`: `export_job` (id, space_id, requested_by, album_id, type, params, payload, fingerprint, status, result_keys, notes, meta, attempts, last_error, created_at, started_at, finished_at, expires_at), `space.export_served_at`, `ops_request`.
- `export/ExportService`: doğrulama, IDOR (her sorguda `space_id`), payload anlık görüntüsü (medya + depolama anahtarları + medyanın sayfa teması/rengi/kağıdı + caption/tarih + sayfa yerleşimi + albüm başlığı/teması), parmak izi (sha256), aynı içerik → mevcut iş, alan başına 3 aktif, günlük limit.
- `export/ExportQueue`: medya kuyruğuyla aynı yapı ve aynı adalet kuralı (ayrı `export_served_at`), kendi küçük havuzu, bayat iş geri alma, 2 deneme. `export/ExportCleanupJob`: 24 saati dolan işlerin `spaces/{space}/exports/{job}/` altındaki her nesnesi ve satırı siliniyor.
- `export/render/`: `RenderTokens` (HMAC-SHA256, 2 dk, süreç başına rastgele anahtar; web rolünde anahtar yok), `RenderController` (`/internal/render/{job}`, yalnızca loopback connector'ında), `RenderDriver` (tek Node süreci + tek Chromium, nice 10, zaman aşımında öldürüp yeniden başlatma), `ChromiumExportRenderer` (tür başına hat), `Compositor` (ffmpeg komutları), `ColorMatrix` (temanın CSS foto filtresinin ffmpeg karşılığı), `Matte` (iki anahtar renkle çekimden alfa).
- `renderer/driver.mjs` + `package.json` (playwright-core 1.55.0).
- `GET /api/media/{id}/original`: orijinal dosya, `Content-Disposition: attachment` ve orijinal adıyla presigned link (yalnızca kendi alanının canlı medyası).

**Frontend**
- Gizli render route'u `/render/:jobId` (`render/RenderPage.tsx`; router ve oturum olmadan yükleniyor). Sitedeki `PageCanvas`, `LivingPhoto`, `ThemeTape`/`ThemeSticker`, `layoutPage`, kapak (`CoverFace`, raftan ayrıştırıldı) aynen kullanılıyor; yeni olan yalnızca kompozisyon layout'u (`layout/exportLayout.ts`, saf fonksiyonlar) ve render modu bağlamı (`render/renderMode.ts`: görseller hemen ve `display` varyantından, hareketli medya için pencere).
- Lightbox ⋯ menüsü: Polaroid (şeffaf / sayfa arka planlı), Hareketli polaroid (video), Instagram Story, Instagram gönderisi, Orijinal dosya.
- Albüm başlığında ⇪ "Paylaş": Instagram carousel (sayfa seçici), Reels (medya seçici, kapak, albüm müziği + telif uyarısı), WhatsApp sticker paketi (3–30, animasyonlu seçeneği), son 24 saatin listesi, filigran anahtarı. Seçiciler düzenleme modunun tepsi öğelerini (aynı küçük resim ve "seçili" çerçevesi) kullanıyor.
- İlerleme kartları (sol alt, temaya uygun): "Hazırlanıyor…" → "Hazır"; sayfadan çıkılsa da iş sürüyor, geri dönünce liste sunucudan geliyor. Mobilde ve `navigator.canShare({files})` true ise dosya önceden indirilip `File` olarak bellekte tutuluyor, "Paylaş" ancak sonra etkin ve dokununca `navigator.share` hiçbir `await` olmadan çağrılıyor; altında "Galeriye kaydet / İndir". Masaüstünde "İndir". Sticker paketinde zip + genel Türkçe talimat + tekli PNG'ler.
- Caption'larda emoji: sistem emoji fontu için `size-adjust:82%` yerel bir `@font-face` (`Caption Emoji`); kırpılan 3. satırdaki emojinin üst kısmı artık 2. satırın altından görünmüyor (sitede de vardı).

## Scheduled job / poller → rol tablosu (`role/Roles.java`)

| iş | tek süreç (boş) | `web` | `worker` |
|---|:-:|:-:|:-:|
| Public API + SPA | ✓ | ✓ | – (yalnız `/actuator/health/**`) |
| Medya işleme poller'ı (3 sn) + yükleme sonrası kick | ✓ | – | ✓ |
| Export poller'ı (3 sn), düşük öncelik | ✓ | – | ✓ |
| Render uç noktası (127.0.0.1 connector, token) | ✓ | – | ✓ |
| Export temizliği (10 dk; 24 saati dolanlar) | ✓ | – | ✓ |
| Çöp kalıcı silme (03:30) | ✓ | – | ✓ |
| Bekleyen yükleme temizliği (saatlik) | ✓ | – | ✓ |
| Gece yedeği (04:00) + admin isteği (`ops_request`, 5 sn) | ✓ | – | ✓ |
| Açılışta yarım kalmış yedek kaydını "başarısız" yapma | ✓ | – | ✓ |
| Açılışta bucket CORS | ✓ | ✓ | – |
| Açılışta USER1/USER2 + ilk alan | ✓ | ✓ | – |
| Flyway migration | ✓ | ✓ | ✓ (Flyway veritabanı kilidiyle sıralar) |

## Kararlar (gerekçeleriyle)
- **Playwright Java yerine Node sürücüsü.** Java Playwright tüm platformların Node sürücüsünü jar'a gömüyor (~170 MB) ve çalışırken açıyor; zaten Node gerektiğinden tek uzun ömürlü `node driver.mjs` süreci ve satır başına JSON protokolü seçildi. Tek Chromium örneği, iş başına yeni context.
- **Chromium headless shell (`--only-shell`).** Ekran görüntüsü için tam Chrome gerekmiyor; imaj daha küçük.
- **Render portu ayrı connector, 127.0.0.1.** Platform ağının ne olduğundan bağımsız olarak konteyner dışından erişilemez. Rol kapısı kararını istemci başlığından değil isteğin geldiği yerel porttan veriyor.
- **Render token anahtarı süreç başına rastgele.** Token'ı üreten ve doğrulayan aynı worker süreci; yapılandırılacak/sızacak sır yok. Web rolünde anahtar hiç yok.
- **Payload anlık görüntüsü + parmak izi.** "Aynı medya, aynı içerik versiyonu, aynı tema" tanımı: render'ın göreceği her şey (varyant anahtarları `v{n}` içerir, caption, tarih, sayfa teması/rengi/kağıdı, sayfa öğeleri ve sürümleri, albüm başlığı/teması, filigran). Kod değişince eski sonuçları geçersiz kılmak için `RENDER_VERSION` sabiti. Render anlık görüntüden yapıldığı için sonuç istendiği andaki içerikle birebir.
- **Videolu çıktılarda iki anahtar renkli çekim (difference matting).** Ekran görüntüsü üst öğelerin (çerçeve kağıdı, sayfa) arka planında delik açamıyor; pencere macenta ve yeşil boyanıp iki kez çekiliyor, farktan gerçek alfa hesaplanıyor. Köşe süsleri ve kenar yumuşatması doğru korunuyor. Pencereli polaroidlerde film greni ve çerçevedeki kağıt lifi katmanı (multiply) kapatılıyor; bunlar şeffaf zeminde videoyu örten krem bir tül oluşturuyordu. Kayıp: hareketli export'larda çerçevenin çok hafif lif dokusu yok.
- **Video rengi.** Temanın CSS filtresi (`sepia saturate contrast brightness`) 3×3 matris + küçük bir parlaklık kayması olarak ffmpeg'de uygulanıyor (`ColorMatrix`), böylece video sitedeki gibi görünüyor.
- **Reels geçişleri segment segment.** Her sahne gövdesi ve her geçiş (`xfade=smoothleft`, 0.5 sn, sayfa çevirme yönünde kayma) aynı ayarlarla ayrı kodlanıp `concat -c copy` ile birleştiriliyor; tek dev filtergraph'ın onlarca 1080×1920 girdiyi aynı anda bellekte tutmasından kaçınmak için. Sahne süresi 2.5 sn geçişler dahil (xfade anlamında).
- **POLAROID için `motion` parametresi.** "Hareketli polaroid (video)" ayrı menü öğesi; her durağan indirmede video render etmemek için MP4 yalnızca istenince üretiliyor. STORY/POST hareketli medyada varsayılan olarak MP4 (canlı fotoğraf dahil).
- **Export önceliği.** Medya kuyruğundan ayrı havuz (varsayılan 1 iş) + Chromium ve export ffmpeg'leri `nice 10`. Uzun bir render medya işlemeyi bekletmiyor, işletim sistemi CPU'yu önce web isteklerine ve medya işçisine veriyor.
- **Story/Post kompozisyonu.** Polaroid ±1.5–4° dönük, güvenli alanın ortasında; en az bir sticker boş yer bulana kadar polaroid kademeli küçülüyor (%80 → %55). Sticker'lar polaroidin hiçbir yerine (sadece fotoğraf değil, çerçeveye de) değmiyor. Tutturucu çerçevenin üst kenarında, fotoğrafa değmeden.
- **Sticker'lar 2× çizilip 512'ye küçültülüyor** (caption keskin). Kenar boşluğu ≥ 16 px + gölge payı. Statik WebP kalitesi 90'dan aşağı kademeli; animasyonlu WebP 10 fps, 3 sn ileri-geri döngü, kalite 75'ten aşağı; 500 KB'a sığmazsa statiğe düşüp not düşüyor.
- **Filigran**: `APP_PUBLIC_URL` host'u; yoksa isteğin host adı. Polaroid/sticker'da alt şeridin sağ köşesinde, sahnelerde sağ alt köşede (Story'de alt güvenli alanın hemen üstünde), sayfa mürekkep renginde %45 opaklıkla.
- **Orijinal dosya** için yeni uç nokta: spec "mevcut presigned URL" diyordu ama orijinal hiç tarayıcıya verilmiyordu; yalnızca kendi alanının canlı medyası için, `attachment` ve orijinal adla kısa ömürlü link eklendi. README'deki "orijinal tarayıcıya gönderilmez" kuralı bu tek, açık indirme dışında geçerli.
- **CSP değişmedi.** Paylaşım için dosyalar presigned URL'den `fetch` ile alınıyor (bucket zaten `connect-src`'de), indirme blob URL veya `attachment` linkiyle; render sayfası da aynı CSP ile çalışıyor (inline stil/script yok, `local()` emoji fontu ağdan bir şey yüklemiyor). E2E'de hiçbir CSP ihlali görülmedi.

## Varsayımlar
- Railway worker servisine en az ~1.5 GB bellek verilebilir.
- Story güvenli alanı üst/alt 250 px; Post için 80 px.
- Sticker paketinde medyalar farklı albümlerden olabilir (her biri kendi sayfasının temasıyla); listede ilk medyanın albümünde görünür.
- Tepside (hiçbir sayfada olmayan) medya albüm temasıyla çizilir.

## Test sonuçları
- **Backend: 218 test geçti** (referans test imajında, `backend/test.Dockerfile`, gerçek ffmpeg/vips/pg_dump ile; 0 hata, 0 atlanan). Yeni: `PageThemeTest` 5 (null → albüm teması ve albüm teması değişince null sayfaların izlemesi, override'ın kalması, açık `null` / alan yok ayrımı, geçersiz tema, toplu uygulama, başka alanın sayfası listede → 404 ve hiçbir sayfa değişmiyor, eski sürüm → 409 ve değişiklik yok), `RoleSplitTest` 5 (gerçek HTTP: web rolünde poller/token/render connector yok, `/internal/render` ve `/render` 404, yüklenen medya web'de `UPLOADED` kalıyor; worker'da public portta API ve SPA 404, sağlık 200; loopback render uç noktasında yanlış/eksik/başka işe ait token 403, geçerli token + olmayan iş 404, render portunda API yok; rol tablosunda her iş tam olarak bir serviste), `ExportApiTest` 8 (IDOR: başka alanın medya/albüm/sayfa id'leriyle her tür → 404 ve hiçbir iş oluşmuyor, başka alanın export id'si ve albüm listesi → 404, orijinal indirme 404; doğrulamalar; READY sonucun `attachment` linkleri, payload'da sayfa teması ve anahtar var / URL yok; aynı içerik yeniden render edilmiyor, caption / sayfa teması / arka plan değişince yeni iş; alan başına 3 aktif → 429, başka alan etkilenmiyor, günlük limit; 24 saat sonra nesneler ve satır siliniyor, kota etkilenmiyor; uzun bir export varken medya işçisi iş alabiliyor; kuyruk alanlar arasında adil), `RenderTokensTest` 4 (süresi dolmuş, yanlış imza, başka anahtar, sahte gövde, çöp girdi, anahtarsız mod), `ColorMatrixTest` 2, `MatteTest` 1.
- Yerel Mac'te (araçsız) aynı paket çalıştırıldığında yalnızca ortam kaynaklı 3 test düşüyor: `BackupTest` (pg_dump yok), `PublicUrlTest` sağlık 503 (ffmpeg/vips yok), `InvitationTest` (sistem dili Türkçe: `"x.io".toUpperCase()` → `X.İO`; önceden var olan, değişikliklerle ilgisiz). Referans imajda üçü de geçiyor.
- **Frontend: 122 vitest geçti** (yeni: `pageTheme.test.ts` 6 — çözümleme, kapsamlar, iki tema → iki font, albüm/sayfa değişken ayrımı, layout geometrisi her sayfa temasında aynı, yayında yarı parçacık; `exportLayout.test.ts` 3 — 6 tema × 25 medya × 7 en-boy × story/post: güvenli alan, sticker'lar polaroide hiç değmiyor, 1–3 sticker, tutturucu fotoğrafa değmiyor, deterministik; polaroid uzun kenar tam 2000 ve dönmemiş; sticker 512×512 ve ≥16 px boşluk). `tsc -b` temiz, `npm audit --omit=dev` 0 (frontend ve renderer).
- **Uçtan uca (`./e2e/run.sh`, production imajı, web + worker iki servis): "OK: the whole journey worked"**, tarayıcıda CSP ihlali / yakalanmamış hata yok (`problems.json` boş). Faz 6 yolculuğunun tamamı + `exports.py`:
  - Rol ayrımı: worker'da `/actuator/health/liveness` 200, `/api/auth/me` `/api/albums` `/` 404; `worker:8099` ağdan erişilemiyor; web'de `/internal/render/*` ve `/render/*` 404.
  - Karışık temalı yayın (Romantik | Büyülü, 1600 px): iki sayfanın `data-page-theme`'i farklı, her sayfada bir ambient canvas, canvas sayfa dikdörtgeninin içinde, sayfa `overflow:hidden`.
  - Formatlar: POLAROID PNG 2000×1938 RGBA, köşeler şeffaf; JPEG uzun kenar 2000; hareketli polaroid MP4 2000×1666 H.264 8.0 sn sessiz, karede video payı %36; STORY 1080×1920 JPEG ve MP4 (10 sn, video payı %11); POST 1080×1350; CAROUSEL 3 × 1080×1350 + zip; REELS 1080×1920 H.264 30 fps 9.0 sn (kapak + 3 medya + kapanış), varsayılan ses akışı YOK, `includeAlbumMusic` ile AAC; video sahnesinde video görünüyor; STICKER_PACK statikler 37 KB / 23 KB, video sticker animasyonlu 176 KB (≥10 kare, karede video görünüyor), tepsi 96×96 16 KB, `OKU.txt` var. Aynı istek tekrarında aynı iş ve yeniden render yok.
  - Emojili + uzun Türkçe caption: alt şeritte 8320 renkli piksel (emoji renkli), `overflow=false`, metin 2 satırda üç noktayla kırpılıyor.
  - **Görsel regresyon** (sitedeki aynı polaroid: FREE sayfa, genişlik 880, dönmemiş; export ile aynı boyuta ölçeklenip kanal başına ortalama mutlak fark, 0–255): Romantik 5.55 / 4.08, Büyülü 5.00 / 3.83, Arkadaşlar 5.55 / 3.74, Seyahat 5.12 / 3.81, Yılbaşı 5.52 / 4.05, Cadılar Bayramı 5.38 / 4.48 (polaroid / story). **Kabul eşiği: polaroid ≤ 12, story ≤ 22.** Fark kaynakları: ölçekleme (site ~480 px, export 2000 px), yazı kenar yumuşatma, film greni deseni; story'de üst %10 (tutturucu) karşılaştırma dışı. Eşikler, yanlış tema/çerçeve/filtre gibi gerçek hataların ölçülen değerlerin birkaç katı fark üreteceği varsayımıyla seçildi.
  - Süreler (istekten READY'ye, 2 sn'lik yoklamayla, arm64 Docker 4 GB): POLAROID ~2–4 sn, hareketli polaroid 10 sn, STORY JPEG 2–4 sn, STORY MP4 8 sn, CAROUSEL (3 görsel) 4 sn, REELS (3 medya) 16 sn, **10 fotoğraflı REELS 30 sn (23 sn'lik video)**, STICKER_PACK (animasyonlu) 8 sn.
  - Site hızı: export çalışırken `GET /api/albums/{id}/pages` medyan 6.2 ms (boşta 6.5 ms), en kötü 7.3 ms.
  - Bellek: render sürücüsü (Node + Chromium) RSS 415–441 MB; worker konteyneri tepe ~970 MB (JVM %50 + Chromium + ffmpeg), web ~380 MB. İmaj boyutu 1.56 GB (Chromium headless shell + Node + fontlar ile).
  - Arayüz: lightbox "İndir / Paylaş" menüsü, kartın "Hazırlanıyor…" → "Hazır" + "İndir" (masaüstü), Paylaş penceresi, Reels'te telif uyarısı, sticker seçici, telefon emülasyonunda kart.
- Ekran görüntüleri: `docs/screenshots/faz7-*.{png,jpg}` (story romantik/büyülü, carousel kapak/sayfa, polaroid PNG, karışık temalı yayın, lightbox menüsü, export kartı masaüstü/telefon, paylaş/Reels/sticker pencereleri).

### Doğrulama sırasında bulunup düzeltilenler
- Hareketli tüm çıktılarda video görünmüyordu: pencere şeffaftı ama altındaki çerçeve kağıdı/sayfa arka planı ekran görüntüsünde boyanıyordu → iki anahtar renkli çekim + alfa hesabı (`Matte`), pencereli polaroidlerde gren ve kağıt lifi katmanı kapalı. E2E'ye "karede video gerçekten görünüyor mu" ölçümü eklendi (ilk koşularda boyut/süre kontrolleri bunu yakalamamıştı).
- Kırpılmış caption'da üç nokta yanlış satırda: font dosyaları ilk yerleşimden sonra yükleniyordu → fontlar render öncesi açıkça yükleniyor ve her sahne ikinci kez kuruluyor.
- Kırpılan satırdaki emojinin üst kısmı görünüyordu (sitede de) → `Caption Emoji` yüzü.
- `eclipse-temurin:21-jre` Ubuntu 26.04'e geçmiş, Playwright desteklemiyor → `21-jre-noble` sabitlendi.
- `e2e/run.sh` / `runner.sh` depoda çalıştırılabilir değildi → bit düzeltildi.

## Test edemediklerim
- **Gerçek telefonlar.** Android Chrome'da Story → Paylaş → Instagram ve iPhone Safari'de paylaşım menüsü / "Galeriye kaydet" gerçek cihazda denenmedi. Headless Chromium (Linux) Web Share API sunmuyor (`navigator.canShare` yok), bu yüzden e2e telefon emülasyonunda kartın "İndir" yoluna düştüğünü doğruladı. Paylaşım yolu kod incelemesiyle: dosyalar önceden `File` olarak hazırlanıyor, `navigator.share` dokunma işleyicisinde `await`'siz çağrılıyor (iOS'un kullanıcı etkinleştirme kuralı).
- **Sticker paketinin bir sticker maker uygulamasına aktarılması** (Android) denenmedi; dosyalar WhatsApp'ın resmi teknik kurallarına göre otomatik doğrulandı.
- **Railway'de iki servis** ve oradaki gerçek bellek kullanımı; yerelde Docker (arm64, 4 GB) ile ölçüldü.
- Gerçek bir Android Motion Photo ile hareketli sticker / Story (sentetik video ile denendi; Motion Photo aynı `loop` varyantını kullanıyor).
- Playwright'ın Chromium'u H.264 oynatamadığı için sitedeki videolar e2e ekran görüntülerinde "banyo ediliyor" görünür (Faz 6'daki gibi); export tarafında ffmpeg kullanıldığı için etkilenmez.

## Bilinen sorunlar
- Hareketli export'larda polaroid çerçevesinin kağıt lifi dokusu ve fotoğraftaki film greni yok (yukarıda gerekçe).
- Creepster / Mountains of Christmas'ta Türkçe özel harfler yedek fonta düşer (5b'den).
- Worker tek örnek varsayımıyla tasarlandı (yedekleme, bellek içi oran limitleri).
- Export sonuç linkleri presigned ve ~60 dk geçerli; kart açık kalırsa durum yenilemesiyle yeni link geliyor.

## ÜRETİMDE ELLE YAPILACAKLAR (MANUAL)
1. **Worker servisi:** README "Adding the worker on Railway" adımları: aynı repo ile yeni servis, web servisinin tüm değişkenleri + `APP_ROLE=worker`, `JAVA_MAX_RAM_PERCENTAGE=50`; public domain verme; healthcheck `/actuator/health/liveness`; en az ~1.5 GB bellek.
2. **Web servisine `APP_ROLE=web`** ekle ve yeniden deploy et (worker ayağa kalktıktan SONRA; arada kısa süre kimse medya işlemez ama kayıp olmaz, kuyruk bekler).
3. **Yedekleme değişkenleri** (`BACKUP_S3_*`) worker'da da olmalı (yedek artık orada çalışıyor). Admin ekranında "Şimdi yedekle" → birkaç saniye sonra durumun "çalışıyor/başarılı" olduğunu kontrol et.
4. **Log kontrolü:** web `APP_ROLE=WEB`, worker `APP_ROLE=WORKER` ve `Render endpoint listening on 127.0.0.1:8099`.
5. **Telefonda dene:** Android Chrome'da bir fotoğraf → Instagram Story → kart "Hazır" → Paylaş → Instagram'ın Story ekranı; iPhone Safari'de paylaşım menüsü ve "Galeriye kaydet / İndir". Bir sticker paketini Android'de bir sticker maker uygulamasına aktar. Sonuçları bu rapora ekle.
6. İsteğe bağlı ayarlar: `EXPORT_CONCURRENCY` (varsayılan 1), `EXPORT_DAILY_LIMIT` (alan başına, varsayılan 40).
