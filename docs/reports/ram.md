# RAM raporu — love-site servisinin bellek kullanımı

## Neden
Railway kullanım ekranında love-site RAM'i 2071.95 GB-dk (≈0,48 $), Postgres'inki 336.84 GB-dk idi: uygulama Postgres'in ~6 katı
bellek tutuyordu. Kodda iki ana neden vardı:

1. **JVM yığını konteynerin yüzdesiyle boyutlanıyordu** (`-XX:MaxRAMPercentage=75`, worker'da 50). Railway konteynerine izin
   verilen bellek GB'larca olduğu için yığın sınırı da GB'larca oluyordu; G1 aldığı belleği boşta geri vermiyor.
2. **Export'u çizen Node + Chromium, ilk export'tan sonra hiç kapanmıyordu** (birkaç yüz MB, servis yeniden başlayana kadar).

## Değişiklikler
- `Dockerfile`: yüzde yerine **sabit yığın sınırı** `JAVA_MAX_HEAP` (varsayılan `448m`) ve küçük, açık bayraklar:
  `-Xms64m -Xss512k -XX:MaxMetaspaceSize=192m -XX:ReservedCodeCacheSize=64m -XX:+UseG1GC -XX:G1PeriodicGCInterval=60000
  -XX:+ExitOnOutOfMemoryError`. `G1PeriodicGCInterval`: boşta duran süreç dakikada bir GC yapıp kullanılmayan yığını sisteme geri
  veriyor. `JAVA_OPTS` verilirse tüm bayrakların yerini alıyor; `JAVA_MAX_RAM_PERCENTAGE` verilirse eski davranış (yüzde) kullanılıyor.
- `application.yml`: Tomcat en fazla 50 istek iş parçacığı (min 5; varsayılan 200), veritabanı havuzu en fazla 5 bağlantı (min 1;
  varsayılan 10). İki kişilik site için fazlasıyla yeterli.
- `StorageService`: presigned URL önbelleği 50.000 → 10.000 kayıt.
- `RenderDriver`: 2 dk (`app.export.driver-idle`) export gelmezse Node + Chromium kapatılıyor; sonraki export yeniden başlatıyor
  (ilk export'ta ~1–2 sn ek gecikme). Süreç yalnızca export çizen rolde (worker / tek servis) başlıyor, kontrol başka yerde boşa döner.
- e2e compose'daki `JAVA_MAX_RAM_PERCENTAGE: "50"` kaldırıldı; README "Memory" bölümü ve worker kurulum adımı güncellendi.

## Ölçümler (yerel Docker, 4 GB VM, e2e yığını web + worker, aynı senaryo)
Senaryo: başlat → 2 dk boşta → 1 fotoğraf yükle, işlensin, POLAROID + STORY export → 3 dk boşta. `docker stats` bellek kullanımı.

| an | önce (MiB) | sonra (MiB) |
|---|---|---|
| web, 2 dk boşta | 378 | 332 |
| worker, 2 dk boşta | 373 | 325 |
| worker, export bitince | 751 | 438 |
| worker, export'tan 3 dk sonra | 421 (Chromium hâlâ açık) | 377 (Chromium kapalı) |

Ölçümler arasında ±20–30 MiB oynama var (aynı ayarla iki ayrı koşu 332 / 360 MiB verdi). Ek olarak SerialGC ve JIT'i C1'le sınırlamayı
denedim (`JAVA_OPTS` ile, yeniden derlemeden): boşta 338–340 MiB, G1 ile 360 MiB; fark bu gürültünün içinde kaldığı için performanstan
ödün vermemek adına G1 + periyodik GC'de kalındı.

**Yerelde fark neden sınırlı:** 4 GB'lık Docker VM'de eski ayarın yığın sınırı zaten ~1 GB'dı. Railway'de konteyner sınırı çok daha
büyük olduğu için eski ayarla yığın birkaç GB'a kadar büyüyebiliyordu; yeni ayar orada her durumda 448 MB'ta duruyor. Asıl kalıcı
kazanç export sonrası: Chromium artık saatlerce bellekte kalmıyor.

## Railway'de beklenen etki
Railway kullanımı servisin gerçek bellek kullanımına göre ücretlendiriyor. Tek servis (APP_ROLE boş) için beklenti: boşta ~330–380
MiB, export sırasında kısa süreli ~700–800 MiB, 2 dk sonra yeniden ~380 MiB. Eskiden ilk export'tan sonra kalıcı olarak +350 MiB ve
yığın büyüdükçe daha fazlası. Kesin sonucu deploy'dan 1–2 gün sonra Railway Metrics → Memory grafiğinde görmek gerekiyor.

## Test sonuçları
- `RenderDriverIdleTest` (yeni): süreç başlamadan durdurma yok; 1 dk boşta tutuluyor; 2 dk'yı geçince kapanıyor; sonra yeniden başlıyor.
- Backend tam paket (referans test imajı, gün notu commit'i 1c9df17 dahil): **229 test geçti**, 0 hata. Frontend değişmedi.

## ÜRETİMDE ELLE YAPILACAKLAR
1. Deploy'dan sonra Railway → servis → Metrics → Memory: boşta ~350 MiB civarı beklenir. Daha yüksek bir taban görürsen
   `JAVA_MAX_HEAP` değişkeniyle oynayabilirsin (ör. `384m`); `OutOfMemoryError` ile yeniden başlama görürsen yükselt (ör. `640m`).
2. Railway değişkenlerinde `JAVA_MAX_RAM_PERCENTAGE` tanımlıysa **sil** (tanımlı kalırsa eski yüzde davranışı geri gelir).

---

# RAM raporu, 2. tur (26 Ekim) — çekirdek sayısına göre büyüyen bellek

## Neden
1. turun deploy'undan (21 Ekim) 5 gün sonra Railway'de love-site RAM'i hâlâ Postgres'in ~6,5 katıydı (9802 / 1497 GB-dk);
ortalama ~1 GB. Yerelde aynı imaj tek servis olarak boşta ~460 MiB, export'lardan sonra ~630 MiB tutuyordu. Fark:
Railway sunucusu konteynere tüm çekirdeklerini (onlarca) gösteriyor ve süreçlerin çoğu iş parçacığı / bellek havuzunu çekirdek
sayısına göre kuruyor:
- **JVM:** GC işçi iş parçacıkları, JIT derleyici iş parçacıkları ve bunların yerel belleği. Ölçüm (boşta, 12 çekirdekli Docker,
  `-XX:ActiveProcessorCount` ile): 32 CPU → JVM 464 MB, 2 CPU → 368 MB.
- **glibc malloc:** çekirdek başına 8'e kadar "arena"; bir kez büyüyen arena sisteme geri verilmiyor (uzun süre çalışan
  süreçte zamanla şişen bellek). 32 CPU'da `MALLOC_ARENA_MAX=2` tek başına 464 → 421 MB.
- **ffmpeg:** komutlardaki `-threads 2` girişlerden önce olduğu için yalnızca çözmeyi sınırlıyordu; filtre grafiği ve x264
  kodlayıcı çekirdek sayısı kadar iş parçacığı (her birinin kare tamponlarıyla) açıyordu. 12 çekirdekte bir export ffmpeg'i 983 MB'a çıktı.
- **libvips:** çekirdek başına iş parçacığı.

## Değişiklikler
- `Dockerfile`: `JAVA_CPUS=2` (`-XX:ActiveProcessorCount`), `MALLOC_ARENA_MAX=2`, `VIPS_CONCURRENCY=2`, yığın sınırı
  `JAVA_MAX_HEAP` 448m → **384m**, `-XX:MinHeapFreeRatio=10 -XX:MaxHeapFreeRatio=30` (boşta yığını daha çok geri veriyor).
- `Compositor` (export) ve `VideoProcessor` (yükleme döngüsü): `-filter_complex_threads 2 -filter_threads 2`, kodlayıcıya
  çıkış tarafında `-threads 2`.
- Testler: `CompositorThreadsTest`, `VideoThreadsTest` (her kodlama komutunda filtre ve kodlayıcı sınırı).

## Ölçümler (yerel Docker, 12 çekirdek, tek servis `APP_ROLE` boş, tam e2e senaryosu: yükleme + tüm export'lar + 4 dk boşta)
| an | önce (MiB) | sonra (MiB) |
|---|---|---|
| açılış sonrası boşta (konteyner) | 460 | 302 |
| export sırasında ffmpeg en yüksek | 983 | 440 |
| konteyner en yüksek | 1682 | 1318 |
| export'lar bitip Chromium kapandıktan sonra, süreç belleği (anon) | 425 | 324 |
| senaryo boyunca ortalama (konteyner) | 737 | 694 |

Railway'de kazanç bundan büyük olmalı: orada görünen çekirdek sayısı 12 değil onlarca. Kalan ~260 MiB "file" sayfa
önbelleği (Chromium / ffmpeg ikilileri ve geçici dosyalar); çekirdek bellek sıkışınca geri alabildiği bellek.

## ÜRETİMDE ELLE YAPILACAKLAR
1. Railway → love-site → Variables: `JAVA_MAX_RAM_PERCENTAGE` ve `JAVA_OPTS` **tanımlı olmamalı** (tanımlıysa bu ayarların
   hepsini devre dışı bırakır).
2. Railway → love-site → Settings → Deploy: replika sayısı 1 olmalı.
3. Deploy'dan 1 gün sonra Metrics → Memory: boşta ~300–350 MiB beklenir.
