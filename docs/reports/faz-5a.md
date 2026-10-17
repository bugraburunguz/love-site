# Faz 5a raporu — kalıcı sayfalar, şablonlar, editör

## Değişiklikler
**Backend**
- `V8__pages.sql`: `page`, `page_item`, `media.featured`. `page_item.media_id` unique (null hariç); `page(album_id, page_index)` unique ama
  *deferrable* (araya sayfa eklerken indeksler tek `UPDATE` ile kaydırılabiliyor). Sayfa/öğe/medya silme `ON DELETE CASCADE`, yani kalıcı silme job'ı
  (`TrashPurgeJob`) değişmeden çalışıyor.
- `page/PageService` (JdbcTemplate): okuma, `initialize`, sayfa ekle/sil/sırala, şablon değişimi, öğe taşı/ekle/sil/konum, `feature`, `autoPlace`, `removeMedia`.
  `page/PageController`: spec'teki tüm uç noktalar. `ApiException.with(key, value)` ile 409 yanıtına `current` (güncel kayıt) ekleniyor.
- `MediaService`: upload isteğine `featured`, `complete` sonrası `autoPlace`, medya silinince sayfadan çıkarma.
- IDOR: yeni uç noktaların hepsi `space_id` ile sorgu seviyesinde kapsanıyor (`PageIdorTest`).

**Frontend**
- `autoLayout.ts` sayfa bazlı fonksiyonlara bölündü: `layoutAutoPage`, `layoutFeaturedPage`, `initialDistribution` (eski `autoLayout`/`pageSizes` yalnızca tek seferlik
  başlangıç dağılımı için ve eski testler için duruyor). `layout/pageLayout.ts`: kayıtlı sayfa → yerleşim, `freezePayload`.
- `api/pages.ts`, `hooks/usePages.ts` (409 yönetimi, 300 ms debounce'lu optimistic konum yazımı, öğe başına tek istek), `AlbumPage` yeniden yazıldı
  (sayfalar veritabanından, pencere odağında yeniden çekme).
- Düzenleme modu: `book/ItemEditor` (interact.js: sürükle, döndür, ölçekle), `edit/PageBar`, `edit/Tray`, `edit/UploadSetupDialog` ("Tek sayfa").

## Migration'lar
`V8__pages.sql` (yukarıda). Mevcut albümler için veri migration'ı yok: ilk açılışta frontend `initialize` çağırıyor (spec'teki gibi).

