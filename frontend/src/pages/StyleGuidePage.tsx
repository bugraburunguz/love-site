import { useState } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import sampleDusk from '../assets/sample-dusk.svg'
import { Button, Card, Checkbox, Chip, EmptyState, Meter, Modal, Polaroid, TextField, useToast } from '../components/ui'
import { readColorMode, setColorMode, type ColorMode } from '../styles/colorMode'
import './styleguide.css'

const MB = 1024 * 1024
const fmt = (n: number) => (n >= 1024 * MB ? `${(n / (1024 * MB)).toFixed(1)} GB` : `${Math.round(n / MB)} MB`)

/**
 * /tasarim: every base component of the design system on one page, in light and dark. Reachable in development and
 * by the admin; it is the reference the redesigned screens (LS-9 …) are built from.
 */
export default function StyleGuidePage() {
  const { user, loading } = useAuth()
  const toast = useToast()
  const [mode, setMode] = useState<ColorMode>(readColorMode())
  const [modal, setModal] = useState(false)
  const [filter, setFilter] = useState('Tümü')
  const [agree, setAgree] = useState(false)

  if (!import.meta.env.DEV) {
    if (loading) return null
    if (!user?.admin) return <Navigate to="/" replace />
  }

  function pick(next: ColorMode) {
    setColorMode(next)
    setMode(next)
  }

  return (
    <main className="ui sg">
      <div className="ui-container sg__inner">
        <header className="sg__head">
          <div>
            <div className="ui-eyebrow">Tasarım sistemi · LS-8</div>
            <h1>Romantik Kırtasiye</h1>
            <p className="ui-muted">Hatıra Defterim'in ortak parçaları. Yeni ekranlar yalnızca bunları kullanır.</p>
          </div>
          <div className="sg__modes" role="group" aria-label="Görünüm">
            {(['system', 'light', 'dark'] as const).map((m) => (
              <Chip key={m} active={mode === m} onClick={() => pick(m)}>
                {m === 'system' ? 'Sistem' : m === 'light' ? 'Gündüz' : 'Gece okuması'}
              </Chip>
            ))}
          </div>
        </header>

        <section className="sg__section">
          <h2>Renkler</h2>
          <div className="sg__swatches">
            {['bg', 'surface', 'surface-sunk', 'ink', 'ink-muted', 'primary', 'primary-soft', 'accent', 'gold', 'border', 'danger', 'success'].map((n) => (
              <div key={n} className="sg__swatch">
                <span className={`sg__chip sg__chip--${n}`} />
                <code>--ui-{n}</code>
              </div>
            ))}
          </div>
        </section>

        <section className="sg__section">
          <h2>Yazı</h2>
          <Card>
            <div className="ui-eyebrow">Bölüm III · Göreme</div>
            <h1>İkinizin hikâyesi, sayfaların arasında</h1>
            <h2>Kapadokya Kaçamağımız</h2>
            <h3>Gün doğumu ve sıcak balonlar</h3>
            <p>Çiğdem, Şule ve Ömer ağaç gölgesinde ılık çay içti. Gövde metni Plus Jakarta Sans; başlıklar Playfair Display.</p>
            <p className="ui-hand">Balonları beklerken içtiğimiz kahvenin kokusu…</p>
          </Card>
        </section>

        <section className="sg__section">
          <h2>Butonlar</h2>
          <div className="sg__row">
            <Button>Defteri aç</Button>
            <Button variant="secondary">Vazgeç</Button>
            <Button variant="gold">Cilt tasarla</Button>
            <Button variant="ghost">Daha fazla</Button>
            <Button variant="danger">Çöpe taşı</Button>
            <Button loading>Kaydediliyor</Button>
            <Button disabled>Pasif</Button>
          </div>
          <div className="sg__row">
            <Button size="sm">Küçük</Button>
            <Button size="lg">Büyük</Button>
          </div>
        </section>

        <section className="sg__section sg__grid">
          <Card tape="rose">
            <h3>Form</h3>
            <div className="sg__stack">
              <TextField label="Adın" hint="Partnerinin göreceği isim" placeholder="Örn. Defne" autoComplete="off" />
              <TextField label="E-posta" type="email" placeholder="adin@ornek.com" icon="✉" />
              <TextField label="Şifre" type="password" hint="En az 10 karakter" error="Şifre en az 10 karakter olmalı" defaultValue="kısa" />
              <Checkbox checked={agree} onChange={(e) => setAgree(e.target.checked)}>
                <a href="/gizlilik">Gizlilik politikasını</a> okudum ve kabul ediyorum.
              </Checkbox>
              <Button block disabled={!agree}>Hesabı oluştur</Button>
            </div>
          </Card>

          <div className="sg__stack">
            <Card sunk>
              <h3>Etiketler</h3>
              <div className="sg__row">
                {['Tümü', 'Bantlar', 'Mühürler', 'Çiçekler'].map((f) => (
                  <Chip key={f} active={filter === f} onClick={() => setFilter(f)}>{f}</Chip>
                ))}
                <Chip static active>♥ Romantik</Chip>
              </div>
            </Card>
            <Card>
              <h3>Depolama</h3>
              <div className="sg__stack">
                <Meter label="Anı sandığı" used={1.2 * 1024 * MB} limit={5 * 1024 * MB} format={fmt} />
                <Meter label="Ücretsiz defter" used={44 * MB} limit={50 * MB} format={fmt} />
                <Meter label="Dolu" used={50 * MB} limit={50 * MB} format={fmt} />
              </div>
            </Card>
            <Card>
              <h3>Bildirim ve pencere</h3>
              <div className="sg__row">
                <Button variant="secondary" onClick={() => toast('Albüm kaydedildi', 'success')}>Başarı</Button>
                <Button variant="secondary" onClick={() => toast('Yeni bağlantı kopyalandı')}>Bilgi</Button>
                <Button variant="secondary" onClick={() => toast('Yükleme başarısız oldu', 'error')}>Hata</Button>
                <Button variant="gold" onClick={() => setModal(true)}>Pencere aç</Button>
              </div>
            </Card>
          </div>
        </section>

        <section className="sg__section">
          <h2>Polaroid</h2>
          <div className="sg__polaroids">
            <Polaroid src={sampleDusk} alt="Gün batımında iki kişi" caption="Gülhane'de sonbahar" seed="a" />
            <Polaroid src={sampleDusk} alt="Gün batımında iki kişi" caption="İlk sıcak çikolatamız" seed="bb" tape="kraft" />
            <Polaroid src={sampleDusk} alt="Gün batımında iki kişi" caption="Kadıköy vapuru" seed="ccc" tape="none" />
          </div>
        </section>

        <section className="sg__section">
          <h2>Boş durum</h2>
          <Card>
            <EmptyState title="Rafın henüz boş" action={<Button>Yeni albüm oluştur</Button>}>
              İlk albümünüzü açın; boş sayfaları fotoğraflar ve notlarla birlikte doldurun.
            </EmptyState>
          </Card>
        </section>
      </div>

      {modal && (
        <Modal
          eyebrow="Özel mektup"
          title="Partnerini davet et"
          onClose={() => setModal(false)}
          actions={
            <>
              <Button variant="secondary" onClick={() => setModal(false)}>Vazgeç</Button>
              <Button onClick={() => { setModal(false); toast('Bağlantı kopyalandı', 'success') }}>Bağlantıyı kopyala</Button>
            </>
          }
        >
          <p className="ui-muted">Bu bağlantı 7 gün geçerli. Partnerin açınca defterinize katılır.</p>
          <TextField label="Davet bağlantısı" readOnly value="https://hatiradefterim.duckdns.org/invite/…" />
        </Modal>
      )}
    </main>
  )
}
