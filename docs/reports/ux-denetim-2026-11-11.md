# Kullanılabilirlik denetimi — 2026-11-11

Nasıl yapıldı: yerel üretim kopyası (`KEEP=1 ./e2e/run.sh`, test kullanıcısı), masaüstü 800px ve telefon 375px; iOS
uygulaması simülatörde ve Buğra'nın iPhone'unda. Canlı veriye yazılmadı.

## A. Buğra'nın bildirdikleri (kök nedenleriyle)

| # | Sorun | Kök neden | Öneri |
|---|---|---|---|
| A1 | Tema "çalışmıyor" | Hata değil: tema yalnızca "Temayı kaydet"e basınca kalıcı oluyor; seçince sadece önizleme | Temaya dokununca hemen kaydet, altta "Tema değişti · Geri al" bildirimi; "Temayı kaydet" düğmesi kalksın |
| A2 | Özel günlerde × çalışmıyor | "Ekle" formu açıkken pencere kilitleniyor (`SpecialDaysDialog.tsx:60` `dismissable={!draft}`): × soluk, dışarı tıklama ve Esc kapalı | × ve dışarı tıklama her zaman kapatsın; yazılmış bir şey varsa tek soru: "Vazgeçilsin mi?" Aynı kural tüm pencerelere |
| A3 | Video kendi kafasına göre kırpılıyor | Sunucu her videonun **ilk 3 saniyesini** alıyor (`VideoProcessor.java:21`) | Yüklemeden önce kırpma ekranı: zaman şeridinde 3 sn'lik pencereyi kaydır, canlı önizleme; seçilen başlangıç sunucuya gider |

## B. Yüksek öncelik (kullanıcıyı şaşırtan / takılan)

1. **Kaydedilmeyen değişiklik kalıbı:** tema dışında da "seç → ayrıca kaydet" var (albüm ayarları, sayfa görünümü). Kural: seçim = kayıt + Geri al.
2. ~~İşlenen fotoğraf kırık resim gösteriyor~~ — **düzeltme:** yerel ortamın dosya sunucusu adresi (`s3:8000`) tarayıcıdan erişilemediği için görüldü; canlıda yok. Kalan küçük iş (D): bir resim yüklenemezse (süresi dolmuş bağlantı, ağ) raf kapağı, takvim ve şeritte kırık simge yerine yer tutucu.
3. **Açılış ekranı:** her sayfa yenilemede 1–2 sn eski tasarımlı "Defter açılıyor…" (açık krem) görünüyor; gece okumasında da açık renk parlıyor. Yeni tasarım renkleri + iskelet görünüm.
4. **Albüm çubuğu (telefon):** dört simge düğme etiketsiz (✦, paylaş, ayar, kalem); başlık "TELEFON…" diye kesiliyor. Düzenlemede "‹ Bitir" ve "Düzenlemeyi bitir" aynı işi yapan iki düğme.
5. **Hatıra çantası (telefon):** ekranın %88'ini kaplayan yan çekmece; sekmeler iki satıra kırılıyor; her açılışta "Renk ve doku"dan başlıyor. Telefonda alttan açılan yaprak (bottom sheet), son kullanılan sekme hatırlansın.
6. **Albüm ayarları penceresi:** panel yarı saydam, arkadaki sayfa içinden görünüyor; gece okumasında tema kartları açık gri zemin + gri yazı (okunmuyor).

## C. Orta öncelik (tutarlılık, anlaşılırlık)

7. Raf kartı menüsünde **"Sil"**, başka her yerde **"Çöpe taşı"** — tek dil.
8. Düzenleme paneli jargonu: **Otomatik / Tek fotoğraf / Serbest** açıklamasız. Kısa açıklama ya da küçük önizleme.
9. **"Sayfayı sil"** yerleşim seçeneklerinin hemen yanında; tehlikeli eylem sık kullanılanların yanında durmamalı (menüye al).
10. Özel gün **simgeleri** (kalp, yüzük, pasta, uçak, yıldız, ev) etiketsiz; kağıt dokusu kareleri etiketsiz ve birbirine benziyor.
11. Takvimdeki **"?" rozeti** (tarihi kesin olmayan anı) anlamı yazmıyor.
12. Raf kartı **"…" düğmesi** ~28px; dokunma hedefi en az 44px olmalı.
13. Takvimdeki "Tüm albümler" yerel `select`; uygulamada web formu gibi duruyor (ayar düğmesi + liste yaprağı).

## D. Düşük öncelik (cila)

14. Rafa dönerken kartlar bir an boş çerçeveyle geliyor (liste her girişte yeniden çekiliyor) — son listeyi önbellekte tut.
15. Albüm açılırken boş masa + "Albüm açılıyor…" yazısı — kitap iskeleti.
16. Uygulama: sağdan kaydırma da ileri gidiyor (LS-16 incelemesinden açık kalan, düşük).

## Önerilen iş bölümü

- **LS-19 Hızlı düzeltmeler:** A1, A2 (+ tüm pencerelerde kapatma kuralı), B1, 7, 12. Yapıldı; B1'de yalnız albüm teması ayrı kayıt istiyordu (sayfa teması ve rengi zaten dokununca uygulanıyor).
- Ek bulgu: özel günler listesindeki "Sil" onay sormadan ve geri alınamaz şekilde siliyor (düşük, LS-22'ye).
- **LS-20 Video kırpma ekranı:** A3 (istemci kırpma ekranı + `clip_start_ms` göçü + işleyicide `-ss`).
- **LS-21 Albüm ekranı telefonda:** B4, B5, 8, 9, 10.
- **LS-22 Açılış ve bekleme:** B3, 14, 15, B6, 11, 13.
