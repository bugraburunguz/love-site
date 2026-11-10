import { describe, expect, it } from 'vitest'
import { deletionConsequences, headingId } from './legal'

describe('headingId', () => {
  it('turns a Turkish heading into a plain anchor', () => {
    expect(headingId('Hangi verileri topluyoruz?')).toBe('hangi-verileri-topluyoruz')
    expect(headingId('Nerede ve ne kadar süre saklanıyor?')).toBe('nerede-ve-ne-kadar-sure-saklaniyor')
    expect(headingId('İletişim & Şikâyet')).toBe('iletisim-sikayet')
  })
})

describe('deletionConsequences', () => {
  it('warns the last member that the whole space goes', () => {
    const text = deletionConsequences(1, true).join(' ')
    expect(text).toContain('tek üyesisin')
    expect(text).toContain('kalıcı olarak silinir')
    expect(text).toContain('30 gün')
    expect(text).toContain('geri alınamaz')
  })

  it('tells a member with a partner that the content stays', () => {
    const text = deletionConsequences(2, false).join(' ')
    expect(text).toContain('partnerinde kalır')
    expect(text).not.toContain('sahibi partnerin olur')
    expect(text).not.toContain('tek üyesisin')
  })

  it('mentions the ownership handover only for the owner', () => {
    expect(deletionConsequences(2, true).join(' ')).toContain('sahibi partnerin olur')
  })
})
