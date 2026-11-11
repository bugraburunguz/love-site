import { lazy, Suspense } from 'react'
import { Navigate, Outlet, Route, Routes, useLocation } from 'react-router-dom'
import { landingFor } from './auth/accountForm'
import { useAuth } from './auth/AuthContext'
import { useNativeNavTransitions } from './native/navTransition'
import { isNativeApp } from './native/platform'
import ErrorBoundary from './components/ErrorBoundary'
import ErrorScreen from './components/ErrorScreen'
import InvitePage from './pages/InvitePage'
import LoginPage from './pages/LoginPage'
import SignupPage from './pages/SignupPage'
import { AccountDeletionPage, PrivacyPage } from './pages/LegalPages'

const AdminPage = lazy(() => import('./pages/AdminPage'))
const AlbumsPage = lazy(() => import('./pages/AlbumsPage'))
const AlbumPage = lazy(() => import('./pages/AlbumPage'))
const CalendarPage = lazy(() => import('./pages/CalendarPage'))
const CalendarDayPage = lazy(() => import('./pages/CalendarDayPage'))
const ProfilePage = lazy(() => import('./pages/ProfilePage'))
const TrashPage = lazy(() => import('./pages/TrashPage'))
const StyleGuidePage = lazy(() => import('./pages/StyleGuidePage'))
const LandingPage = lazy(() => import('./pages/LandingPage'))

/** Everything behind the login; a signed-out visitor of "/" on the website gets the page that explains the app. */
function AppShell() {
  const { user, loading, notice } = useAuth()
  const { pathname } = useLocation()
  if (loading) return <p className="boot">Defter açılıyor…</p>
  const view = landingFor({ signedIn: !!user, native: isNativeApp, path: pathname, notice })
  if (view === 'landing') {
    return (
      <Suspense fallback={<p className="boot">Defter açılıyor…</p>}>
        <LandingPage />
      </Suspense>
    )
  }
  if (view === 'login') return <Navigate to="/login" replace />
  return (
    <Suspense fallback={<p className="boot">Defter açılıyor…</p>}>
      <Outlet />
    </Suspense>
  )
}

export default function App() {
  useNativeNavTransitions()
  return (
    <ErrorBoundary>
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/invite/:token" element={<InvitePage />} />
      <Route path="/kayit" element={<SignupPage />} />
      {/* public: the store listings link here */}
      <Route path="/gizlilik" element={<PrivacyPage />} />
      <Route path="/hesap-silme" element={<AccountDeletionPage />} />
      {/* design system reference: development, or the admin in production (the page checks) */}
      <Route path="/tasarim" element={<Suspense fallback={null}><StyleGuidePage /></Suspense>} />
      <Route element={<AppShell />}>
        <Route path="/" element={<AlbumsPage />} />
        <Route path="/albums/:id" element={<AlbumPage />} />
        <Route path="/takvim" element={<CalendarPage />} />
        <Route path="/takvim/gun/:date" element={<CalendarDayPage />} />
        <Route path="/profil" element={<ProfilePage />} />
        <Route path="/cop" element={<TrashPage />} />
        <Route path="/admin" element={<AdminPage />} />
      </Route>
      <Route path="*" element={<ErrorScreen kind="notfound" />} />
    </Routes>
    </ErrorBoundary>
  )
}
