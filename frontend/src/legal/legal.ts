import { api } from '../api/client'

export interface LegalInfo {
  /** where privacy questions and deletion requests go; empty when the server has none configured */
  contactEmail: string
}

export const getLegal = () => api<LegalInfo>('/api/legal')

export const deleteAccount = (password: string) => api<void>('/api/account/delete', { method: 'POST', body: { password } })

/**
 * What "delete my account" will do, in the words the dialog shows. The rule lives in the backend (AccountService); this
 * only has to describe it honestly: the last member takes the whole space with them, a member with a partner only leaves.
 */
export function deletionConsequences(memberCount: number, isOwner: boolean): string[] {
  if (memberCount <= 1) {
    return [
      'Bu alanın tek üyesisin: tüm albümler, fotoğraflar, videolar, müzikler, takvim notları ve özel günler kalıcı olarak silinir.',
      'Hazırlanmış paylaşım dosyaları da silinir. Yedekteki kopyalar en geç 30 gün içinde kendiliğinden silinir.',
      'Bu işlem geri alınamaz.',
    ]
  }
  return [
    'Alanda partnerin olduğu için albümler ve içindekiler silinmez; partnerinde kalır' +
      (isOwner ? ' ve alanın sahibi partnerin olur.' : '.'),
    'Senin hesabın (e-posta, ad, şifre) ve takvime yazdığın günlük notların silinir; yüklediğin fotoğraflar partnerine geçer.',
    'Bu işlem geri alınamaz.',
  ]
}
