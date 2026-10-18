import { App } from '@capacitor/app'
import { SplashScreen } from '@capacitor/splash-screen'
import { StatusBar, Style } from '@capacitor/status-bar'
import { isNativeApp } from './platform'
import { loadSessionToken } from './session'

/** App start: token first (the first API call needs it), then the system bars and the Android back button. */
export async function bootNative(): Promise<void> {
  if (!isNativeApp) return
  document.documentElement.classList.add('native-app')
  await loadSessionToken()
  try {
    await StatusBar.setStyle({ style: Style.Light }) // dark text on the cream paper
    await StatusBar.setOverlaysWebView({ overlay: true }) // the pages use env(safe-area-inset-*)
  } catch {
    /* not available on this platform */
  }
  void App.addListener('backButton', ({ canGoBack }) => {
    if (canGoBack) window.history.back()
    else void App.exitApp()
  })
}

export function nativeReady() {
  if (isNativeApp) void SplashScreen.hide({ fadeOutDuration: 250 })
}
