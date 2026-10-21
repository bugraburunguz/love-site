# Gizlilik politikası ve hesap silme raporu (mağaza ön koşulları)

## Ne yapıldı
- **`/gizlilik`** — herkese açık, Türkçe gizlilik politikası (oturum gerekmez; varsayılan temanın kâğıdı, hata ekranıyla aynı görünüm). İçerik: toplanan veriler (e-posta, görünen ad, bcrypt şifre özeti, fotoğraf/video/müzik, açıklamalar, albüm adları, takvim notları, özel günler, dosya bilgileri ve çekim tarihi), amaç (yalnızca özel albüm), reklam/takip yok, üçüncü tarafla paylaşım yok (yalnızca altyapı sağlayıcıları), saklama (bucket + PostgreSQL, gece yedeği ayrı bucket'a, veritabanı dökümleri 14 gün), çöp 30 gün, yedekteki kopyalar 30 gün sonra, export dosyaları 24 saat, hesap silme yolu, haklar (KVKK/GDPR) ve iletişim adresi. Giriş sayfasında küçük bir "Gizlilik" bağlantısı var.
- **`/hesap-silme`** — Google Play'in "hesap silme URL'si" için oturumsuz açıklama sayfası: uygulama içi yol (raf → `⋯` → Hesabımı sil), neyin silindiği, süreler, giriş yapamayanlar için iletişim adresi.
- **İletişim adresi:** `GET /api/legal` (herkese açık) → `PRIVACY_CONTACT_EMAIL`; boşsa `gizlilik@<APP_PUBLIC_URL host'u>` (yalnızca noktalı gerçek bir alan adıysa), o da yoksa sayfalar adres göstermeden "uygulama yöneticisi" der.
- **"Hesabımı sil"** — raftaki adın yanındaki yeni `⋯` menüsünde (Gizlilik + Hesabımı sil). Pencere ne olacağını alan durumuna göre açıkça yazıyor (tek üye / partner var / sahiplik devri), şifre ve "okudum" kutusu istiyor; sonra oturum kapanıyor ve giriş sayfasında "Hesabın silindi" notu çıkıyor. Web ve uygulama aynı kodu kullanıyor.
- **Backend (`account/` paketi):** `POST /api/account/delete` (`{password}`), web'de CSRF, uygulamada `X-Auth-Token` (mevcut kurallar). Kullanıcı başına 15 dakikada 5 deneme; yanlış şifre `403`, hiçbir şey değişmez; şifre hiçbir yerde loglanmaz (log satırlarında yalnızca kullanıcı/alan UUID'si).
  - **Alanın tek üyesi:** alan her şeyiyle siliniyor — albümler, medya (çöpteki dahil, tüm varyantlar), müzikler, sayfalar, export'lar, özel günler, günlük notlar, davetler — ve `spaces/{alan}/` altındaki tüm bucket nesneleri. Medya ve müzik, `TrashPurgeJob`'a eklenen `purgeSpace` ile siliniyor: gece çöp temizliğiyle aynı kod (önce nesneler, sonra satır) ve aynı `PurgeLog`; yedekteki kopyalar mevcut 30 günlük `purged_object` kuralıyla siliniyor. Bir dosya silinemezse `503` döner ve işlem tekrarlanabilir; hesap ve alan satırları ancak tüm dosyalar gidince silinir. Açık davetler ve export işleri en başta silindiği için silme sırasında kimse alana katılamaz, çalışan bir export kendi dosyalarını temizler (satırını bulamayınca), işlenen bir medya da öyle.
  - **Partner var:** yalnızca kullanıcı ayrılıyor. Albümler, medya, özel günler, export'lar partnere atanıyor, kullanıcı sahipse partner `OWNER` oluyor; kullanıcının kendi günlük notları siliniyor. Karar alan satırında `FOR UPDATE` kilidiyle veriliyor (iki partner aynı anda silerse alan sahipsiz kalmaz).
  - **Her iki durumda:** kullanıcının tüm oturumları (web + uygulama, tüm cihazlar; `SPRING_SESSION` satırları) siliniyor, kullanıcı satırı gidiyor.
- **`deleted_account` tablosu (V15):** e-postanın yalnızca SHA-256 özeti. Başlangıçtaki seeder (`USER1_*`/`USER2_*` hâlâ tanımlı) silinmiş bir hesabı bir sonraki deploy'da geri oluşturmasın diye. Bu, gizlilik politikasında yazıyor.
- `TrashPurgeJob` içeride sadeleşti: medya ve müzik silme döngüleri bir koşul alıyor; gece temizliği aynen eskisi gibi çalışıyor (mevcut testler geçiyor).

