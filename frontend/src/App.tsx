import type { ReactElement } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { useAuth } from './auth/AuthContext'
import AlbumPage from './pages/AlbumPage'
import AlbumsPage from './pages/AlbumsPage'
import LoginPage from './pages/LoginPage'

function RequireAuth({ children }: { children: ReactElement }) {
  const { user, loading } = useAuth()
  if (loading) return <p>Yükleniyor…</p>
  return user ? children : <Navigate to="/login" replace />
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        path="/"
        element={
          <RequireAuth>
            <AlbumsPage />
          </RequireAuth>
        }
      />
      <Route
        path="/albums/:id"
        element={
          <RequireAuth>
            <AlbumPage />
          </RequireAuth>
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
