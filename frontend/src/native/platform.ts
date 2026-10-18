import { Capacitor } from '@capacitor/core'

/**
 * Website or store app. The app (Capacitor) ships this same SPA inside it and calls the API of the live site across
 * origins; the website is same-origin, so its API base is empty.
 */
export const isNativeApp: boolean = Capacitor.isNativePlatform()

/** Where the API lives: empty on the website; the site's address in the app (VITE_API_BASE of the mobile build). */
export const API_BASE: string = isNativeApp ? String(import.meta.env.VITE_API_BASE ?? '').replace(/\/+$/, '') : ''

/** Headers the app adds to every API call (the backend reads the session from X-Auth-Token for these, never a cookie). */
export const APP_CLIENT = 'love-site-app'