## Kararlar
- **Partner durumunda günlük notlar siliniyor, partnere aktarılmıyor:** notlar kişiye ait yazılar; partnerin adıyla görünmeleri yanlış olurdu, ayrıca (alan, yazar, gün) benzersizliği çakışırdı. Pencere ve politika bunu açıkça söylüyor.
- **Platform yöneticisi hesabı uygulamadan silinemiyor (`409`):** bu hesap tüm alanların davetlerini oluşturan işletmeci hesabı, çiftlerin hesabı değil.
- **`DELETE` yerine `POST /api/account/delete`:** gövdeli DELETE'i bazı istemciler/vekiller düşürüyor; şifre her istemcide güvenle gidiyor.
- **Önce dosyalar, sonra satırlar:** yarıda kalan bir silme tekrar denenebilir; tersi olsaydı sahipsiz nesneler bucket'ta kalırdı.

## Test sonuçları
- **Backend, tam paket (referans test imajı): 239 test geçti, 0 hata.** Yeni `AccountDeletionTest` (9 test): tek üye → alanın tüm tabloları ve `spaces/{alan}/` altındaki tüm nesneler (çöpteki medya, varyantlar, müzik, export dosyası, sahipsiz nesne dahil) gidiyor, başka bir alana dokunulmuyor; yanlış/boş şifre 403 ve hiçbir şey değişmiyor (yanıtta şifre yok); CSRF'siz web isteği 403; 5 yanlış denemeden sonra 429; yönetici 409; partner varken içerik kalıyor, partner OWNER oluyor, albüm/medya/özel gün/davet partnere geçiyor, yalnızca gidenin notu siliniyor, partner albümü görmeye devam ediyor; uygulamadan (`X-Auth-Token`, CSRF'siz) silince hem uygulama hem web oturumu 401, tekrar giriş 401; seeder silinmiş hesabı geri oluşturmuyor; `/api/legal` herkese açık. `BackupTest`'e eklenen test: silinen hesabın orijinali ve müziği `purged_object`'e yazılıyor, yedekte 29. gün duruyor, 31. gün siliniyor.
- **Frontend:** 130 vitest geçti (yeni `legal.test.ts`: tek üye / partner / sahiplik devri uyarı metinleri), `tsc -b` temiz.
- **Uçtan uca (`./e2e/run.sh`):** yeni adım — oturumsuz giriş sayfasından "Gizlilik" bağlantısı → politika, `/hesap-silme`, `/api/legal` 200; B kullanıcısı (alanının tek üyesi) rafta `⋯` → Hesabımı sil → uyarı → şifre + kutu → giriş sayfası ve "Hesabın silindi"; `/api/auth/me` 401, tekrar giriş 401, A'nın 6 albümü yerinde. Ekran görüntüleri: `e2e/output/privacy.png`, `delete-account.png`.

## Test edemediklerim
- Uygulama içinde cihazda / emülatörde (mobil raporundaki aynı sebep: Xcode yok, ARM emülatörü kurulamadı). Uygulamanın kullandığı API yolu (`X-Auth-Token`, CSRF'siz) backend testinde doğrulandı; arayüz web ile aynı kod.
- Gerçek Railway bucket'ında silme (testler S3 uyumlu CloudServer'la).

## Bilinen sınırlar
- Silme sırasında başka bir sekmede başlamış bir yüklemenin dosyası, imzalı URL'nin süresi (15 dk) içinde bucket'a yazılırsa satırsız kalabilir (çok dar bir zaman penceresi; yükleme yapan kişi hesabını silen kişinin kendisi).
- Export'ları `SKIP_EXPORTS=1` ile atlamak `run.sh` üzerinden çalışmıyor (değişken runner konteynerine aktarılmıyor); bu değişiklikle ilgisiz, mevcut bir durum.

## ÜRETİMDE ELLE YAPILACAKLAR (MANUAL)
1. Railway'de (web ve worker) **`PRIVACY_CONTACT_EMAIL`**'i gerçek bir posta kutusuna ayarla. Ayarlanmazsa `*.up.railway.app` adresinden `gizlilik@hatiradefterim.up.railway.app` türer ve bu adres posta almaz.
2. Deploy'dan sonra `https://<adres>/gizlilik` ve `/hesap-silme`'yi oturum açmadan aç, iletişim adresini kontrol et.
3. Mağaza formları: Google Play → gizlilik politikası URL'si `<adres>/gizlilik`, hesap silme URL'si `<adres>/hesap-silme`, veri güvenliği formunda "kullanıcı hesabının silinmesini isteyebilir: evet, uygulama içinden". App Store Connect → Privacy Policy URL `<adres>/gizlilik`; inceleme notuna "Hesap silme: raf → ⋯ → Hesabımı sil" yaz.
4. Uygulamaları `npm run cap:sync` ile yeniden derle (yeni ekranlar uygulamanın gömülü kopyasında da olmalı).
5. Politika metnini (özellikle "altyapı sağlayıcıları" ve haklar bölümü) kendi durumuna göre bir kez oku; hukuki danışmanlık yerine geçmez.
