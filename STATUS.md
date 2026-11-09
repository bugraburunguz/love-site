# STATUS — love-site

Güncelleme kuralı: işi yapan oturum, bitirince kendi satırını günceller. Tarih YYYY-MM-DD.

Görev sayacı: 6

| İş | Durum | Son PR / dal | Sıradaki adım | Güncelleme |
|---|---|---|---|---|
| LS-1 VDS taşıma paketi (compose, Caddy, Garage, Postgres, taşıma betikleri, runbook `deploy/vds/README.md`) | master'a merge edildi | #1 | sunucu kurulumu (Buğra, `deploy/vds/README.md` 1–5) | 2026-11-06 |
| LS-2 Bucket CORS kuralı Garage uyumlu (iki başlık yazımı, origin başına kural) | master'a merge edildi; 246/246 test, iki e2e yeşil | #2 | — | 2026-11-06 |
| LS-3 VDS Postgres 18 (Railway love-site DB'si 18; dump yalnız aynı/yeni sürüme açılır) | merge edildi; sunucuda geçiş yapıldı (love 18 tablo, fcassist 61 tablo), site VDS'te canlı | #3 | eski boş `vds_pgdata` volume'ü sonra silinebilir | 2026-11-09 |
| Bekleyen: Railway bucket kopyası (Railway olayı, AccessDenied) | Railway düzelince `migrate-bucket.sh` | — | Railway bucket ve Postgres silinmez | 2026-11-09 |
| LS-4 pg_dump istemcisi ve test Postgres'i 18 (yedek, 18 sunucuyu dump edebilsin) | merge edildi, otomatik deploy ile canlıda | #4 | — | 2026-11-09 |
| LS-5 GitHub Actions ile VDS'e otomatik deploy (forced-command SSH anahtarı, geri dönüş, FC'de CI sonrası) | merge edildi; secret'lar ve sunucu anahtarı kuruldu, ilk deploy yeşil | love-site #5, FC backend #39, FC web #45 | FC deploy'ları ilk merge'de denenecek | 2026-11-09 |
| LS-6 Dozzle ile şifreli log sayfaları (tümü / yalnız FC), salt okunur Docker proxy | PR açık; yerelde prova edildi | dal `ls-6-dozzle-logs` | `.env`'e LOGS_* (Buğra) → merge | 2026-11-09 |
