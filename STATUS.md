# STATUS — love-site

Güncelleme kuralı: işi yapan oturum, bitirince kendi satırını günceller. Tarih YYYY-MM-DD.

Görev sayacı: 7

| İş | Durum | Son PR / dal | Sıradaki adım | Güncelleme |
|---|---|---|---|---|
| LS-1 VDS taşıma paketi (compose, Caddy, Garage, Postgres, taşıma betikleri, runbook `deploy/vds/README.md`) | master'a merge edildi | #1 | sunucu kurulumu (Buğra, `deploy/vds/README.md` 1–5) | 2026-11-06 |
| LS-2 Bucket CORS kuralı Garage uyumlu (iki başlık yazımı, origin başına kural) | master'a merge edildi; 246/246 test, iki e2e yeşil | #2 | — | 2026-11-06 |
| LS-3 VDS Postgres 18 (Railway love-site DB'si 18; dump yalnız aynı/yeni sürüme açılır) | merge edildi; sunucuda geçiş yapıldı (love 18 tablo, fcassist 61 tablo), site VDS'te canlı | #3 | eski boş `vds_pgdata` volume'ü sonra silinebilir | 2026-11-09 |
| Bekleyen: Railway bucket kopyası (Railway olayı, AccessDenied) | Railway düzelince `migrate-bucket.sh` | — | Railway bucket ve Postgres silinmez | 2026-11-09 |
| LS-4 pg_dump istemcisi ve test Postgres'i 18 (yedek, 18 sunucuyu dump edebilsin) | merge edildi, otomatik deploy ile canlıda | #4 | — | 2026-11-09 |
| LS-5 GitHub Actions ile VDS'e otomatik deploy (forced-command SSH anahtarı, geri dönüş, FC'de CI sonrası) | merge edildi; secret'lar ve sunucu anahtarı kuruldu, ilk deploy yeşil | love-site #5, FC backend #39, FC web #45 | FC deploy'ları ilk merge'de denenecek | 2026-11-09 |
| LS-6 Dozzle ile şifreli log sayfaları (tümü / yalnız FC), salt okunur Docker proxy | merge edildi; LOGS_* `.env`'de, deploy yeşil, sayfalar canlı (401 ile şifre sorar) | #6 | — | 2026-11-09 |
| LS-7 Herkese açık kayıt (`/kayit`, 50 MB ücretsiz alan, toplam 3 GB havuz, IP başına 3/saat, ücretsiz alanda video ≤ 20 MB, günde toplam 10 kayıt, 30 gün boş kalan ücretsiz alan silinir), davetli varsayılan 1 GB, ilk alan 5 GB, disk %85 uyarısı | PR açık; kabul edilen risk: kayıt bir e-postanın üye olup olmadığını söyler (409); sınır sayaçları bellekte, deploy'da sıfırlanır | dal `ls-7-signup-quotas` | merge → `/admin`'de eski alanı 5 GB yap, disk uyarısını kur (`deploy/vds/README.md` 6b) | 2026-11-09 |
| Sonraki: yeni tasarım (Stitch) LS-8…LS-13 | planlandı | — | LS-8 tasarım temeli | 2026-11-09 |
