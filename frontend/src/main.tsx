import { lazy, StrictMode, Suspense } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import { AuthProvider } from './auth/AuthContext'
import './styles/fonts'
import './styles/tokens.css'
import './styles/base.css'

// The export render route (only reachable on the worker's loopback port) needs neither the router nor a session.
const RenderPage = lazy(() => import('./render/RenderPage'))

createRoot(document.getElementById('root')!).render(
  window.location.pathname.startsWith('/render/') ? (
    <Suspense fallback={null}>
      <RenderPage />
    </Suspense>
  ) : (
    <StrictMode>
      <BrowserRouter>
        <AuthProvider>
          <App />
        </AuthProvider>
      </BrowserRouter>
    </StrictMode>
  ),
)
