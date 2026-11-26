/**
 * The release announcement email: pure functions, so the template is
 * unit-testable and the service only wires data in.
 *
 * - One language per recipient, from their stored UI language; English when
 *   none is stored. A slide whose translation is empty falls back to the
 *   other language: the wrong language beats no text.
 * - Plain HTML with inline styles and table layout: what mail clients render
 *   reliably (no external CSS, no flexbox, no web fonts).
 * - Every slide mails as picture-then-text. Side-by-side layouts and
 *   animations are in-app concerns: an animation mails as its still image,
 *   as its markup with scripts removed, or as a link into the app.
 */
import { isHtmlReleaseBody } from '../contracts/releaseBody';
import { stripHtml } from '../common/htmlText';
import { escapeHtml, releaseCaptionHtml } from './releaseCaptionHtml';

export interface ReleaseEmailSlide {
  titleUk: string;
  titleEn: string;
  bodyUk: string;
  bodyEn: string;
  /** Absolute image URL, or null for a text-only or video slide. */
  imageUrl: string | null;
  /** A video slide: no mail client plays a clip, so it links into the app. */
  videoUrl?: string | null;
  /** An animation with no still image: the hero becomes a link into the app. */
  animationUrl?: string | null;
  /** An HTML animation with no still image: its markup, rendered (takes precedence over `animationUrl`). */
  animationHtml?: string | null;
}

export interface ReleaseEmailInput {
  version: string;
  titleUk: string;
  titleEn: string;
  slides: ReleaseEmailSlide[];
  /** Absolute link the call-to-action button opens. */
  appUrl: string;
  /** Per-recipient one-click unsubscribe link. */
  unsubscribeUrl: string;
  appName?: string;
}

export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}

/** The languages a release email can be written in. */
export type ReleaseEmailLocale = 'uk' | 'en';

/** For a recipient with no stored language. */
export const DEFAULT_LOCALE: ReleaseEmailLocale = 'en';

const DEFAULT_APP_NAME = 'Vatary Desk';

/** Light-theme design tokens, restated because an email has no CSS variables. */
const COLOR = {
  accent: '#36705c',
  accentText: '#27624e',
  tonal: '#e8f3ee',
  ink: '#17251d',
  ink2: '#3d4b43',
  meta: '#627168',
  onAccent: '#ffffff',
  page: '#f6f7f5',
  card: '#ffffff',
  cardBorder: '#e3e7e3',
  cardText: '#1f2a25',
  footer: '#7a857f',
} as const;

const FONT_SANS = "-apple-system,BlinkMacSystemFont,'Segoe UI',Inter,Roboto,sans-serif";
const FONT_MONO = "'DM Mono',ui-monospace,SFMono-Regular,Menlo,monospace";

const CARD_MAX_WIDTH_PX = 560;
const IMAGE_WIDTH_PX = 488;
/** The in-app hero height an HTML animation was laid out for. */
const ANIMATION_HERO_HEIGHT_PX = 240;

export { escapeHtml };

interface LocaleCopy {
  heading: string;
  cta: string;
  unsubscribe: string;
  whyMail: string;
  watchVideo: string;
  seeAnimation: string;
}

const APP_PLACEHOLDER = '{app}';

const COPY: Record<ReleaseEmailLocale, LocaleCopy> = {
  uk: {
    heading: 'Що нового',
    cta: 'Відкрити робочий простір',
    watchVideo: '▶ Переглянути відео в застосунку',
    seeAnimation: '▶ Переглянути анімацію в застосунку',
    unsubscribe: 'Відписатися від листів про оновлення',
    whyMail:
      'Ви отримали цей лист, бо маєте акаунт у {app}. Вимкнути такі листи можна в Налаштуваннях → Приватність або за посиланням нижче.',
  },
  en: {
    heading: "What's new",
    cta: 'Open your workspace',
    watchVideo: '▶ Watch the clip in the app',
    seeAnimation: '▶ See it animated in the app',
    unsubscribe: 'Unsubscribe from update emails',
    whyMail:
      'You received this email because you have a {app} account. You can turn these off in Settings → Privacy or via the link below.',
  },
};

