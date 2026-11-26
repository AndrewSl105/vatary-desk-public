// A release is authored in two languages and one of them is routinely
// left empty — the admin writes Ukrainian first and translates later.
// Every assertion here is about that half-filled state, because a blank
// slide is exactly what the fallback exists to prevent.
import { describe, expect, it } from 'vitest'
import { pickReleaseText, releaseLocale } from './releaseText'

describe('releaseLocale', () => {
  it('reads i18next region tags, not just bare codes', () => {
    expect(releaseLocale('uk')).toBe('uk')
    expect(releaseLocale('uk-UA')).toBe('uk')
    expect(releaseLocale('UK')).toBe('uk')
  })

  it('treats everything else — including nothing — as English', () => {
    expect(releaseLocale('en')).toBe('en')
    expect(releaseLocale('en-GB')).toBe('en')
    expect(releaseLocale('de')).toBe('en')
    expect(releaseLocale(undefined)).toBe('en')
  })
})

describe('pickReleaseText', () => {
  const both = { uk: 'Новинки', en: 'What is new' }

  it('prefers the viewer’s language', () => {
    expect(pickReleaseText(both, 'uk')).toBe('Новинки')
    expect(pickReleaseText(both, 'en')).toBe('What is new')
  })

  it('falls back rather than rendering an empty slide', () => {
    expect(pickReleaseText({ uk: 'Новинки', en: '' }, 'en')).toBe('Новинки')
    expect(pickReleaseText({ uk: '', en: 'What is new' }, 'uk')).toBe('What is new')
  })

  it('treats whitespace-only as untranslated', () => {
    expect(pickReleaseText({ uk: 'Новинки', en: '   ' }, 'en')).toBe('Новинки')
  })

  it('returns empty when neither locale has text', () => {
    expect(pickReleaseText({ uk: '', en: '  ' }, 'uk')).toBe('')
  })
})
