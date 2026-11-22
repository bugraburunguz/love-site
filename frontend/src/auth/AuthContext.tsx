import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import { clearCache } from '../api/cache'
import { api, ApiError } from '../api/client'

export interface User {
  id: string
  email: string
  displayName: string
  admin: boolean
  spaceId: string | null
  spaceName: string | null
  role: 'OWNER' | 'MEMBER' | null
}

interface AuthState {
  user: User | null
  loading: boolean
  login: (email: string, password: string) => Promise<void>
  logout: () => Promise<void>
  /** replaces the signed-in user, e.g. after an invitation was accepted (the backend already opened the session) */
  setUser: (user: User | null) => void
  /** the session ended on the server (e.g. the account was deleted): forget the user and leave a note for the login page */
  endSession: (notice: string) => void
  /** that note, shown once on the login page */
  notice: string | null
}

const AuthContext = createContext<AuthState | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const [notice, setNotice] = useState<string | null>(null)

  // The /me call also makes the backend set the XSRF-TOKEN cookie needed by the login POST.
  useEffect(() => {
    api<User>('/api/auth/me')
      .then(setUser)
      .catch((e) => {
        if (!(e instanceof ApiError && e.status === 401)) console.error(e)
        setUser(null)
      })
      .finally(() => setLoading(false))
  }, [])

  const changeUser = useCallback((next: User | null) => {
    clearCache()
    setUser(next)
  }, [])

  const login = useCallback(async (email: string, password: string) => {
    changeUser(await api<User>('/api/auth/login', { method: 'POST', body: { email, password } }))
    setNotice(null)
  }, [changeUser])

  const endSession = useCallback((text: string) => {
    setNotice(text)
    changeUser(null)
  }, [changeUser])

  const logout = useCallback(async () => {
    await api<void>('/api/auth/logout', { method: 'POST' })
    changeUser(null)
  }, [changeUser])

  return <AuthContext.Provider value={{ user, loading, login, logout, setUser: changeUser, endSession, notice }}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider')
  return ctx
}
