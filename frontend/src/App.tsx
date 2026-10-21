import { lazy, Suspense } from 'react'
import { Navigate, Outlet, Route, Routes } from 'react-router-dom'
import { useAuth } from './auth/AuthContext'
import ErrorBoundary from './components/ErrorBoundary'
import ErrorScreen from './components/ErrorScreen'
import InvitePage from './pages/InvitePage'
import LoginPage from './pages/LoginPage'
import { AccountDeletionPage, PrivacyPage } from './pages/LegalPages'

const AdminPage = lazy(() => import('./pages/AdminPage'))
const AlbumsPage = lazy(() => import('./pages/AlbumsPage'))
const AlbumPage = lazy(() => import('./pages/AlbumPage'))
const CalendarPage = lazy(() => import('./pages/CalendarPage'))
const CalendarDayPage = lazy(() => import('./pages/CalendarDayPage'))

/** Everything behind the login. */
function AppShell() {
  const { user, loading } = useAuth()
  if (loading) return <p className="boot">Defter açılıyor…</p>
  if (!user) return <Navigate to="/login" replace />
  return (
    <Suspense fallback={<p className="boot">Defter açılıyor…</p>}>
      <Outlet />
    </Suspense>
  )
}

export default function App() {
  return (
    <ErrorBoundary>
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/invite/:token" element={<InvitePage />} />
      {/* public: the store listings link here */}
      <Route path="/gizlilik" element={<PrivacyPage />} />
      <Route path="/hesap-silme" element={<AccountDeletionPage />} />
      <Route element={<AppShell />}>
        <Route path="/" element={<AlbumsPage />} />
        <Route path="/albums/:id" element={<AlbumPage />} />
        <Route path="/takvim" element={<CalendarPage />} />
        <Route path="/takvim/gun/:date" element={<CalendarDayPage />} />
        <Route path="/admin" element={<AdminPage />} />
      </Route>
      <Route path="*" element={<ErrorScreen kind="notfound" />} />
    </Routes>
    </ErrorBoundary>
  )
}
