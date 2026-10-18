# Mobil uygulama raporu — iOS + Android (Capacitor)

## Ne yapıldı
- **Yaklaşım:** Capacitor 8.5.3. Mevcut React uygulaması uygulamanın içine gömülüyor (`frontend/ios/`, `frontend/android/`), API'yi canlı siteden (`VITE_API_BASE`, `frontend/.env.mobile`) çağırıyor. Ayrı bir mobil kod tabanı yok; sitede yapılan her değişiklik `npm run cap:sync` ile uygulamaya geçiyor.
- **Kimlik / oturum (backend `mobile/` paketi):** Web ile aynı sunucu tarafı oturum; uygulamada oturum kimliği çerez yerine `X-Auth-Token` başlığında taşınıyor (Capacitor Preferences'ta saklanıyor), istekler `X-Client: love-site-app` gönderiyor. Bu isteklerde backend çerezi hiç okumuyor; bu yüzden CSRF token'ı gerekmiyor ve XSRF çerezi de üretilmiyor. CORS yalnızca `/api/**` için ve yalnızca uygulama kaynaklarına (`capacitor://localhost` iOS, `https://localhost` Android) açık, kimlik bilgisi (`credentials`) yok. Web'in çerez akışı ve CSRF koruması hiç değişmedi.
- **Bucket CORS:** Uygulamadan doğrudan yükleme için uygulama kaynakları CORS kuralına ekleniyor. Sağlayıcı `capacitor://` kaynağını reddederse kural yalnız web kaynaklarıyla yeniden uygulanıyor (web yüklemeleri asla bozulmuyor; log'da uyarı).
- **Native davranışlar (`frontend/src/native/`):** Export'lar, "Orijinal dosya" ve sticker paketi web görünümünde indirilemediği için sistem paylaşım sayfasına gidiyor (Instagram, WhatsApp, "Resmi/Videoyu kaydet", Dosyalar) — `@capacitor/share` + `@capacitor/filesystem`. Durum çubuğu sayfanın üstünde (güvenli alanlar CSS'te), açılış ekranı, Android geri tuşu, davet bağlantıları uygulama kaynağı yerine sitenin adresini kullanıyor.
- **İkon ve açılış ekranı:** Özgün çizim (krem zemin üzerinde bordo deri defter, dikiş çerçevesi, altın kalp) — `frontend/resources/icon.svg`, `splash.svg`; `npm run cap:assets` tüm boyutları üretiyor (Android 100, iOS 13 dosya).
- **iOS izin metinleri (Info.plist, Türkçe):** kamera, fotoğraf arşivi, fotoğraf arşivine kaydetme (paylaşım sayfasındaki "Resmi kaydet" için zorunlu; yoksa iOS uygulamayı kapatır), mikrofon. Geliştirme dili `tr`.
- **Bu çalışma sırasında web'de de düzeltilenler:**
  - Hareketli polaroid MP4'ü 2000 px'te ffmpeg'i 4 GB'lık ortamda bellek yüzünden öldürdü (çıkış 137) → MP4 artık uzun kenarı **1080 px** (Instagram boyutu, ~3,4 kat az bellek); durağan PNG/JPEG 2000 px kalıyor. Video boyutları her zaman çift sayı (H.264 şartı).
  - Export kartları kitabın üstüne binip fotoğraflara tıklamayı engelleyebiliyordu → aynı anda tek kart (en son başlatılan en üstte; diğerleri Paylaş penceresinde), kart her durumda kapatılabiliyor (iş arka planda sürüyor).

Uygulama kimliği `com.hatiradefterim.app`, adı "Anılarımız" (`frontend/capacitor.config.ts`).

## Kararlar
- **Capacitor, uzak URL modu yerine gömülü dosyalar:** Uygulamanın siteyi uzaktan yüklediği mod Capacitor'da üretim için önerilmiyor ve Apple'ın "yalnızca web sitesi sarmalayıcısı" (4.2) gerekçesiyle red riski yüksek. Gömülü dosyalar + native paylaşım/kaydetme daha sağlam.
- **Bearer/JWT yerine başlıkta oturum kimliği:** Yeni bir token sistemi kurmak yerine Spring Session'ın aynı oturumu; çıkış yapınca token anında geçersiz, 30 günlük süre web ile aynı, sunucu tarafında iptal edilebilir.
- **CSRF muafiyeti yalnızca `X-Client` başlıklı isteklere:** Bu isteklerde çerez okunmadığı için sahte istekle kullanılabilecek kendiliğinden giden bir kimlik bilgisi yok; başka bir site bu başlığı CORS'tan geçmeden gönderemiyor.
- **İndirme yerine paylaşım sayfası:** iOS ve Android web görünümleri dosya indirmiyor; paylaşım sayfası hem galeriye kaydetmeyi hem Instagram/WhatsApp'ı kapsıyor, ek izin/eklenti gerekmiyor.

## Test sonuçları
- **Backend:** `MobileAuthTest` 4 test geçti — uygulama CSRF'siz giriş yapıyor ve oturumu `X-Auth-Token` ile alıyor (çerez yok, XSRF çerezi yok); token yalnız uygulama başlığıyla geçerli, web isteği olarak 401; çıkıştan sonra 401; web çerezi `X-Client` ile gönderilirse kimlik doğrulanmıyor (401); web girişi hâlâ CSRF istiyor (403); CORS ön kontrolü yalnızca iki uygulama kaynağına izin veriyor, yabancı kaynak 403.
- **Frontend:** 122 vitest geçti (export layout'a çift boyut ve 1080 px video kontrolü eklendi), `tsc -b` temiz, `npm audit --omit=dev` 0.
- **Uçtan uca (`./e2e/run.sh`, production imajı, web + worker): "OK: the whole journey worked"** — Faz 6 + Faz 7'nin tamamı ve yeni "store app API" adımı: `capacitor://localhost` ön kontrolü 200, yabancı kaynak 403; `X-Client` ile giriş → `X-Auth-Token`, oturum ve XSRF çerezi yok; token ile albüm oluşturma; yükleme isteği; bucket'ın `https://localhost` kaynağından CORS ön kontrolü ve doğrudan PUT; `complete`; token uygulama başlığı olmadan 401; çıkıştan sonra 401.
- **Tüm backend paketi (referans test imajı): 222 test geçti.** Bucket CORS testi yeni davranışa göre güncellendi (web kaynağı + iki uygulama kaynağı).
- **Android:** `./gradlew assembleDebug` başarılı, `app-debug.apk` 6,5 MB (Gradle eksik Android SDK Platform 36 ve Build-Tools 35'i kendisi indirdi).
- **iOS:** proje oluşturuldu, izin metinleri ve ikonlar eklendi; **derlenmedi** (bu Mac'te Xcode yok).

## Test edemediklerim
- **Uygulamanın cihazda / emülatörde çalışması.** Bu Mac'teki Android emülatörü x86_64 (Apple Silicon'da çalışmıyor); ARM64 emülatörü ve Android 15 imajını kurmayı denedim ama ağ ~70 KB/sn'ydi (imaj ~1,5 GB), indirmeyi durdurdum. iOS için Xcode yok. Uygulamanın kullandığı API akışı (CORS, başlıkta token, uygulama kaynağından bucket'a yükleme, çıkış) e2e'de gerçek imajla doğrulandı; ama arayüzün uygulama içinde görünüşü, paylaşım sayfası, açılış ekranı ve güvenli alanlar cihazda denenmedi.
- Railway bucket'ının `capacitor://localhost` kaynağını kabul edip etmediği (deploy sonrası log'da `Bucket CORS configured for origins [...]` satırına bak; reddederse uygulamadan yükleme çalışmaz, web etkilenmez).
- Mağaza incelemeleri.

## Bilinen sorunlar / sınırlar
- Davet bağlantısı (`/invite/...`) uygulamayı değil tarayıcıyı açar (universal link / app link kurulmadı); davet kabulü sitede yapılır, sonra uygulamada giriş yapılır.
- Site özel alan adına taşınınca `frontend/.env.mobile` güncellenip uygulamalar yeniden yayınlanmalı (eski sürüm, eski adres yönlendirme yaptığı sürece çalışır: `/api/**` yönlendirilmez, Railway adresi açık kaldıkça sorun yok).
- Push bildirimi yok.

## ÜRETİMDE ELLE YAPILACAKLAR (MANUAL)
1. Bu sürüm deploy olduktan sonra web log'unda `Bucket CORS configured for origins [..., capacitor://localhost, https://localhost]` satırını kontrol et (uyarı varsa uygulamadan yükleme çalışmaz).
2. **Android'de dene:** Android Studio ile `frontend/android`'i aç (veya `npx cap open android`), telefonunu USB ile bağla → Run. Giriş yap, albüm aç, fotoğraf yükle, bir Story export'u → "Paylaş / Kaydet" → Instagram ve "Kaydet".
3. **iOS'ta dene:** Xcode 16+ kur, `cd frontend && npx cap open ios`, Signing'de Apple hesabını seç, iPhone'u bağla → Run. Aynı adımlar; "Resmi kaydet" izni sorulmalı.
4. **Mağazalar:** README "Store apps → Publishing": Google Play (25 USD, imza anahtarı, .aab, iç test, veri güvenliği formu, gizlilik politikası URL'si) ve App Store (99 USD/yıl, Archive → TestFlight → inceleme; inceleme için ayrı bir test alanı ve demo hesabı oluştur, kendi hesabını verme).
5. Gizlilik politikası sayfası gerekecek (iki mağaza da istiyor); istersen sitede `/gizlilik` sayfası hazırlayabilirim.
