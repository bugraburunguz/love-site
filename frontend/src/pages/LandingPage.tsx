import { type CSSProperties } from 'react'
import { Link } from 'react-router-dom'
import sampleCafe from '../assets/sample-cafe.svg'
import sampleDusk from '../assets/sample-dusk.svg'
import { Brand } from '../components/AuthLayout'
import { Card, Polaroid, uiButtonClass } from '../components/ui'
import { THEME_LIST } from '../themes/registry'
import './auth.css'

const PRINCIPLES = [
  {
    icon: '✿',
    title: 'Algoritma yok, beğeni yok',
    text: 'Takipçi sayısı, keşfet sayfası ya da beğeni yok. Kimseye bir şey göstermek için değil, geçen günleri unutmamak için yazarsınız.',
  },
  {
    icon: '♥',
    title: 'Yalnızca ikiniz görürsünüz',
    text: 'Fotoğraflarınız herkese kapalı bir depoda durur ve yalnızca ikinize kısa süreli bağlantılarla açılır. Reklam yok, takip yok, hiçbir şey satılmaz.',
  },
  {
    icon: '❦',
    title: 'Gerçek defter dokunuşu',
    text: 'Listelerde gezinmek yerine sayfa çevirin: polaroid çerçeveler, washi bantlar, el yazısı notlar ve albümünüzün şarkısı.',
  },
]

const STEPS = [
  {
    title: 'Defterini aç',
    text: 'Bir dakikada hesabını oluştur. Ücretsiz defterle başlarsın; e-posta adresin ve bir şifre yeter.',
  },
  {
    title: 'Partnerini davet et',
    text: 'Defterine özel bir davet bağlantısı oluştur ve partnerine gönder. Bir defterde en fazla iki kişi olur.',
  },
  {
    title: 'Anılarını iliştir',
    text: 'Fotoğrafları ve kısa videoları yükle; sayfalar kendiliğinden dizilir, takvim çekildikleri günü hatırlar.',
  },
]

