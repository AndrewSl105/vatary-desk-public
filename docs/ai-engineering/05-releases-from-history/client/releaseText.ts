/**
 * Locale pick for release copy. A release carries both translations, so the
 * choice happens at render time, and an empty translation falls back to the
 * other language: an admin who filled in only one must not leave the other
 * readers looking at a blank slide.
 */
export type ReleaseLocale = 'uk' | 'en'

const UKRAINIAN_PREFIX = 'uk'

/** Narrows a language tag such as `uk`, `uk-UA` or `en-GB`; anything not Ukrainian is English. */
export function releaseLocale(language: string | undefined): ReleaseLocale {
  return (language ?? '').toLowerCase().startsWith(UKRAINIAN_PREFIX) ? 'uk' : 'en'
}

/** The reader's language if it has text, otherwise the other one. */
export function pickReleaseText(text: { uk: string; en: string }, locale: ReleaseLocale): string {
  const [preferred, other] = locale === 'uk' ? [text.uk, text.en] : [text.en, text.uk]

  if (preferred.trim()) {
    return preferred
  }
  return other.trim() ? other : ''
}
