/** Client-side checks of the signup and invitation forms (the server checks the same and has the last word). */
export function validateNewAccount(form: { password: string; repeat: string; privacy: boolean }): string | null {
  if (form.password.length < 10) return 'Şifre en az 10 karakter olmalı'
  if (form.password !== form.repeat) return 'Şifreler aynı değil'
  if (!form.privacy) return 'Gizlilik politikasını onaylaman gerekiyor'
  return null
}

/**
 * What a route behind the login shows: the app, the sign-in form, or (only for "/" on the web) the visitor page that
 * explains the app. The store app opens straight on the sign-in form.
 */
export function landingFor(state: { signedIn: boolean; native: boolean; path: string; notice?: string | null }): 'app' | 'landing' | 'login' {
  if (state.signedIn) return 'app'
  // a session that just ended (e.g. the account was deleted on another device) leaves a note only the sign-in form shows
  if (state.notice) return 'login'
  return !state.native && state.path === '/' ? 'landing' : 'login'
}
