# VDS taşıma runbook'u (LS-1): love-site + FC Assist → tek Ubuntu 24.04 sunucu

Railway'den çıkış. Tek sunucuda: Caddy (HTTPS) · Postgres 17 (iki veritabanı) · Garage (love-site'ın S3 bucket'ı) ·
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
| Sunucu | Ubuntu 24.04 64 bit · en az 4 GB RAM (rahatı 6–8 GB) · 2+ vCPU · disk: bucket boyutu × 1,5 + 30 GB |
| Domain | 3 ad, hepsi sunucu IP'sine A kaydı: `LOVE_DOMAIN`, `LOVE_S3_DOMAIN` (ör. `s3.` + love domain), `FC_DOMAIN`. Taşımadan 1 gün önce TTL'i 300 sn yap |
| Sunucu dışı yedek | S3 uyumlu ikinci bir bucket (Cloudflare R2 ya da Backblaze B2). Sunucu diski giderse tek kopya budur |
| GitHub erişimi | 3 private repo için sunucuda salt okunur deploy key (repo → Settings → Deploy keys) |
| Railway | Olay (incident) bitmiş olmalı, bucket'ın Files sekmesi açılıyor olmalı |

Bucket boyutunu Railway'de bucket → Metrics'ten oku; disk seçimi buna göre yapılır.

## 1. Sunucunun ilk kurulumu (bir kez, root)

```bash
scp deploy/vds/scripts/setup-ubuntu.sh root@SUNUCU_IP: && ssh root@SUNUCU_IP 'bash setup-ubuntu.sh'
```

Betik şunları yapar: güncellemeler ve otomatik güvenlik yamaları, `deploy` kullanıcısı (root'un SSH anahtarıyla), şifresiz ve root'suz SSH, ufw (22/80/443), Docker'ın kendi deposundan Docker + compose, 2 GB swap, İstanbul saati, `/srv/src` ve `/srv/backups`.
**Görmelisin:** son satır `ready`. Root oturumunu kapatmadan **yeni bir terminalde** `ssh deploy@SUNUCU_IP` ile girebildiğini dene.

## 2. Kod ve ayarlar (deploy kullanıcısı)

```bash
cd /srv/src && git clone git@github.com:bugraburunguz/love-site.git && git clone git@github.com:bugraburunguz/FCarrierTacticBuilderBackend.git && git clone git@github.com:bugraburunguz/FCarrierTacticBuilderWeb.git
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
5. **Başlat:** `docker compose up -d`. Caddy sertifikaları ilk istekte alır.
6. **Kontroller:**
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

## 7. Güncelleme (her yeni sürümde)

```bash
cd /srv/src/love-site && git pull && cd ../FCarrierTacticBuilderBackend && git pull && cd ../FCarrierTacticBuilderWeb && git pull && cd /srv/src/love-site/deploy/vds && docker compose up -d --build
```

## 8. Sonra

- **Mobil uygulama:** `VITE_API_BASE` yeni love domain'i olmalı. Uygulamayı yeniden build et (`docs/reports/mobil.md`). Eski build Railway adresine bakar.
- **Railway:** 1–2 hafta sorunsuz çalışınca son bir yedek al, sonra servisleri sil. Silme işlemini Buğra yapar. Eski anahtarlar ve şifreler Railway'le birlikte geçersiz olur.
- **İzleme:** `LOVE_DOMAIN/actuator/health` ve `FC_DOMAIN` için bir uptime monitörü kur (ör. UptimeRobot).

## Bellek tavanları (4 GB sunucu)

| Servis | mem_limit | Not |
|---|---|---|
| postgres | 1 GB | shared_buffers 256 MB |
| love-worker | 1 GB | HEIC ve video; OOM olursa önce araç ölür, site ayakta kalır |
| love-web | 768 MB | |
| fc-backend | 1 GB | Xmx 512 MB (imajda) |
| garage | 512 MB | |
| caddy / fc-web | 128 / 64 MB | |

Tavanların toplamı 4 GB'ı geçer ama hepsi aynı anda dolmaz; ani artışlar için 2 GB swap var. Sunucu sürekli swap kullanıyorsa 8 GB'a geç.
