import { marked } from 'marked'
import { isHtmlReleaseBody } from '@contracts/releaseBody'
import { looksLikeMarkdown } from '../../shared/markdown/looksLikeMarkdown'
import { CAPTION_TAGS } from './releaseBody'

/**
 * Markdown pasted into a slide caption.
 *
 * Release notes are usually written elsewhere and pasted in as Markdown; a
 * rich-text field would insert it verbatim. This converts it, narrowed to
 * the tags a caption can render: a heading becomes a bold paragraph, and
 * images, tables and code blocks are flattened to their words. Returns
 * `null` when the text carries no Markdown worth converting, so a plain
 * sentence pastes as a plain sentence.
 */

export { looksLikeMarkdown }

const KEEP_TAGS = new Set(CAPTION_TAGS.map((tag) => tag.toUpperCase()))
/** Dropped together with their contents: nothing in them reads as a caption. */
const DROP_TAGS = new Set(['IMG', 'FIGURE', 'PICTURE', 'VIDEO', 'AUDIO', 'IFRAME', 'SCRIPT', 'STYLE'])
const HEADINGS = 'h1,h2,h3,h4,h5,h6'
const SAFE_HREF = /^(https?:\/\/|mailto:|\/)/i
const LINE_BREAK = /\r?\n/

const HTML_ESCAPES: ReadonlyArray<[RegExp, string]> = [
  [/&/g, '&amp;'],
  [/</g, '&lt;'],
  [/>/g, '&gt;'],
  [/"/g, '&quot;'],
]

export function markdownToCaptionHtml(text: string): string | null {
  if (!text.trim() || !looksLikeMarkdown(text)) {
    return null
  }

  let html: string
  try {
    html = marked.parse(text, { gfm: true, breaks: true }) as string
  } catch {
    return null
  }

  if (typeof DOMParser === 'undefined') {
    return null
  }

  try {
    const doc = new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html')
    narrowToCaptionTags(doc.body)
    return doc.body.innerHTML.trim() || null
  } catch {
    return null
  }
}

/** A heading carries the writer's emphasis, so it becomes a bold paragraph instead of plain text. */
function headingsToBold(root: HTMLElement): void {
  for (const heading of Array.from(root.querySelectorAll(HEADINGS))) {
    const paragraph = root.ownerDocument.createElement('p')
    const strong = root.ownerDocument.createElement('strong')
    strong.textContent = heading.textContent ?? ''
    paragraph.appendChild(strong)
    heading.replaceWith(paragraph)
  }
}

/** Every attribute goes except a link's destination, and an unsafe destination goes too. */
function stripAttributes(element: Element): void {
  const isLink = element.tagName === 'A'

  for (const attribute of Array.from(element.attributes)) {
    if (isLink && attribute.name.toLowerCase() === 'href') continue
    element.removeAttribute(attribute.name)
  }

  if (isLink && !SAFE_HREF.test((element.getAttribute('href') ?? '').trim())) {
    element.removeAttribute('href')
  }
}

function narrowToCaptionTags(root: HTMLElement): void {
  headingsToBold(root)

  for (const element of Array.from(root.querySelectorAll('*'))) {
    if (DROP_TAGS.has(element.tagName)) {
      element.remove()
      continue
    }

    stripAttributes(element)

    if (!KEEP_TAGS.has(element.tagName)) {
      // Unwrap: the tag goes, its words stay.
      element.replaceWith(...Array.from(element.childNodes))
    }
  }
}

/**
 * The seed value for the caption editor. A legacy plain-text caption handed
 * to the editor raw would be parsed as HTML and collapse its line breaks,
 * so Markdown is converted, other text keeps one paragraph per line, and
 * HTML passes through untouched. Memoize the result at the call site: the
 * editor re-seeds whenever this string's identity changes.
 */
export function captionToEditorHtml(value: string): string {
  if (!value.trim()) {
    return ''
  }
  if (isHtmlReleaseBody(value)) {
    return value
  }
  return markdownToCaptionHtml(value) ?? plainTextToParagraphs(value)
}

function plainTextToParagraphs(text: string): string {
  return text
    .split(LINE_BREAK)
    .map((line) => `<p>${escapeHtml(line)}</p>`)
    .join('')
}

function escapeHtml(text: string): string {
  return HTML_ESCAPES.reduce((escaped, [pattern, entity]) => escaped.replace(pattern, entity), text)
}