/** Removes everything in an HTML animation that runs code or reaches out; markup and `<style>` stay. */
const UNSAFE_ANIMATION_MARKUP: ReadonlyArray<[RegExp, string]> = [
  [/<script\b[\s\S]*?<\/script\s*>/gi, ''],
  [/<script\b[^>]*>/gi, ''],
  [/<(iframe|object|embed|form|noscript)\b[\s\S]*?<\/\1\s*>/gi, ''],
  [/<\/?(?:iframe|object|embed|form|input|button|link|meta|base|noscript)\b[^>]*>/gi, ''],
  [/\s+on[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, ''],
  [/javascript:/gi, ''],
];

export function releaseAnimationEmailHtml(html: string): string {
  return UNSAFE_ANIMATION_MARKUP.reduce((cleaned, [pattern, replacement]) => cleaned.replace(pattern, replacement), html);
}

/** The preferred text when it has content, otherwise the other one. */
function pick(preferred: string, other: string): string {
  return preferred.trim() ? preferred.trim() : other.trim();
}

function localized(locale: ReleaseEmailLocale, uk: string, en: string): string {
  return locale === 'uk' ? pick(uk, en) : pick(en, uk);
}

const whyMailText = (copy: LocaleCopy, appName: string) => copy.whyMail.replace(APP_PLACEHOLDER, appName);

/** A tonal panel with its content centred: the in-app hero, flattened into a table every client keeps. */
function heroTable(inner: string): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${COLOR.tonal};border-radius:14px;margin:0 0 14px"><tr><td align="center" style="padding:16px">${inner}</td></tr></table>`;
}

function animationTable(html: string): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${COLOR.tonal};border-radius:14px;margin:0 0 14px"><tr><td style="padding:0"><div style="position:relative;height:${ANIMATION_HERO_HEIGHT_PX}px;overflow:hidden;border-radius:14px;text-align:left">${releaseAnimationEmailHtml(html)}</div></td></tr></table>`;
}

function slideHero(slide: ReleaseEmailSlide, title: string, copy: LocaleCopy, animationHtml: string | null): string {
  if (slide.imageUrl) {
    return heroTable(
      `<img src="${escapeHtml(slide.imageUrl)}" alt="${escapeHtml(title)}" width="${IMAGE_WIDTH_PX}" style="display:block;width:100%;max-width:${IMAGE_WIDTH_PX}px;height:auto;border-radius:10px">`,
    );
  }
  if (animationHtml) {
    return animationTable(animationHtml);
  }
  if (slide.animationUrl) {
    return heroTable(
      `<a href="${escapeHtml(slide.animationUrl)}" style="display:block;padding:36px 0;color:${COLOR.accentText};font-weight:600;font-size:14px;text-decoration:none">${escapeHtml(copy.seeAnimation)}</a>`,
    );
  }
  return '';
}

function slideHtml(slide: ReleaseEmailSlide, locale: ReleaseEmailLocale): string {
  const copy = COPY[locale];
  const title = localized(locale, slide.titleUk, slide.titleEn);
  const body = localized(locale, slide.bodyUk, slide.bodyEn);
  const animationHtml = !slide.imageUrl && slide.animationHtml ? slide.animationHtml : null;
  const onlyAnimationLink = !slide.imageUrl && !animationHtml && slide.animationUrl;

  if (!title && !body && !slide.imageUrl && !slide.videoUrl && !onlyAnimationLink && !animationHtml) {
    return '';
  }

  const hero = slideHero(slide, title, copy, animationHtml);
  const heading = title
    ? `<h3 style="margin:0 0 6px;font-size:18px;line-height:1.3;letter-spacing:-0.01em;font-weight:700;color:${COLOR.ink}">${escapeHtml(title)}</h3>`
    : '';
  // A div, not a p: a rich caption carries its own <p> elements.
  const caption = body
    ? `<div style="font-size:14.5px;line-height:1.55;color:${COLOR.ink2}">${releaseCaptionHtml(body)}</div>`
    : '';
  const video = slide.videoUrl
    ? `<p style="margin:8px 0 0;font-size:14px"><a href="${escapeHtml(slide.videoUrl)}" style="color:${COLOR.accentText};font-weight:600;text-decoration:none">${escapeHtml(copy.watchVideo)}</a></p>`
    : '';

  return `<tr><td style="padding:0 0 24px">${hero}${heading}${caption}${video}</td></tr>`;
}

