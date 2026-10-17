import { lazy, Suspense } from 'react'
import { Navigate, Outlet, Route, Routes } from 'react-router-dom'
import { useAuth } from './auth/AuthContext'
import { MusicProvider } from './components/MusicBox'
import InvitePage from './pages/InvitePage'
import LoginPage from './pages/LoginPage'

const AdminPage = lazy(() => import('./pages/AdminPage'))
const AlbumsPage = lazy(() => import('./pages/AlbumsPage'))
const AlbumPage = lazy(() => import('./pages/AlbumPage'))

/** Everything behind the login. The music provider lives here so the song keeps playing across pages. */
function AppShell() {
  const { user, loading } = useAuth()
  if (loading) return <p className="boot">Defter açılıyor…</p>
  if (!user) return <Navigate to="/login" replace />
  return (
    <MusicProvider>
      <Suspense fallback={<p className="boot">Defter açılıyor…</p>}>
        <Outlet />
      </Suspense>
    </MusicProvider>
  )
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/invite/:token" element={<InvitePage />} />
      <Route element={<AppShell />}>
        <Route path="/" element={<AlbumsPage />} />
        <Route path="/albums/:id" element={<AlbumPage />} />
        <Route path="/admin" element={<AdminPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
