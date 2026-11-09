# STATUS — love-site

Güncelleme kuralı: işi yapan oturum, bitirince kendi satırını günceller. Tarih YYYY-MM-DD.

Görev sayacı: 3

| İş | Durum | Son PR / dal | Sıradaki adım | Güncelleme |
|---|---|---|---|---|
| LS-1 VDS taşıma paketi (compose, Caddy, Garage, Postgres, taşıma betikleri, runbook `deploy/vds/README.md`) | master'a merge edildi | #1 | sunucu kurulumu (Buğra, `deploy/vds/README.md` 1–5) | 2026-11-06 |
| LS-2 Bucket CORS kuralı Garage uyumlu (iki başlık yazımı, origin başına kural) | master'a merge edildi; 246/246 test, iki e2e yeşil | #2 | — | 2026-11-06 |
| LS-3 VDS Postgres 18 (Railway love-site DB'si 18; dump yalnız aynı/yeni sürüme açılır) | PR açık; yerelde 18→18 ve 16→18 prova edildi | dal `ls-3-postgres-18` | merge → sunucuda boş pgdata volume'ünü sil, 9. adım | 2026-11-09 |
| Bekleyen: Railway bucket kopyası (Railway olayı, AccessDenied) | Railway düzelince `migrate-bucket.sh` | — | Railway bucket ve Postgres silinmez | 2026-11-09 |
