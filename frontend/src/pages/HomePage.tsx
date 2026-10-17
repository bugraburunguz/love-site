import { useAuth } from '../auth/AuthContext'

export default function HomePage() {
  const { user, logout } = useAuth()
  return (
    <main style={{ maxWidth: 480, margin: '20vh auto', display: 'grid', gap: 12 }}>
      <h1>Merhaba {user?.displayName}</h1>
      <p>Albümler yakında.</p>
      <button onClick={() => void logout()}>Çıkış</button>
    </main>
  )
}
