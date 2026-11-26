import DOMPurify from 'dompurify'
import { isHtmlReleaseBody } from '@contracts/releaseBody'

/**
 * The tags a slide caption may keep. It mirrors the server's email
 * allowlist, so a caption reads the same in the app and in the email that
 * announces it. `<img>` is deliberately absent: a caption cannot hold one.
 */
export const CAPTION_TAGS = ['p', 'br', 'strong', 'b', 'em', 'i', 'u', 's', 'ul', 'ol', 'li', 'a']

const CAPTION_ATTRIBUTES = ['href']
const LINK_TARGET = '_blank'
const LINK_REL = 'noopener noreferrer'

const HTML_TAG = /<[^>]*>/g
const NON_BREAKING_SPACE = /&nbsp;/g

/**
 * A release slide's caption, prepared for display.
 *
 * Captions written before the rich-text editor are plain text with typed
 * newlines, and a published release never changes, so both forms coexist.
 * `null` means "not markup: render it as text and keep its line breaks".
 */
export function releaseBodyHtml(body: string): string | null {
  if (!body.trim() || !isHtmlReleaseBody(body)) {
    return null
  }
  return sanitizeCaption(body)
}

/**
 * The XSS boundary for caption markup. Every surviving link is hardened the
 * same way whatever the caption declared; unsafe schemes such as
 * `javascript:` are removed by DOMPurify first.
 */
function sanitizeCaption(html: string): string {
  const fragment = DOMPurify.sanitize(html, {
    ALLOWED_TAGS: CAPTION_TAGS,
    ALLOWED_ATTR: CAPTION_ATTRIBUTES,
    RETURN_DOM_FRAGMENT: true,
  })

  fragment.querySelectorAll('a[href]').forEach((link) => {
    link.setAttribute('target', LINK_TARGET)
    link.setAttribute('rel', LINK_REL)
  })

  // A DocumentFragment has no innerHTML of its own: serialise through a detached host.
  const host = document.createElement('div')
  host.appendChild(fragment)
  return host.innerHTML
}

/**
 * Whether editor output is actually empty. The editor serialises a blank
 * document as `<p></p>`, which must not pass as a caption.
 */
export function isEmptyCaptionHtml(html: string): boolean {
  return html.replace(HTML_TAG, '').replace(NON_BREAKING_SPACE, ' ').trim() === ''
}
