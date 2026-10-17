# Faz 6 raporu — özel alan adı, yedekleme, Motion Photo, son kontroller

## Değişiklikler

**Özel alan adı (`APP_PUBLIC_URL`)**
- `config/PublicUrlProperties` (`APP_PUBLIC_URL`, `REDIRECT_TO_PUBLIC_URL`): tek kaynak. Kodda hiçbir alan adı yok.
- Davet bağlantıları: yanıtta mutlak `url` (APP_PUBLIC_URL tanımlıysa; yoksa `null` ve tarayıcı kendi origin'inden üretir), `path` korundu.
- `APP_ALLOWED_ORIGINS` varsayılanı = `APP_PUBLIC_URL` origin'i (`application.yml` iç içe placeholder); bucket CORS kuralı bundan kuruluyor. Her girdi `scheme://host[:port]`'a indirgeniyor (sondaki `/` artık CORS'u bozmaz).
- Çerez `Secure` bayrağı: `PublicUrlEnvironmentPostProcessor` — `http://` adres → kapalı, `https://` → varsayılan (açık); açık `COOKIE_SECURE` her zaman kazanır. Çerezde `Domain` yok (host-only). `APP_PUBLIC_URL` ile `COOKIE_SECURE` çelişirse açılışta uyarı.
- `PublicUrlRedirectFilter`: `REDIRECT_TO_PUBLIC_URL=true` iken `*.up.railway.app` üzerindeki **GET/HEAD sayfa** isteklerini `301` ile `APP_PUBLIC_URL`'e (path + query korunarak) yönlendirir. `/api/**` ve `/actuator/health/**` hiçbir zaman yönlendirilmez. Varsayılan kapalı.
- README: alan adı geçiş adımları sırayla (7 adım).

**Yedekleme**
- `V10__backup.sql`: `backup_run` (son çalışmalar) ve `purged_object` (kalıcı silinen orijinallerin 30 gün tutulma kaydı).
- `backup/` paketi: `BackupProperties` (`BACKUP_S3_ENDPOINT/BUCKET/ACCESS_KEY_ID/SECRET_ACCESS_KEY/REGION`, ayrıca `BACKUP_S3_PATH_STYLE`), `BackupTarget` (düz S3 API: list/put/delete), `BackupService`, `PurgeLog`, `AdminOpsController`, `BackupStartup`. Tanımlı değilse yedekleme kapalı ve açılışta tek `Backup is OFF` uyarı satırı.
- **Medya**: yalnızca orijinaller + albüm müziği (`spaces/...` anahtarları birebir), artımlı (aynı anahtar + aynı boyut atlanır), kaynak bucket'tan hedefe **akış** (belleğe alınmıyor). Silinen/purge edilen orijinal hedefte **30 gün daha** kalıyor, sonra gece çalışması siliyor.
- **Veritabanı**: `pg_dump --format=custom` → `db/YYYY-MM-DD.dump`, son 14 gün tutuluyor (bugün + önceki 13).
- Her gece 04:00 (Europe/Istanbul), 03:30'daki çöp temizliğinden sonra.
- Admin ekranı: medya ve DB için son çalışma zamanı, durum, hedefteki nesne sayısı + toplam boyut, hata mesajı, "Şimdi yedekle" (`POST /api/admin/backup/run`), "Tümünü yeniden işle". `GET /api/admin/backup` durumu verir.
- `POST /api/admin/reprocess-all`: yaşayan albümlerdeki `READY`/`FAILED` tüm medyayı `UPLOADED`'a çeker; mevcut adil kuyruk kuralıyla işlenir.
- `Dockerfile` / `backend/test.Dockerfile`: PostgreSQL apt deposundan `postgresql-client-17` (`ARG PG_CLIENT_MAJOR=17`). Derleme `pg_dump --version` çıktısını basıyor ve major farklıysa **build'i düşürüyor**. Build günlüğünden doğrulanan sürüm: `pg_dump (PostgreSQL) 17.11`.
- README: yedek değişkenleri, R2 önerisi, geri yükleme prosedürü.

**Android Motion Photo**
- `MotionPhoto` (yalnızca JPEG + işaret varsa): Google `MotionPhoto` (Container `Item:Length`), Google `MicroVideo` (`MicroVideoOffset`), Samsung `MotionPhoto_Data`. Ofset güvenilir değilse `ftyp` imzası aranıyor; MP4'ün sonu kutu (box) yürüyüşüyle bulunuyor (Samsung SEF kuyruğu kesiliyor). Hiçbir durumda exception fırlatmaz.
- `PhotoProcessor`: gömülü MP4'ü mevcut video hattından geçirir (HDR tonemap, boomerang, poster); medya `IMAGE` kalır, `loop_key`/`poster_key` dolar, `loopUrl` döner. Bozuk video → düz fotoğraf (uyarı logu).
- Frontend: `resolveDisplay` `image` modunda `live` taşır; `LivingPhoto` fotoğrafın üstünde loop'u oynatır (yalnızca gerçekten `playing` olunca görünür, hareket azaltmada hiç render edilmez, videolarla aynı "en fazla 6 oynatma" kuralı); lightbox aynı bileşeni kullandığı için loop büyük fotoğrafın üstünde oynar.
- Mevcut fotoğraflar migration'sız: "Tümünü yeniden işle".

**Son kontroller**
- Rate limit: `ratelimit/` (`RateLimiter`, `RateLimitProperties`). Giriş: adres başına 30 deneme / 10 dk (+ mevcut hesap kilidi: 5 hatalı şifre → 15 dk, her adresten); yükleme başlatma: kullanıcı başına 120 / saat, adres başına 300 / saat; davet: mevcut adres kilidi (5 hatalı token). Aşılınca `429`.
- Log hijyeni: `LogHygieneTest` (çalışma zamanı) + kaynak taraması.
- `ErrorScreen` / `ErrorBoundary`: Türkçe, tema uyumlu 404 ve beklenmedik hata sayfaları (albüm içinde albümün teması, dışarıda varsayılan tema). Başka alanın albümü ve olmayan albüm aynı 404 sayfasını gösterir; bilinmeyen adresler artık `/`'e yönlendirilmek yerine 404 gösterir.
- Bağımlılık güncellemesi: `pom.xml` → `tomcat.version=11.0.25`, `jackson-bom.version=3.1.7`.
- `e2e/`: Playwright (Python) uçtan uca duman testi + `docker-compose.yml`, `run.sh`, `runner.sh`, `README.md`.
- Küçük düzeltme (e2e buldu): sağ taraftaki düzenleme paneli (`.tray`) 1280 px'te başlığın "Düzenlemeyi bitir" düğmesini örtüyordu; panel artık başlığın altından başlıyor.

## Migration
`V10__backup.sql` (`backup_run`, `purged_object`). Mevcut veriye dokunmaz.

## Kararlar
- **Bağımlılık taraması: OSV (osv-scanner) kullanıldım, OWASP dependency-check değil.** Gerekçe: dependency-check NVD verisini (API anahtarı olmadan saatler süren indirme + hız sınırı) gerektiriyor; OSV aynı Maven ağacını (BOM + geçişli bağımlılıklar) anında tarıyor. Bulgu: Tomcat 11.0.24 (3 kritik/yüksek), Jackson 3.1.5 (5 yüksek/orta) → pom'da sabitlendi, yeniden taramada "No issues found"; `dependency:tree` ile çözümlenen sürümler doğrulandı. `npm audit --omit=dev`: 0 açık.
- **Yönlendirme yalnızca GET/HEAD sayfa istekleri için.** `301` bir POST'u GET'e çevirir; API ve sağlık yoklaması (Railway probe'u platform host'una gelir) hiç yönlendirilmez.
- **Çerez host-only; Secure bayrağı adresin şemasından türetiliyor.** `Domain` vermek yerine host-only bırakmak alan adı geçişinde ayar gerektirmez; çerez yeni host'a taşınmaz, herkes yeni adreste bir kez giriş yapar (README'de yazıyor).
- **Davet yanıtında hem `path` hem mutlak `url`.** Eski istemciler bozulmaz; `url` yalnızca `APP_PUBLIC_URL` tanımlıysa dolu.
- **Medya yedeği akışla, DB yedeği geçici dosyayla.** S3 `PutObject` için içerik uzunluğu gerekir; medyanın boyutu DB'de biliniyor (akış), `pg_dump` çıktısının boyutu önceden bilinmediği için önce geçici dosyaya yazılıyor (yüklemeden sonra siliniyor).
- **Çöpteki (silinmiş ama purge edilmemiş) medya da yedekleniyor; `PENDING_UPLOAD` ve `REJECTED` yedeklenmiyor.** Purge edilince hedefteki kopya `purged_object` kaydıyla 30 gün daha kalıyor. Kayıt yalnızca yedekleme yapılandırılmışsa yazılıyor (aksi halde kimse okumazdı). Değiştirilen/kaldırılan albüm müziği de aynı kayıtla 30 gün korunuyor.
- **"Son 14 gün" = bugün + önceki 13 gün; tarih Europe/Istanbul'a göre.** Aynı gün ikinci çalışma o günün dump'ını değiştirir.
- **pg_dump 17.** Railway'in Postgres sürümü ile aynı veya daha yeni olmalı; sürümü sabitlemek yerine `PG_CLIENT_MAJOR` build argümanı + build'de doğrulama. README'de "veritabanını yükseltmeden önce bunu artır" yazıyor.
- **`reprocess-all` öğeleri anında `UPLOADED` yapar.** İşlenene kadar albümlerde "banyo ediliyor" yer tutucusu görünür (eski varyant dosyaları geri yüklemede zaten yok; yüklü sistemde kısa süreli bir görünüm kaybı kabul edildi). Alternatif (READY kalıp arka planda yenilemek) kuyruk durum makinesini değiştirmeyi gerektirirdi.
- **Motion Photo yalnızca işaretli JPEG'lerde aranıyor.** İşaret yoksa ftyp taraması yapılmaz (sıradan fotoğrafta yanlış pozitif olmasın). 64 MB'a kadar dosya tamamen okunuyor (yükleme sınırı 30 MB; tek işçi).
- **Rate limit sabit pencere, bellek içi.** Uygulama tek instance; yeniden başlatma sayaçları sıfırlar. Giriş için ayrıca hesap kilidi korunuyor (kullanıcı bazlı), adres limiti kimlik bilgisi denemelerini hesaplar arasında da sınırlıyor (IP bazlı).
- **404/hata sayfaları SPA içinde, HTTP durumu 200.** Rota kararı React Router'da; API hataları doğru durum kodunu korur.
- **E2E Python Playwright (Node değil).** Daha önce çalışan imaj (`mcr.microsoft.com/playwright/python:v1.55.0-noble`) ve araç zinciri tekrar kullanıldı.
- **Testlerde Hikari havuzu 3'e düşürüldü** (`TestInfrastructure`): her farklı test yapılandırması kendi Spring bağlamını açık tutuyor; yeni test sınıfları ile toplam bağlantı Postgres'in `max_connections` değerini aşıyordu.

## Varsayımlar
- Railway Postgres'in major sürümü 17 veya daha eski (17 istemci eski sunucuları dump edebilir). 18 ise `PG_CLIENT_MAJOR`'u 18 yap.
- Samsung eski (SEF) biçimi için gerçek cihaz dosyası yoktu; sentetik fikstür bilinen düzenden (JPEG + `MotionPhoto_Data` + MP4 + `SEFH…SEFT` kuyruğu) üretildi.
- R2 uç noktası `https://<hesap>.r2.cloudflarestorage.com`, bölge `auto`, sanal-host/yol stili ayarı `BACKUP_S3_PATH_STYLE` ile.

## Test sonuçları
- Backend **193 test geçti** (önceki 162 + 31): `PublicUrlTest` 5, `PublicUrlCookieTest` 2, `BackupTest` 7 (iki bucket: artımlılık, 30 gün saklama, geçerli dump + `pg_restore --list` + 14 gün rotasyonu, kapalı yapılandırma, admin API + reprocess-all), `MotionPhotoTest` 10 (Google, MicroVideo, Samsung, Samsung+Google+kuyruk, yanlış ofset → ftyp taraması, ofset dosya dışında/negatif/taşan → düz fotoğraf, bozuk ve kesik video → düz fotoğraf, işaretsiz MP4 eklenmiş JPEG aranmaz, `MotionPhoto="0"`), `MediaProcessingQueueTest` +1 (Motion Photo IMAGE kalır, `loopUrl` dolu, eski fotoğraf yeniden kuyruğa alınınca loop kazanır), `RateLimitTest` 4, `LogHygieneTest` 2.
- Frontend **113 vitest geçti** (+4: `resolveDisplay` Motion Photo / video / durum kuralları); `tsc -b` temiz.
- **Uçtan uca (production imajı, Docker):** `./e2e/run.sh` → "OK: the whole journey worked" (davet → kayıt → 6 temada albüm → fotoğraf + video yükle → ikisi READY → FREE şablon + sticker → müzik yükle → diğer alanın kullanıcısı 404). CSP ihlali veya yakalanmamış sayfa hatası yok. Son koşu, son koddan (çerez `Secure` bayrağı `COOKIE_SECURE` verilmeden `APP_PUBLIC_URL`'den türetilerek, 404/yönetim sayfası CSS düzeltmeleri dahil) yapıldı. İlk koşu düzenleme panelinin başlık düğmesini örttüğünü yakaladı (düzeltildi).
- Bağımlılık: `npm audit --omit=dev` 0; OSV Maven ağacı tarama: düzeltme sonrası temiz.
- Ekran görüntüleri: `docs/screenshots/faz6-404.png`, `faz6-admin.png`, `faz6-edit-free.png`.

## Test edemediklerim
- **Gerçek Android cihaz dosyaları** (Pixel / Galaxy Motion Photo): yalnızca sentetik fikstürler. Gerçek dosyalarla bir kez denemek gerekir.
- **Gerçek R2 / Railway Postgres'e karşı yedekleme**: testler CloudServer + Postgres 17 container'ı ile yapıldı. Geri yükleme (`pg_restore` + `rclone` + reprocess-all) uçtan uca denenmedi; adımlar tek tek (dump geçerli, `pg_restore --list` okuyor, anahtarlar birebir, reprocess-all çalışıyor) doğrulandı.
- **Özel alan adı geçişi** (gerçek DNS/TLS, Railway'in 301'i, Cloudflare): kod ve başlıklar testli, canlı geçiş denenmedi.
- Playwright'ın Chromium'u H.264 çözemez: e2e ekran görüntülerinde video kutuları "banyo ediliyor" yer tutucusunu gösterir. Bu bir ürün hatası değil (Chrome/Safari oynatır); video oynatma bu ortamda görsel olarak doğrulanamadı, yalnızca sunucu tarafında (READY, loop/poster var) doğrulandı.
- iOS Safari'de Motion Photo loop'unun fotoğraf üstünde oynatılması, dokunmatik sürükleme (5a'dan beri aynı sınırlama).

## Bilinen sorunlar
- Yedekleme işi uygulama içinde (`@Scheduled`); birden fazla instance çalıştırılırsa aynı anda iki kez çalışır (tek instance varsayımı; `reprocess` ve rate limit sayaçları da bellek içi).
- Medya yedeğinde bir nesnenin akışı yarıda koparsa SDK akışı yeniden deneyemez; nesne o gece "başarısız" sayılır, ertesi gece yeniden denenir.
- Motion Photo yalnızca JPEG (HEIC tabanlı Samsung varyantı desteklenmiyor); Live Photo (iOS) kapsam dışı.
- Sunucu 404 sayfaları için 200 döner (SPA).
- `reprocess-all` çalışırken albümlerde tüm öğeler kısa süre yer tutucu gösterir.

## ÜRETİMDE ELLE YAPILACAKLAR (MANUAL)
1. **Alan adı:** README'deki 7 adımı sırayla uygula (Railway'e domain ekle → DNS → TLS aktif olunca `APP_PUBLIC_URL=https://alanadi` + geçici `APP_ALLOWED_ORIGINS` (yeni + eski) → yeni adreste giriş yap ve fotoğraf yükle (CORS kanıtı) → partnere yeni adresi ver → `REDIRECT_TO_PUBLIC_URL=true` → `APP_ALLOWED_ORIGINS`'ı kaldır). Railway healthcheck yolu `/actuator/health/liveness` kalsın.
2. **Yedek bucket'ı:** Cloudflare R2'de ayrı bir bucket + yalnızca o bucket'a yetkili API anahtarı oluştur; `BACKUP_S3_ENDPOINT/BUCKET/ACCESS_KEY_ID/SECRET_ACCESS_KEY/REGION` değişkenlerini Railway'e gir. Açılışta `Backup is ON` satırını doğrula; `/admin` → "Şimdi yedekle" → durum ve boyutları kontrol et.
3. **Postgres sürümü:** Railway Postgres'in major sürümünü kontrol et; 17'den yüksekse `Dockerfile`'da `PG_CLIENT_MAJOR`'u artır.
4. **Mevcut fotoğrafları yenile:** deploy sonrası `/admin` → "Tümünü yeniden işle" (Motion Photo loop'ları ve yeni hat için bir kez).
5. **Geri yüklemeyi bir kez prova et** (README "Restore"): boş bir Postgres + boş bucket'a dump ve `spaces/` kopyası, sonra reprocess-all.
6. **Gerçek bir Android Motion Photo** (Pixel ve/veya Galaxy) yükleyip polaroid'de ve lightbox'ta loop'un oynadığını kontrol et.
7. **Eski artıklar:** (5b'den) bucket'taki `audio/theme` nesneleri artık okunmuyor; istersen elle sil.
8. **Düzenli:** `npm audit --omit=dev` ve OSV taramasını sürüm öncesi yeniden çalıştır; `./e2e/run.sh` ile duman testini deploy öncesi çalıştır.