/** The page a signed-out visitor sees at "/" on the website (the store app opens on the sign-in form instead). */
export default function LandingPage() {
  return (
    <div className="ui landing">
      <nav className="landing__nav" aria-label="Ana menü">
        <div className="ui-container landing__nav-inner">
          <Brand />
          <div className="landing__links">
            <a href="#nasil">Nasıl çalışır?</a>
            <a href="#ilkeler">Mahremiyet</a>
            <a href="#temalar">Temalar</a>
          </div>
          <div className="landing__actions">
            <Link to="/login" className={uiButtonClass('ghost', 'sm')}>Giriş yap</Link>
            <Link to="/kayit" className={`${uiButtonClass('primary', 'sm')} landing__signup`}>Defterini aç</Link>
          </div>
        </div>
      </nav>

      <header className="ui-container landing__hero">
        <div className="ui-eyebrow">Yalnızca iki kişilik bir anı defteri</div>
        <h1>
          İkinizin hikâyesi, sayfaların arasında <em>saklı kalsın.</em>
        </h1>
        <p>
          Sosyal medyanın gürültüsünden ve yabancı gözlerden uzak; kapağı mühürlü bir mektup gibi yalnızca sizin olan dijital
          bir anı defteri.
        </p>
        <div className="landing__ctas">
          <Link to="/kayit" className={uiButtonClass('primary', 'lg')}>Ücretsiz defterini aç</Link>
          <a href="#nasil" className={uiButtonClass('secondary', 'lg')}>Nasıl çalışır?</a>
        </div>
        <div className="landing__trust">Reklamsız · Takipsiz · Yalnızca ikiniz</div>

        <div className="landing__book" aria-hidden="true">
          <div className="landing__spread">
            <div className="landing__page">
              <div className="landing__page-meta">
                <span>27 Ekim · İlk yıl dönümü</span>
                <span>♥</span>
              </div>
              <h3>Vapurun güvertesinde…</h3>
              <p>Martılara attığımız son simit parçası ve cebinde unuttuğumuz bilet koçanı. Hepsi burada.</p>
              <Polaroid src={sampleDusk} alt="" caption="Kuzguncuk, 14:20" seed="landing-1" width={200} />
            </div>
            <div className="landing__page">
              <div className="landing__page-meta">
                <span>Sayfa 14</span>
                <span>Kadıköy</span>
              </div>
              <div className="landing__page-row">
                <Polaroid src={sampleCafe} alt="" caption="Pazar kahvaltımız" seed="landing-2" tape="kraft" width={180} />
                <Polaroid src={sampleDusk} alt="" caption="Gün batımı" seed="landing-3" tape="none" width={150} />
              </div>
              <p>“Ellerin sıcacıktı.”</p>
            </div>
          </div>
        </div>
      </header>

      <section id="ilkeler" className="landing__section landing__section--tint">
        <div className="ui-container landing__inner">
          <div className="landing__section-head">
            <div className="ui-eyebrow">Neden başka bir yer gibi değil?</div>
            <h2>Hatıralar vitrin için değil, saklamak içindir.</h2>
          </div>
          <div className="landing__grid">
            {PRINCIPLES.map((p) => (
              <Card key={p.title} as="article" className="landing__principle">
                <span className="landing__icon" aria-hidden="true">{p.icon}</span>
                <h3>{p.title}</h3>
                <p>{p.text}</p>
              </Card>
            ))}
          </div>
        </div>
      </section>

      <section id="nasil" className="landing__section">
        <div className="ui-container landing__inner">
        <div className="landing__section-head">
          <div className="ui-eyebrow">Kolay ve samimi</div>
          <h2>Birlikte bir defter doldurmak bu kadar yalın.</h2>
          <p>Karmaşık ayarlar ya da uzun profil formları yok.</p>
        </div>
        <div className="landing__grid">
          {STEPS.map((s, i) => (
            <Card key={s.title} as="article" className="landing__principle" tape={i === 1 ? 'rose' : 'none'}>
              <span className="landing__step-no">{i + 1}</span>
              <h3>{s.title}</h3>
              <p>{s.text}</p>
            </Card>
          ))}
        </div>
        </div>
      </section>

      <section id="temalar" className="landing__section landing__section--tint">
        <div className="ui-container landing__inner">
          <div className="landing__section-head">
            <div className="ui-eyebrow">Kişisel estetik</div>
            <h2>Hikâyenize en çok yakışan kâğıdı seçin</h2>
            <p>Her albümün, hatta her sayfanın kendi teması olabilir: yazı tipleri, kâğıt dokusu, çıkartmalar ve küçük animasyonlar.</p>
          </div>
          <div className="landing__themes">
            {THEME_LIST.map((t) => (
              <div key={t.id} className="landing__theme">
                <div className="landing__cover" style={{ '--cover': t.cover.color, '--stitch': t.cover.stitch } as CSSProperties} aria-hidden="true" />
                <span>{t.name}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="landing__section">
        <div className="ui-container landing__inner">
        <Card className="landing__final" tape="kraft">
          <span className="auth__seal" aria-hidden="true">♥</span>
          <h2>
            Birbirinize en güzel armağan: <em>birlikte yazılan bir defter.</em>
          </h2>
          <p>Bugün ilk sayfayı açın; yıllar sonra çevirdiğinizde her biri ayrı bir gülümseme olsun.</p>
          <div className="landing__ctas">
            <Link to="/kayit" className={uiButtonClass('primary', 'lg')}>Defterini aç</Link>
            <Link to="/login" className={uiButtonClass('secondary', 'lg')}>Giriş yap</Link>
          </div>
        </Card>
        </div>
      </section>

      <footer className="landing__footer">
        <div className="ui-container landing__footer-inner">
          <span>© {new Date().getFullYear()} Hatıra Defterim · Yalnızca ikiniz için</span>
          <nav aria-label="Alt menü">
            <Link to="/gizlilik">Gizlilik</Link>
            <Link to="/hesap-silme">Hesap silme</Link>
          </nav>
        </div>
      </footer>
    </div>
  )
}