function slideText(slide: ReleaseEmailSlide, locale: ReleaseEmailLocale): string {
  const copy = COPY[locale];
  const title = localized(locale, slide.titleUk, slide.titleEn);
  const body = localized(locale, slide.bodyUk, slide.bodyEn);

  return [
    title && `• ${title}`,
    // Plain-text clients render no markup, so a rich caption is flattened.
    body && (isHtmlReleaseBody(body) ? stripHtml(body) : body),
    slide.videoUrl && `${copy.watchVideo}: ${slide.videoUrl}`,
    !slide.imageUrl && slide.animationUrl && `${copy.seeAnimation}: ${slide.animationUrl}`,
  ]
    .filter(Boolean)
    .join('\n');
}

function releaseSection(input: ReleaseEmailInput, locale: ReleaseEmailLocale, appName: string): string {
  const copy = COPY[locale];
  const title = localized(locale, input.titleUk, input.titleEn);
  const slides = input.slides.map((slide) => slideHtml(slide, locale)).join('');

  return `
<tr><td style="padding:0 0 10px"><span style="display:inline-block;font-family:${FONT_MONO};font-size:12.5px;font-weight:500;color:${COLOR.accentText};background:${COLOR.tonal};border-radius:9999px;padding:3px 9px">${escapeHtml(input.version)}</span> <span style="font-size:12px;color:${COLOR.meta}">${escapeHtml(copy.heading)}</span></td></tr>
<tr><td style="padding:0 0 20px;font-size:22px;line-height:1.25;letter-spacing:-0.01em;font-weight:700;color:${COLOR.ink}">${escapeHtml(title || appName)}</td></tr>
${slides}
<tr><td style="padding:4px 0 32px"><a href="${escapeHtml(input.appUrl)}" style="display:inline-block;background:${COLOR.accent};color:${COLOR.onAccent};text-decoration:none;font-weight:700;font-size:14.5px;padding:12px 20px;border-radius:10px">${escapeHtml(copy.cta)}</a></td></tr>`;
}

/** Renders the email in one language: subject, HTML and the plain-text alternative. */
export function renderReleaseEmail(input: ReleaseEmailInput, locale: ReleaseEmailLocale = DEFAULT_LOCALE): RenderedEmail {
  const appName = input.appName ?? DEFAULT_APP_NAME;
  const copy = COPY[locale];
  const title = localized(locale, input.titleUk, input.titleEn);
  const subject = `${appName} ${input.version} — ${title || copy.heading}`;
  const whyMail = whyMailText(copy, appName);

  const html = `<!doctype html>
<html lang="${locale}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(subject)}</title></head>
<body style="margin:0;padding:0;background:${COLOR.page}">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${COLOR.page};padding:24px 12px">
<tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:${CARD_MAX_WIDTH_PX}px;background:${COLOR.card};border:1px solid ${COLOR.cardBorder};border-radius:18px;padding:28px 28px 24px;font-family:${FONT_SANS};color:${COLOR.cardText}">
<tr><td style="padding:0 0 24px;font-size:15px;font-weight:700;color:${COLOR.ink}">${escapeHtml(appName)}</td></tr>
${releaseSection(input, locale, appName)}
<tr><td style="padding:8px 0 0;border-top:1px solid ${COLOR.cardBorder}"></td></tr>
<tr><td style="padding:16px 0 0"><p style="margin:0 0 6px;font-size:12px;line-height:1.5;color:${COLOR.footer}">${escapeHtml(whyMail)}</p>
<p style="margin:8px 0 0;font-size:12px"><a href="${escapeHtml(input.unsubscribeUrl)}" style="color:${COLOR.footer}">${escapeHtml(copy.unsubscribe)}</a></p></td></tr>
</table>
</td></tr>
</table>
</body></html>`;

  const slidesText = input.slides
    .map((slide) => slideText(slide, locale))
    .filter(Boolean)
    .join('\n\n');

  const text = [
    `${copy.heading} · ${input.version}`,
    title,
    slidesText,
    `${copy.cta}: ${input.appUrl}`,
    '—',
    whyMail,
    `${copy.unsubscribe}: ${input.unsubscribeUrl}`,
  ]
    .filter((block) => block && block.trim())
    .join('\n\n');

  return { subject, html, text };
}
