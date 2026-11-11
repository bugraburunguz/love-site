import { lazy, StrictMode, Suspense } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import { AuthProvider } from './auth/AuthContext'
import { isNativeApp } from './native/platform'
import { ToastProvider } from './components/ui'
import { applyColorMode, readColorMode } from './styles/colorMode'
import './styles/fonts'
import './styles/tokens.css'
import './styles/ui-tokens.css'
import './styles/base.css'
import './styles/native.css'

// before the first paint, so a forced light/dark choice never flashes the other one
applyColorMode(readColorMode())

// The export render route (only reachable on the worker's loopback port) needs neither the router nor a session.
const RenderPage = lazy(() => import('./render/RenderPage'))

function render() {
  createRoot(document.getElementById('root')!).render(
    window.location.pathname.startsWith('/render/') ? (
      <Suspense fallback={null}>
        <RenderPage />
      </Suspense>
    ) : (
      <StrictMode>
        <BrowserRouter>
          <AuthProvider>
            <ToastProvider>
              <App />
            </ToastProvider>
          </AuthProvider>
        </BrowserRouter>
      </StrictMode>
    ),
  )
}

// The store app first restores its session token and sets up the system bars; the website starts right away.
if (isNativeApp) {
  void import('./native/boot').then(async ({ bootNative, nativeReady }) => {
    await bootNative().catch(() => undefined)
    render()
    nativeReady()
  })
} else {
  render()
}
