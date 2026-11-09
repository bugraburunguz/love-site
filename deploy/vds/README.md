# VDS taşıma runbook'u (LS-1): love-site + FC Assist → tek Ubuntu 24.04 sunucu

Railway'den çıkış. Tek sunucuda: Caddy (HTTPS) · Postgres 18 (iki veritabanı) · Garage (love-site'ın S3 bucket'ı) ·
love-web + love-worker · fc-backend + fc-web (+ isteğe bağlı fc-ml). Kurulumu Buğra yapar; her adımın "Görmelisin" satırı doğrulamadır.

```
internet ─▶ Caddy :443 ─┬─ LOVE_DOMAIN     ─▶ love-web:8080 ──┐
                        ├─ LOVE_S3_DOMAIN  ─▶ garage:3900  ◀──┼── love-worker (fotoğraf/video, export)
                        └─ FC_DOMAIN       ─▶ fc-web:80 ─▶ fc-backend:8080
                                     postgres:5432  (love, fcassist)
```

**Ön koşul:** LS-2 (bucket CORS kuralı küçük harf) master'da olmalı. O olmadan tarayıcı Garage'a yükleme yapamaz.

## 0. Gerekenler

| Ne | Değer |
|---|---|
| Sunucu | Ubuntu 24.04 64 bit · **6 GB RAM önerilen** (4 GB + swap çalışır ama export sırasında sıkışır) · 2+ vCPU · disk: bucket boyutu × 1,5 + 30 GB |
| Domain | 3 ad, hepsi sunucu IP'sine A kaydı: `LOVE_DOMAIN`, `LOVE_S3_DOMAIN` (ör. `s3.` + love domain), `FC_DOMAIN`. Taşımadan 1 gün önce TTL'i 300 sn yap |
| Sunucu dışı yedek | S3 uyumlu ikinci bir bucket (Cloudflare R2 ya da Backblaze B2). Sunucu diski giderse tek kopya budur |
| GitHub erişimi | 3 private repo için **repo başına ayrı** salt okunur deploy key (GitHub bir anahtarı tek repoya bağlar), 2. adım |
| Railway | Olay (incident) bitmiş olmalı, bucket'ın Files sekmesi açılıyor olmalı |

Bucket boyutunu Railway'de bucket → Metrics'ten oku; disk seçimi buna göre yapılır.

## 1. Sunucunun ilk kurulumu (bir kez, root)

```bash
scp deploy/vds/scripts/setup-ubuntu.sh root@SUNUCU_IP: && ssh root@SUNUCU_IP 'bash setup-ubuntu.sh'
```

