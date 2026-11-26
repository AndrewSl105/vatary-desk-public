// @vitest-environment jsdom
//
// Release notes are written elsewhere and PASTED into a slide caption,
// and what gets pasted is Markdown. Before this, a rich-text field
// inserted it verbatim and every user read `# Release Notes` and
// `* **Image resizing:**` as those literal characters — in the app and
// in the broadcast email.
import { describe, expect, it } from 'vitest'
import {
  captionToEditorHtml,
  looksLikeMarkdown,
  markdownToCaptionHtml,
} from './captionMarkdown'

describe('looksLikeMarkdown', () => {
  it('leaves ordinary prose alone', () => {
    expect(looksLikeMarkdown('We fixed a few things this week.')).toBe(false)
    expect(markdownToCaptionHtml('We fixed a few things.')).toBeNull()
  })

  it('recognises the shapes people actually paste', () => {
    expect(looksLikeMarkdown('# Release Notes')).toBe(true)
    expect(looksLikeMarkdown('* one\n* two')).toBe(true)
    expect(looksLikeMarkdown('1. one')).toBe(true)
    expect(looksLikeMarkdown('a **bold** word')).toBe(true)
    expect(looksLikeMarkdown('see [docs](https://example.com)')).toBe(true)
  })
})

describe('markdownToCaptionHtml', () => {
  it('converts the real thing', () => {
    const html = markdownToCaptionHtml(
      '# Release Notes\n\n* **Image resizing:** drag the corner.\n* **Copy image:** from the menu.',
    )
    expect(html).toContain('<ul>')
    expect(html).toContain('<strong>Image resizing:</strong>')
    expect(html).not.toContain('* **')
  })

  it('turns a heading into a bold paragraph, not bare text', () => {
    // The caption renderer's allow-list has no headings, so an <h1> that
    // reached it would be flattened to an unemphasised line — the
    // writer's emphasis lost in transit.
    const html = markdownToCaptionHtml('## What changed\n\ntext')
    expect(html).toContain('<p><strong>What changed</strong></p>')
    expect(html).not.toContain('<h2')
  })

  it('flattens what a caption cannot render, keeping the words', () => {
    const html = markdownToCaptionHtml(
      '> quoted line\n\n```\ncode block\n```\n\n| a | b |\n| --- | --- |\n| 1 | 2 |',
    )
    expect(html).not.toContain('<blockquote')
    expect(html).not.toContain('<pre')
    expect(html).not.toContain('<table')
    expect(html).toContain('quoted line')
    expect(html).toContain('code block')
  })

  it('keeps a safe link and drops a dangerous one', () => {
    expect(markdownToCaptionHtml('[docs](https://example.com)')).toContain(
      'href="https://example.com"',
    )
    const bad = markdownToCaptionHtml('[x](javascript:alert(1))')
    expect(bad).not.toContain('javascript:')
  })

  it('scrubs TOP-LEVEL raw HTML too (the walk starts at <body>, which is never emitted)', () => {
    const html = markdownToCaptionHtml(
      '# Notes\n\n<p onclick="evil()">a</p>\n\n' +
        '<a href=" JaVaScRiPt:alert(1)" onmouseover="evil()">b</a> <a href="data:text/html,1">c</a>\n\n' +
        '<div srcdoc="x">d</div>\n\n<iframe srcdoc="x">e</iframe>\n\n<base href="https://evil.example/">',
    )
    expect(html).not.toMatch(/\son[a-z]+=|javascript|data:|srcdoc|<iframe|<base|evil/i)
    expect(html).toContain('a')
  })

  it('drops images — a caption sits BESIDE the picture', () => {
    const html = markdownToCaptionHtml('* ![alt](https://cdn.example/a.png) after')
    expect(html).not.toContain('<img')
    expect(html).toContain('after')
  })
})

/**
 * The editor SEED. Handing TipTap a legacy plain-text caption raw parses
 * it as HTML, where a newline is whitespace — so the caption collapsed
 * into one run-on paragraph the moment the constructor opened it, and
 * the first keystroke saved that collapse.
 */
describe('captionToEditorHtml', () => {
  it('keeps hand-typed line breaks as real paragraphs', () => {
    expect(captionToEditorHtml('first\nsecond')).toBe(
      '<p>first</p><p>second</p>',
    )
  })

  it('converts a caption that was pasted as Markdown', () => {
    const html = captionToEditorHtml('* **one:** a\n* **two:** b')
    expect(html).toContain('<li>')
    expect(html).toContain('<strong>one:</strong>')
  })

  it('passes HTML through untouched', () => {
    const html = '<p>already <strong>rich</strong></p>'
    expect(captionToEditorHtml(html)).toBe(html)
  })

  it('escapes plain text on the way in', () => {
    expect(captionToEditorHtml('a < b & c')).toBe('<p>a &lt; b &amp; c</p>')
  })

  it('seeds an empty caption as empty', () => {
    expect(captionToEditorHtml('')).toBe('')
    expect(captionToEditorHtml('   ')).toBe('')
  })
})
