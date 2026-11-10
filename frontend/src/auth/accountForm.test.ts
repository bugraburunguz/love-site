import { describe, expect, it } from 'vitest'
import { landingFor, validateNewAccount } from './accountForm'

describe('validateNewAccount', () => {
  const ok = { password: 'uzun-bir-sifre', repeat: 'uzun-bir-sifre', privacy: true }

  it('accepts a complete form', () => {
    expect(validateNewAccount(ok)).toBeNull()
  })

  it('names the first problem, in the order the form shows the fields', () => {
    expect(validateNewAccount({ ...ok, password: 'kisa', repeat: 'kisa' })).toBe('Şifre en az 10 karakter olmalı')
    expect(validateNewAccount({ ...ok, repeat: 'baska-bir-sifre' })).toBe('Şifreler aynı değil')
    expect(validateNewAccount({ ...ok, privacy: false })).toBe('Gizlilik politikasını onaylaman gerekiyor')
  })
})

describe('landingFor', () => {
  it('shows the visitor page only on the web home of a signed-out visitor', () => {
    expect(landingFor({ signedIn: false, native: false, path: '/' })).toBe('landing')
    expect(landingFor({ signedIn: false, native: false, path: '/takvim' })).toBe('login')
    // the store app has no visitor page: it opens on the sign-in form
    expect(landingFor({ signedIn: false, native: true, path: '/' })).toBe('login')
    expect(landingFor({ signedIn: true, native: false, path: '/' })).toBe('app')
  })
})