Betik şunları yapar: güncellemeler ve otomatik güvenlik yamaları, `deploy` kullanıcısı (root'un SSH anahtarıyla), şifresiz ve root'suz SSH, ufw (22/80/443), Docker'ın kendi deposundan Docker + compose, 2 GB swap, İstanbul saati, `/srv/src` ve `/srv/backups`.
**Görmelisin:** son satır `ready`. Root oturumunu kapatmadan **yeni bir terminalde** `ssh deploy@SUNUCU_IP` ile girebildiğini dene.

## 2. Kod ve ayarlar (deploy kullanıcısı)

Her repo için bir anahtar ve `~/.ssh/config` içinde bir takma ad oluştur:

```bash
for r in love-site FCarrierTacticBuilderBackend FCarrierTacticBuilderWeb; do ssh-keygen -q -t ed25519 -N "" -C "vds-$r" -f ~/.ssh/deploy_$r && printf 'Host github-%s\n  HostName github.com\n  User git\n  IdentityFile ~/.ssh/deploy_%s\n  IdentitiesOnly yes\n\n' "$r" "$r" >> ~/.ssh/config; done && chmod 600 ~/.ssh/config && cat ~/.ssh/deploy_*.pub
```

Çıkan üç `.pub` satırını, sonundaki `vds-<repo>` adına bakarak ilgili reponun **Settings → Deploy keys** sayfasına ekle. "Allow write access" kutusunu işaretleme. Sonra:

```bash
cd /srv/src && git clone github-love-site:bugraburunguz/love-site.git && git clone github-FCarrierTacticBuilderBackend:bugraburunguz/FCarrierTacticBuilderBackend.git && git clone github-FCarrierTacticBuilderWeb:bugraburunguz/FCarrierTacticBuilderWeb.git
```

```bash
cd /srv/src/love-site/deploy/vds && cp .env.example .env && cp love.env.example love.env && cp fc.env.example fc.env && sed "s/CHANGE_ME_RPC_SECRET/$(openssl rand -hex 32)/" garage.toml.example > garage.toml && chmod 600 .env love.env fc.env garage.toml
```

Dosyaları `nano` ile doldur. Bu dosyalar `.gitignore`'da, commit'e girmez.
- **Şifreler:** `.env`'deki üç şifre ve `fc.env`'deki `JWT_SECRET` / `ADMIN_KEY` **yeni üretilir**. Railway'deki değerler sohbete açık yapıştırıldı, tekrar kullanılmaz. Değeri sunucuda `openssl rand -hex 24` ile üret, dosyaya doğrudan yaz.
- **`love.env` → `PGPASSWORD`:** `.env`'deki `LOVE_DB_PASSWORD` ile aynı değer olmalı.
- **`love.env` → `USER1_*` / `USER2_*`:** Railway'deki e-posta ve adlar, şifre için yeni rastgele değer. Mevcut hesaplara dokunulmaz.
- **`love.env` → `S3_ACCESS_KEY_ID=` / `S3_SECRET_ACCESS_KEY=`:** boş bırak, 3. adım doldurur.
- **`fc.env`:** liste `FCarrierTacticBuilderBackend/docs/deploy/RAILWAY.md` 5. bölümle aynı (mail, admin e-postası vb.).

## 3. Altyapı ve imajlar (site Railway'de çalışmaya devam eder)

```bash
cd /srv/src/love-site/deploy/vds && docker compose up -d postgres garage && scripts/garage-init.sh && docker compose build
```

**Görmelisin:**
- `garage-init.sh` sırasıyla `layout: node …`, `bucket lovesite: created`, `key love-site: created, written to love.env` yazar.
- `docker compose build` hatasız biter. love-site imajı Chromium içerdiği için ilk build 10–20 dk sürebilir.

Kapasite 100 GB'tan farklı olacaksa komutu `GARAGE_CAPACITY=200G scripts/garage-init.sh` olarak çalıştır.

## 4. Bucket'ın ilk kopyası (kesintisiz, uzun kısım)

Railway → bucket → Credentials'tan endpoint, bucket adı, access key ve secret'ı al. Değerler ekrana yazılmaz:

```bash
read -rs SRC_S3_ACCESS_KEY_ID && read -rs SRC_S3_SECRET_ACCESS_KEY && export SRC_S3_ACCESS_KEY_ID SRC_S3_SECRET_ACCESS_KEY
```

```bash
cd /srv/src/love-site/deploy/vds && SRC_S3_ENDPOINT=https://t3.storageapi.dev SRC_S3_BUCKET=RAILWAY_BUCKET_ADI scripts/migrate-bucket.sh
```

**Görmelisin:** `0 differences found`, `N matching files`, `done`. Betik hiçbir tarafta silme yapmaz. Railway bucket'ı path-style istiyorsa başa `SRC_S3_PATH_STYLE=true` ekle.

## 5. Geçiş (kesinti: yaklaşık 15–30 dk)

1. **Yazmayı durdur:** Railway'de love-site ve FC backend servislerini durdur. Postgres ve bucket servisleri **çalışmaya devam etsin**.
2. **Bucket farkı:** 4. adımdaki komutu tekrar çalıştır. Sadece yeni dosyaları kopyalar.
3. **Veritabanları:** Railway Postgres → `DATABASE_PUBLIC_URL`. FC için adresin sonu `/fcassist` olmalı (Railway'in varsayılanı `/railway`).
   ```bash
   read -rs SOURCE_DATABASE_URL && export SOURCE_DATABASE_URL
   ```
   ```bash
   cd /srv/src/love-site/deploy/vds && scripts/migrate-db.sh love
   ```
   Aynısını FC'nin adresiyle `scripts/migrate-db.sh fcassist` için tekrarla, sonra `unset SOURCE_DATABASE_URL SRC_S3_ACCESS_KEY_ID SRC_S3_SECRET_ACCESS_KEY` çalıştır.
   **Görmelisin:** `done: N tables, every one with the same number of rows`. Hedef doluysa betik hiçbir şey yazmadan durur.
4. **DNS:** üç A kaydını sunucu IP'sine çevir.
5. **Önce Caddy:** sertifikaları açılışta alır. love-web açılırken bucket'ın CORS ayarını `https://LOVE_S3_DOMAIN` üzerinden yazar ve bunu tekrar denemez, bu yüzden sertifika ondan önce hazır olmalı:
   ```bash
   cd /srv/src/love-site/deploy/vds && docker compose up -d caddy && until curl -so /dev/null https://LOVE_S3_DOMAIN; do sleep 5; done && docker compose up -d
   ```
   (`LOVE_S3_DOMAIN` yerine gerçek adı yaz.) Döngü bitmiyorsa `docker compose logs caddy` sertifika hatasını gösterir; çoğu zaman DNS henüz yayılmamıştır.
6. **Kontroller:**
   - `docker compose logs love-web | grep "Bucket CORS configured"` bir satır döner. Dönmüyorsa `docker compose restart love-web love-worker`.
   - `https://LOVE_DOMAIN/actuator/health` → `UP`.
   - Giriş yap. Eski fotoğraflar görünmeli (adres `LOVE_S3_DOMAIN`).
   - Yeni bir fotoğraf yükle; birkaç saniyede işlenmeli.
   - Bir export al.
   - FC: giriş yap, bir kariyer sayfasını aç.
   - `docker compose logs -f love-worker fc-backend` içinde ERROR olmamalı.

**Geri dönüş:** Railway'de servisleri yeniden başlat ve DNS'i geri çevir. Railway'deki veri bu süreçte hiç değişmez; yalnız geçişten sonra VDS'e yazılanlar oraya gitmez.

## 6. Yedek

- **love-site:** `love.env` → `BACKUP_S3_*` (R2/B2). Her gece orijinalleri, şarkıları ve DB dump'ını kopyalar. **Görmelisin:** worker logunda `Backup is OFF` uyarısı olmamalı.
- **FC Assist:** önce `/srv/backups/offsite.env` dosyasını hazırla (biçimi betiğin başında, chmod 600), sonra cron'a ekle:
  ```bash
  (crontab -l 2>/dev/null; echo '30 3 * * * /srv/src/love-site/deploy/vds/scripts/backup-fc.sh >> /srv/backups/fc/backup.log 2>&1') | crontab -
  ```
- **Geri yükleme provası:** ayda bir, son dump'ı boş bir veritabanına `pg_restore` et.

## 6a. Loglar (Dozzle)

İki adres var:
- **`LOGS_DOMAIN`:** sunucudaki bütün container'ların logları.
- **`LOGS_FC_DOMAIN`:** sadece FC Assist'in logları.

Loglar tarayıcıda canlı akar, arama yapılabilir ve container başına CPU/RAM görünür. İkisi de Caddy'nin şifresinin arkasında, çünkü loglarda e-posta adresi gibi kişisel bilgiler var.

Dozzle Docker'a doğrudan değil, `docker-ro` proxy'si üzerinden bağlanır. Proxy container'ları listelemeye ve log okumaya izin verir; durdurma, başlatma ya da container içinde komut çalıştırma isteklerini reddeder. Böylece bu adresler ele geçse bile sunucuda bir şey değiştirilemez.

Proxy'den bir container okunduğunda ortam değişkenleri de, yani `love.env` / `fc.env` içindeki bütün şifreler de gelir. Bu yüzden proxy dışarıya kapalı ayrı bir ağdadır (`dockerapi`, `internal: true`) ve o ağa yalnızca iki Dozzle container'ı bağlıdır. Uygulamalar proxy'ye ulaşamaz; bir uygulamada açık çıksa bile oradan şifrelere gidilemez. Dozzle'ın kendi ekranı ve API'si ortam değişkenlerini göstermez (yerelde denendi).

**İki sayfa aynı kullanıcı ve şifreyi kullanır.** FC sayfası bir erişim sınırı değil, kolaylık için konmuş bir filtredir: FC sayfasının şifresini bilen biri tüm logları da açabilir. FC loglarını başka biriyle paylaşacaksan ayrı bir kullanıcı ve şifre eklenmesi gerekir.

**Kurulum (bir kez, bu bölüm merge edilmeden önce).** compose bu 4 değeri zorunlu tutar. `.env`'de yoksa bütün deploy'lar (love, fc-backend ve fc-web) build adımında durur ve hiçbir şey yeniden başlatılmaz.

1. DuckDNS'te iki ad aç ve sunucunun IP'sine yönlendir.
2. Sunucuda şifrenin hash'ini üret. Şifreyi iki kez sorar ve ekrana sadece hash'i basar; şifrenin kendisi hiçbir yere yazılmaz. Şifre en az 20 karakter olsun ve parola yöneticisinden üretilsin: adres internete açık ve şifre denemesine karşı tek koruma şifrenin gücü.
   ```bash
   docker run --rm -it caddy:2.10-alpine caddy hash-password
   ```
3. `nano /srv/src/love-site/deploy/vds/.env` ile şu 4 satırı ekle. Hash'i tek tırnak içinde yaz, çünkü içinde `$` var:
   ```
   LOGS_DOMAIN=...duckdns.org
   LOGS_FC_DOMAIN=...duckdns.org
   LOGS_USER=kullanici-adin
   LOGS_PASSWORD_HASH='$2a$14$...'
   ```
4. Merge'den sonraki love-site deploy'u (otomatik) Dozzle'ı ve proxy'yi başlatır. Görmelisin: adres önce şifre sorar, sonra container listesi gelir.

## 6b. Disk ve depolama limitleri (LS-7)

Fotoğraflar, veritabanı, imajlar ve build cache aynı diski (38 GB) paylaşır. Deploy sırasında oluşan build cache ve yeni imajlar için ~6–8 GB pay bırakılır, fotoğraflar için güvenli bütçe ~15 GB'dır.

| Alan | Limit |
|---|---|
| Kayıtla açılan (ücretsiz) | 50 MB, tek video en çok 20 MB |
| Ücretsiz alanların toplamı | 3 GB (≈ 61 alan); dolunca `/kayit` "Şu an yeni kayıt alınmıyor" der. 30 gün boş kalan ücretsiz alan gece kendiliğinden silinir |
| Kayıt sınırı | adres başına saatte 3 (IPv6'da /64 ağı), toplamda günde 10 |
| Davetle açılan | admin formunda 1 GB önerilir, gerekirse elle artırılır |
| İlk alan | 5 GB |

Bu değerler `love.env`'deki `SIGNUP_*` değişkenleriyle değiştirilebilir (bkz. kök `README.md`). Limitlerin toplamı diskten büyük olabilir, çünkü çoğu alan limitine yaklaşmaz. Asıl güvence aşağıdaki disk uyarısıdır.

**Eski 400 GB'lık ilk alan:** `/admin` → alan → **Limiti değiştir** → `5`. Kod mevcut alanların limitine dokunmaz.

**Disk uyarısı (bir kez kurulur).** Disk %85'i geçince bildirim gönderir: kayıt yazar, ayarlıysa telefona ntfy bildirimi yollar.

1. Telefona **ntfy** uygulamasını kur ve uzun, tahmin edilemez bir konu adına abone ol. Konu adını rastgele üret:
   ```bash
   openssl rand -hex 16 | pbcopy
   ```
2. Sunucuda, panodaki değeri `<konu>` yerine koyarak çalıştır:
   ```bash
   umask 077 && echo 'NTFY_URL=https://ntfy.sh/<konu>' > ~/.disk-alert.env
   ```
3. Cron'a ekle (30 dakikada bir; disk dolu kaldığı sürece günde en çok bir bildirim):
   ```bash
   (crontab -l 2>/dev/null; echo '*/30 * * * * /srv/src/love-site/deploy/vds/scripts/disk-alert.sh >> /srv/backups/disk-alert.log 2>&1') | crontab -
   ```
4. Dene. Eşik 0 olunca uyarı hemen tetiklenir; telefona bildirim gelmeli:
   ```bash
   rm -f ~/.disk-alert.last && DISK_ALERT_THRESHOLD=0 /srv/src/love-site/deploy/vds/scripts/disk-alert.sh && rm -f ~/.disk-alert.last
   ```

Yer daralırsa önce build cache'i temizle: `docker builder prune -f`.

## 7. Güncelleme (her yeni sürümde)

Kurulduktan sonra otomatik olur (aşağıdaki bölüm). Elle yapmak gerekirse:

```bash
cd /srv/src/love-site && git pull && cd ../FCarrierTacticBuilderBackend && git pull && cd ../FCarrierTacticBuilderWeb && git pull && cd /srv/src/love-site/deploy/vds && docker compose up -d --build
```

## 7a. Otomatik deploy (GitHub Actions)

Her repoda `.github/workflows/deploy.yml` bulunur:
- **love-site:** `master`'a her merge'de çalışır.
- **FC backend ve FC web:** `main`'e merge'den sonra, CI yeşil bitince çalışır.

İş sunucuya `deploy` kullanıcısıyla bağlanır ve hedefin adını söyler: `love`, `fc-backend` ya da `fc-web`. Sunucu tarafında sadece [scripts/deploy-trigger.sh](scripts/deploy-trigger.sh) çalışır. O da şunları yapar:
1. Repoyu çeker (`--ff-only`).
2. O tek imajı build eder.
3. Servisi yeniden başlatır. `love` için bütün stack uygulanır, çünkü compose.yml ve Caddyfile o repoda. FC için sadece kendi servisi başlar.
4. Servis sağlıklı cevap verene kadar bekler. fc-backend kendi `/actuator/health` adresinden kontrol edilir.

Deploy SSH bağlantısından bağımsız çalışır ve logu Actions'a akar. Bağlantı kopsa ya da iş iptal edilse bile deploy yarıda kalmaz; log `~/deploy-logs` altında durur (son 30 deploy). Aynı anda tek deploy çalışır; ikincisi sırasını bekler.

**Anahtar kısıtlı:** GitHub'a konan anahtar `authorized_keys`'te bu betiğe bağlıdır (`command=...,restrict`). Bu anahtarla kabuk açılamaz, port yönlendirilemez, başka bir komut çalıştırılamaz. Unutma: `love-site`'ın master dalına yazabilen biri bu betiği de değiştirebilir. Bu, zaten uygulama kodunu değiştirebilmekle aynı güven seviyesidir.

**Kurulum (bir kez).** Sunucu, bu bölümün geldiği sürümü bir kez elle çekmiş olmalı (`cd /srv/src/love-site && git pull`).

1. **Sunucunun SSH parmak izini oku** (sunucuda):
   ```bash
   ssh-keygen -lf /etc/ssh/ssh_host_ed25519_key.pub
   ```
2. **Mac'ten görülen parmak izini oku.** 1. adımdaki ile aynı olmalı; değilse dur:
   ```bash
   ssh-keyscan -t ed25519 31.77.69.86 2>/dev/null | ssh-keygen -lf -
   ```
3. **Anahtarı üret ve üç repoya secret olarak koy** (Mac'te). Özel anahtar geçici bir klasöre yazılır ve komut nasıl biterse bitsin silinir:
   ```bash
   (D=$(mktemp -d) && trap 'rm -rf "$D"' EXIT && ssh-keygen -q -t ed25519 -N "" -C github-actions-deploy -f "$D/key" && ssh-keyscan -t ed25519 31.77.69.86 2>/dev/null > "$D/known_hosts" && for r in love-site FCarrierTacticBuilderBackend FCarrierTacticBuilderWeb; do gh secret set VDS_DEPLOY_KEY -R bugraburunguz/$r < "$D/key" && gh secret set VDS_KNOWN_HOSTS -R bugraburunguz/$r < "$D/known_hosts" && printf '31.77.69.86' | gh secret set VDS_HOST -R bugraburunguz/$r || exit 1; done && cat "$D/key.pub")
   ```
4. **Ekrana basılan `ssh-ed25519 ... github-actions-deploy` satırını sunucuda kısıtlı olarak ekle.** `ANAHTAR` yerine satırın tamamını yapıştır:
   ```bash
   printf 'command="/srv/src/love-site/deploy/vds/scripts/deploy-trigger.sh",restrict %s\n' 'ANAHTAR' >> ~/.ssh/authorized_keys && tail -1 ~/.ssh/authorized_keys | cut -c1-90
   ```
5. **Dene:** GitHub → love-site → Actions → Deploy → **Run workflow**. Görmelisin: iş yeşil biter, logun sonunda `deploy love done` yazar.

**Bir deploy başarısız olursa:** Actions işi kırmızı biter. Logda hangi adımda durduğu görünür; health kontrolü başarısızsa servisin son 40 log satırı da görünür. Betik ikisinde de kendiliğinden önceki commit'e döner:
- **Build başarısızsa:** hiçbir şey yeniden başlatılmaz, eski sürüm kesintisiz çalışmaya devam eder.
- **Yeni sürüm sağlıklı açılmazsa:** önceki sürüm yeniden build edilip başlatılır. Bu birkaç dakikalık kesinti demektir. Logda `previous version is back up` yazar. `did not come back either` yazıyorsa sunucuya elle bakmak gerekir.

Sorunu düzelten bir commit merge edilince deploy kendiliğinden yeniden çalışır.

**love-site'ın CI'ı yok:** her merge test edilmeden deploy edilir. FC repolarında ise deploy CI yeşil bitince başlar.

## 8. Sonra

- **Mobil uygulama:** `VITE_API_BASE` yeni love domain'i olmalı. Uygulamayı yeniden build et (`docs/reports/mobil.md`). Eski build Railway adresine bakar.
- **Railway:** 1–2 hafta sorunsuz çalışınca son bir yedek al, sonra servisleri sil. Silme işlemini Buğra yapar. Eski anahtarlar ve şifreler Railway'le birlikte geçersiz olur.
- **İzleme:** `LOVE_DOMAIN/actuator/health` ve `FC_DOMAIN` için bir uptime monitörü kur (ör. UptimeRobot).

## Bellek tavanları (6 GB sunucu)

| Servis | mem_limit | Not |
|---|---|---|
| postgres | 1 GB | shared_buffers 256 MB |
| love-worker | 1,5 GB | HEIC, video, export (Chromium / ffmpeg); OOM olursa önce araç ölür, site ayakta kalır |
| love-web | 768 MB | |
| fc-backend | 1 GB | Xmx 512 MB (imajda) |
| garage | 512 MB | |
| caddy / fc-web | 128 / 64 MB | |
| logs-all / logs-fc / docker-ro | 64 MB her biri | ölçülen ~15–25 MB |

Tavanların toplamı yaklaşık 5 GB, ama hepsi aynı anda dolmaz; ani artışlar için 2 GB swap var. Sunucu sürekli swap kullanıyorsa 8 GB'a geç.
