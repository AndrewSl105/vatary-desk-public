import { isHtmlReleaseBody } from '../contracts/releaseBody';

/**
 * Release captions rendered for email, and cleaned for storage.
 *
 * The same caption is shown in the app, where a DOM sanitizer scrubs it, and
 * mailed to every user who has not opted out. The server has no DOM, so this
 * is a regex allowlist. It is a second line of defence (only an admin
 * authors a release, and the rich-text editor constrains its output) that
 * keeps scripts, event handlers and `javascript:` links out of a mail that
 * goes to the whole user base.
 *
 * Anything outside the allowlist loses its tags and keeps its text, so an
 * unexpected element degrades to its own words instead of disappearing.
 */

const LINK_COLOR = '#36705c';

/** Each allowed tag, with the inline style it is re-emitted with (mail clients ignore `<style>`). */
const ALLOWED_TAGS: Readonly<Record<string, string>> = {
  p: 'margin:0 0 8px',
  br: '',
  strong: '',
  b: '',
  em: '',
  i: '',
  u: '',
  s: '',
  ul: 'margin:0 0 8px;padding-left:20px',
  ol: 'margin:0 0 8px;padding-left:20px',
  li: 'margin:0 0 4px',
  a: `color:${LINK_COLOR};font-weight:600`,
};

/** Dropped together with their contents; every other tag keeps its text. */
const DROP_WITH_CONTENT = /<(script|style|iframe|object|embed)\b[\s\S]*?<\/\1\s*>/gi;
const COMMENT = /<!--[\s\S]*?-->/g;
const TAG = /<\/?([a-z][a-z0-9-]*)\b([^>]*)>/gi;
const HREF_ATTRIBUTE = /\bhref\s*=\s*("([^"]*)"|'([^']*)')/i;
/** Only links a mail client should follow. */
const SAFE_HREF = /^(https?:\/\/|mailto:)/i;
const LINE_BREAK = /\r?\n/g;

const HTML_ESCAPES: ReadonlyArray<[RegExp, string]> = [
  [/&/g, '&amp;'],
  [/</g, '&lt;'],
  [/>/g, '&gt;'],
  [/"/g, '&quot;'],
  [/'/g, '&#39;'],
];

export function escapeHtml(text: string): string {
  return HTML_ESCAPES.reduce((escaped, [pattern, entity]) => escaped.replace(pattern, entity), text);
}

/**
 * One caption as email-ready HTML. Legacy plain-text captions are escaped,
 * with their typed newlines turned into `<br>`.
 */
export function releaseCaptionHtml(body: string): string {
  if (!body.trim()) {
    return '';
  }
  if (!isHtmlReleaseBody(body)) {
    return escapeHtml(body).replace(LINE_BREAK, '<br>');
  }
  return sanitizeCaptionHtml(body, true);
}

/**
 * A caption as it may be stored: the same allowlist, without inline styles.
 * AI-generated slides are cleaned with this before they reach the draft.
 */
export function cleanCaptionHtml(html: string): string {
  return sanitizeCaptionHtml(html, false).trim();
}

function readSafeHref(attributes: string): string | null {
  const match = HREF_ATTRIBUTE.exec(attributes);
  const href = (match?.[2] ?? match?.[3] ?? '').trim();
  return href && SAFE_HREF.test(href) ? href : null;
}

function openingLink(attributes: string, styled: boolean): string {
  const href = readSafeHref(attributes);
  // An unusable href is dropped but the element kept, so its `</a>` stays balanced.
  if (!href) {
    return '<a>';
  }
  if (!styled) {
    return `<a href="${escapeHtml(href)}">`;
  }
  return `<a href="${escapeHtml(href)}" style="${ALLOWED_TAGS.a}" target="_blank" rel="noopener noreferrer">`;
}

function sanitizeCaptionHtml(html: string, styled: boolean): string {
  return html
    .replace(DROP_WITH_CONTENT, '')
    .replace(COMMENT, '')
    .replace(TAG, (match, rawName: string, attributes: string) => {
      const name = rawName.toLowerCase();
      const allowedStyle = ALLOWED_TAGS[name];
      if (allowedStyle === undefined) {
        return '';
      }
      if (match.startsWith('</')) {
        return `</${name}>`;
      }
      if (name === 'a') {
        return openingLink(attributes, styled);
      }

      const style = styled ? allowedStyle : '';
      const selfClosing = name === 'br' ? ' /' : '';
      return style ? `<${name} style="${style}"${selfClosing}>` : `<${name}${selfClosing}>`;
    });
}