## Editör kütüphanesi
**interact.js 1.10.28.** `react-moveable` son sürümü 2023-12 (0.56.0), yani aktif bakım görmüyor; interact.js'in son sürümü 2026-08-01, haftalık ~694 bin indirme,
dokunmatik/pointer olaylarını tek API'de topluyor, React'ten bağımsız (sürüm sıkıntısı yok) ve yalnızca düzenleme modunda lazy yükleniyor (ana bundle'a girmiyor).
Dönüş ve ölçek tutamaçları kendi kodum (interact'ın sürükleme olaylarının üstünde), çünkü interact'ta hazır döndürme yok.

## Kararlar
- **Sayfa içinde sıra değiştirme = araya yerleştirme.** AUTO sayfada bir fotoğrafı başka fotoğrafın üstüne bırakınca öğe o slota *eklenir*, diğerleri kayar. İki fotoğrafta
  swap ile aynıdır, 3–4'te doğal "yer değiştirme" hissi verir ve tek istekle atomik. (Ayrı swap uç noktası eklemedim.)
- **Albüm satırı kilidi.** Tüm yazmalar albüm satırını kilitliyor (eşzamanlı `complete`/taşıma/şablon değişimi güvenli); `version` ise kullanıcılar arası ezmeyi yakalıyor.
  `version`: şablon değişimi için zorunlu, öğe `PATCH` için zorunlu, taşı/sil için opsiyonel (verilirse kontrol edilir).
- **Sayfa sırası değişimi** için `version` yerine tam sayfa-id listesi bekleniyor; liste güncel kümeyle birebir değilse 409 + güncel durum.
- **"Öne çıkar"** eski sayfada hiçbir şey kalmazsa o boş sayfayı siliyor (tek fotoğraflı AUTO sayfayı öne çıkarınca boş sayfa kalmasın diye). Zaten tek başına FEATURED ise no-op.
- **Sayfası olmayan albüme yükleme**: `complete` hiçbir şey yerleştirmiyor (medya tepside bekler); ilk açılışta `initialize` hepsini dağıtır. Böylece eski fotoğraflar
  yeni bir yüklemeyle sayfa 1'e itilmiyor.
- **FREE → AUTO/FEATURED'da taşan fotoğraflar** (FREE'de 4'ten fazla olabilir) arkadan 4'erli yeni AUTO sayfalara gidiyor.
- **Seçili öğe menüsü** ekranın altında sabit bir araç çubuğu (seçili fotoğraf için): ölçekli sayfa içinde küçük bir menü dokunmatikte kullanılamaz, ayrıca çubuğun yüksekliği
  sabit (çıkıp kaybolsa kitap yeniden boyutlanıp tüm sayfalar yeniden hesaplanırdı).
- **Düzenleme modunda "+" yükleme düğmesi gizli** (araç çubuğunun üstüne biniyordu); yükleme düzenleme dışında.
- **"Tek sayfa"**: dosya seçilince küçük bir pencere açılıyor (dosya başına ve "hepsi" onay kutusu), sonra yükleme başlıyor.
- AUTO/FEATURED konumları ekran ölçeğine göre (altyazı yüksekliği) yeniden hesaplandığı için düzenleme modunda kitap küçülünce AUTO sayfalardaki fotoğraflar biraz yer değiştirebilir;
  bu spec'teki "render sırasında hesaplanır" tasarımının doğal sonucu. FREE'ye "dondurma" o anki ekranda çizilen konumları yazar.
- Sayfa küçük resimleri basit bir ızgara (konum önizlemesi değil).

## Varsayımlar
- Sayfa koordinatı 1000×1400 sayfa birimi; FREE konumları x∈[-500,1500], y∈[-500,1900] arası kabul ediliyor, tutamaç/sürükleme merkezi sayfa içinde tutuyor.
- Boş sayfa (içi boş AUTO/FREE) geçerli; kullanıcı silebilir.

## Test sonuçları
- Backend: **153 test geçti** (yeni: `PagesApiTest` 20 — initialize idempotent + eşzamanlı, otomatik yerleşim, 12 eşzamanlı `complete`'te slot çakışması yok, şablon geçişleri, sayfa silme → tepsi,
  move/swap, 409'lar, unique yerleşim; `PageIdorTest` 22 — 11 uç nokta × (404 ve değişmezlik, 401)).
- Frontend: **39 vitest geçti** (yeni: AUTO 1–4 × 4 ekran × 25 tohum × karışık oranlar, FEATURED × 7 oran × 4 ekran × 25 tohum, determinizm, FREE render, dondurma yükünün çizilenle birebir aynı olması, başlangıç dağılımı).
- Production benzeri Docker yığınında (Postgres + S3 + uygulama imajı) elle: ilk açılışta başlatma, FREE'ye dondurma, sürükleme/döndürme + yenilemede kalıcılık, AUTO'da sürükle-sırala,
  tepsiye gönderme/tepsiden ekleme, 390 px mobil düzen. Ekran görüntüleri: `docs/screenshots/faz5a-{view,edit}-{desktop,mobile}.jpg`.

## Test edemediklerim
- Gerçek dokunmatik cihazda (parmakla) sürükleme/döndürme: yalnızca mobil görünüm boyutunda fareyle denendi. interact.js pointer olaylarını kullanıyor ve tutamaçlar ≥46 px, ama gerçek cihazda doğrulanmadı.
- "Tek sayfa" yükleme penceresi elle denenmedi (tarayıcı panelinden dosya seçilemiyor); arka ucu (`featured`) testle doğrulandı.
- İki cihazda gerçek 409 akışı (arayüz bildirimi) elle denenmedi; sunucu tarafı testli, arayüz yalnızca kodla.
- Safari/iOS.
- Page bar'da sayfa sürükleyerek sıralama arayüzü elle denenmedi (reorder uç noktası testli).

## Bilinen sorunlar
- Düzenleme modunda AUTO sayfalarda ekran ölçeği değişince (araç çubuğu açılınca) otomatik konumlar değişebilir (yukarıda).
- Sayfa küçük resimleri yalnızca ilk ≤4 fotoğrafı gösteriyor.
- Düzenleme modunda lightbox ve altyazı düzenleme yok (spec gereği); altyazıyı düzenleme dışında lightbox'tan değiştirmek gerekiyor.
