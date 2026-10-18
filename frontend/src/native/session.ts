import { Preferences } from '@capacitor/preferences'
import { isNativeApp } from './platform'

/**
 * The app's session token (the server-side session id, sent in X-Auth-Token). Kept in the app's own storage
 * (Preferences: UserDefaults / SharedPreferences), loaded once before the first API call.
 */
const KEY = 'session-token'
let token: string | null = null

export async function loadSessionToken(): Promise<void> {
  if (!isNativeApp) return
  token = (await Preferences.get({ key: KEY })).value
}

export function sessionToken(): string | null {
  return token
}

/** The server sends a new id after sign-in (session fixation protection) and an empty one when the session ends. */
export function rememberSessionToken(value: string | null) {
  if (!isNativeApp || value === token) return
  token = value || null
  void (token ? Preferences.set({ key: KEY, value: token }) : Preferences.remove({ key: KEY }))
}
