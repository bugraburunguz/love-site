import { useEffect, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { getLegal } from '../legal/legal'
import { pageVars, themeVars } from '../themes/cssVars'
import { useTheme, useThemeFonts } from '../themes/ThemeContext'
import './legal.css'

/** The contact address from the server (PRIVACY_CONTACT_EMAIL); the pages still read fine without it. */
function useContact(): string {
  const [email, setEmail] = useState('')
  useEffect(() => {
    getLegal()
      .then((l) => setEmail(l.contactEmail))
      .catch(() => undefined)
  }, [])
  return email
}

function Contact({ email }: { email: string }) {
  return email ? <a href={`mailto:${email}`}>{email}</a> : <>uygulama yöneticisi</>
}

/**
 * Public pages the store listings link to (no session needed), on the paper of the default theme like the error screen.
 * Kept as plain text: they must be readable for a reviewer in any browser and in the app.
 */
function LegalShell({ title, updated, children }: { title: string; updated: string; children: ReactNode }) {
  const theme = useTheme()
  useThemeFonts(theme)
  const { user } = useAuth()
  return (
    <main className="legal" style={{ ...themeVars(theme), ...pageVars(theme, 'soft', 'plain') }}>
      <article className="legal__card">
        <p className="legal__brand">Anılarımız</p>
        <h1>{title}</h1>
        <p className="legal__updated">Son güncelleme: {updated}</p>
        {children}
        <nav className="legal__nav">
          <Link to={user ? '/' : '/login'} className="clay clay--pill clay--cream">
            {user ? 'Albümlere dön' : 'Giriş sayfası'}
          </Link>
        </nav>
      </article>
    </main>
  )
}

const UPDATED = '21 Ekim 2026'

export function PrivacyPage() {
  const contact = useContact()
  return (
    <LegalShell title="Gizlilik Politikası" updated={UPDATED}>
      <p>
        Anılarımız, çiftlerin yalnızca davetle girilen özel bir fotoğraf albümüdür. Herkese açık bir profil, arama ya da
        paylaşım akışı yoktur: bir alandaki içeriği yalnızca o alanın üyeleri görür.
      </p>

      <h2>Hangi verileri topluyoruz?</h2>
      <ul>
        <li><strong>Hesap bilgileri:</strong> e-posta adresin, görünen adın ve şifren (şifre yalnızca geri döndürülemez biçimde, bcrypt özeti olarak saklanır).</li>
        <li><strong>Yüklediğin içerik:</strong> fotoğraflar, videolar, albüm müzikleri, fotoğraflara yazdığın açıklamalar, albüm adları, takvim notları ve özel günler.</li>
        <li><strong>Dosyaların teknik bilgileri:</strong> dosya adı, boyutu, türü ve fotoğrafın çekim tarihi (takvimde doğru güne yerleştirmek için). Fotoğraflardaki konum (GPS) bilgisi kullanılmaz; gösterim için hazırlanan kopyalardan tüm meta veriler silinir, orijinal dosya yüklediğin haliyle saklanır.</li>
        <li><strong>Oturum:</strong> giriş yaptığında oturumunu tanımak için bir oturum çerezi (web) ya da uygulamada saklanan bir oturum anahtarı.</li>
        <li><strong>Güvenlik kayıtları:</strong> kötüye kullanımı önlemek için bellekte tutulan kısa süreli hatalı giriş sayaçları. Sunucu kayıtlarına şifre, oturum anahtarı ya da davet bağlantısı yazılmaz.</li>
      </ul>

      <h2>Verileri ne için kullanıyoruz?</h2>
      <p>
        Yalnızca sana ve partnerine özel albümü göstermek, fotoğrafları ve videoları farklı boyutlarda hazırlamak, takvimi
        oluşturmak ve istediğin paylaşım dosyalarını (polaroid, Instagram ve WhatsApp biçimleri) üretmek için.
      </p>

      <h2>Reklam, takip ve üçüncü taraflar</h2>
      <ul>
        <li>Reklam yoktur; reklam ya da analiz amaçlı takip araçları, çerezler veya SDK'lar kullanılmaz.</li>
        <li>Verilerin satılmaz, kiralanmaz ve hiçbir üçüncü tarafla paylaşılmaz.</li>
        <li>Uygulama, yalnızca hizmeti çalıştırmak için gereken altyapı sağlayıcılarını (sunucu barındırma, veritabanı ve dosya depolama) kullanır; bu sağlayıcılar verileri yalnızca bizim adımıza saklar.</li>
      </ul>

      <h2>Nerede ve ne kadar süre saklanıyor?</h2>
      <ul>
        <li>Fotoğraf, video ve müzik dosyaları özel bir depolama alanında (bucket), hesap ve albüm bilgileri bir PostgreSQL veritabanında tutulur. Dosyalara yalnızca kısa süreli, imzalı bağlantılarla erişilir.</li>
        <li>Her gece orijinal dosyaların ve veritabanının bir yedeği ayrı bir depolama alanına alınır. Veritabanı yedekleri 14 gün saklanır.</li>
        <li>Sildiğin fotoğraf, video ve albümler 30 gün çöpte bekler, sonra kalıcı olarak silinir; yedekteki kopyaları da bundan 30 gün sonra silinir.</li>
        <li>Paylaşım için hazırlanan dosyalar 24 saat sonra kendiliğinden silinir.</li>
        <li>Hesabın, sen silene kadar saklanır.</li>
      </ul>

      <h2 id="hesap-silme">Hesabını silme</h2>
      <p>
        Hesabını istediğin an uygulamanın ya da sitenin içinden silebilirsin: rafta adının yanındaki <strong>⋯</strong>{' '}
        menüsünden <strong>Hesabımı sil</strong>'i seç ve şifrenle onayla. Ayrıntılar için{' '}
        <Link to="/hesap-silme">hesap silme sayfasına</Link> bak.
      </p>
      <ul>
        <li>Alanın tek üyesiysen alan; albümleri, fotoğrafları, videoları, müzikleri, takvim notları ve paylaşım dosyalarıyla birlikte hemen silinir.</li>
        <li>Alanda partnerin varsa yalnızca senin hesabın ve günlük notların silinir; ortak albümler partnerinde kalır.</li>
        <li>Tüm oturumların kapanır. Yedekteki dosya kopyaları en geç 30 gün, veritabanı yedekleri en geç 14 gün içinde silinir.</li>
        <li>Silinen hesabın yeniden kendiliğinden oluşturulmaması için yalnızca e-posta adresinin geri döndürülemez bir özeti (SHA-256) saklanır.</li>
      </ul>

      <h2>Hakların</h2>
      <p>
        Verilerine erişme, düzeltme ve silme hakkına sahipsin (KVKK ve GDPR). Albümlerindeki fotoğraf ve videoları
        uygulamadan görebilir ve indirebilirsin. Sorular ve talepler için: <Contact email={contact} />.
      </p>

      <h2>Değişiklikler</h2>
      <p>Bu politika değişirse güncel hali bu sayfada yayımlanır; tarih en üstte yazar.</p>
    </LegalShell>
  )
}

export function AccountDeletionPage() {
  const contact = useContact()
  return (
    <LegalShell title="Hesap Silme" updated={UPDATED}>
      <p>Anılarımız hesabını ve verilerini, uygulamadan ya da siteden dilediğin an kendin silebilirsin.</p>

      <h2>Nasıl silinir?</h2>
      <ol>
        <li>Uygulamada ya da sitede oturum aç.</li>
        <li>Albüm rafında adının yanındaki <strong>⋯</strong> düğmesine dokun.</li>
        <li><strong>Hesabımı sil</strong>'i seç, ne olacağını oku ve şifrenle onayla.</li>
      </ol>

      <h2>Neler silinir?</h2>
      <ul>
        <li><strong>Alanın tek üyesiysen:</strong> hesabın, alanın ve tüm albümler, fotoğraflar, videolar, müzikler, açıklamalar, takvim notları, özel günler ve paylaşım dosyaları hemen silinir.</li>
        <li><strong>Alanda partnerin varsa:</strong> hesabın (e-posta, ad, şifre) ve takvime yazdığın günlük notlar silinir. Ortak albümler ve yüklediğin fotoğraflar partnerinde kalır; alanın sahibi partnerin olur.</li>
        <li>Tüm cihazlardaki oturumların kapanır.</li>
      </ul>

      <h2>Ne kadar sürede?</h2>
      <p>
        Silme hemen gerçekleşir. Gece alınan yedeklerdeki dosya kopyaları en geç 30 gün, veritabanı yedekleri en geç 14
        gün içinde kendiliğinden silinir. Silinen hesabın yeniden oluşturulmaması için yalnızca e-posta adresinin geri
        döndürülemez özeti saklanır.
      </p>

      <h2>Giriş yapamıyorsan</h2>
      <p>
        Şifreni hatırlamıyorsan ya da uygulamaya erişemiyorsan, kayıtlı e-posta adresinden <Contact email={contact} />{' '}
        adresine yaz; hesabın doğrulandıktan sonra silinir.
      </p>

      <p>
        Hangi verilerin tutulduğunu <Link to="/gizlilik">gizlilik politikasında</Link> bulabilirsin.
      </p>
    </LegalShell>
  )
}
