import type { CapacitorConfig } from '@capacitor/cli'

/**
 * Store apps (iOS + Android). They carry the SPA built with `npm run build:mobile` (dist-mobile/, API calls go to
 * VITE_API_BASE from .env.mobile) and talk to the live site's API with a session token (see src/native/).
 */
const config: CapacitorConfig = {
  appId: 'com.hatiradefterim.app',
  appName: 'Anılarımız',
  webDir: 'dist-mobile',
  server: {
    // Android serves the app from https://localhost (an allowed CORS origin of the backend); iOS uses capacitor://localhost
    androidScheme: 'https',
  },
  ios: {
    contentInset: 'never',
  },
  plugins: {
    SplashScreen: {
      launchAutoHide: false,
      backgroundColor: '#E4D0A9',
      showSpinner: false,
    },
  },
}

export default config
