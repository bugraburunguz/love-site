import { App } from '@capacitor/app'
import { SplashScreen } from '@capacitor/splash-screen'
import { StatusBar } from '@capacitor/status-bar'
import { isNativeApp } from './platform'
import { syncStatusBar, watchSystemAppearance } from './statusBar'
import { loadSessionToken } from './session'

/** App start: token first (the first API call needs it), then the system bars and the Android back button. */
export async function bootNative(): Promise<void> {
  if (!isNativeApp) return
  document.documentElement.classList.add('native-app')
  await loadSessionToken()
  try {
    await StatusBar.setOverlaysWebView({ overlay: true }) // the pages use env(safe-area-inset-*)
  } catch {
    /* not available on this platform (iOS always overlays) */
  }
  // dark text on the cream paper, light text in night reading; follows the phone and the profile's choice
  await syncStatusBar()
  watchSystemAppearance()
  void App.addListener('backButton', ({ canGoBack }) => {
    if (canGoBack) window.history.back()
    else void App.exitApp()
  })
}

export function nativeReady() {
  if (isNativeApp) void SplashScreen.hide({ fadeOutDuration: 250 })
}
