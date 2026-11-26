// @vitest-environment jsdom
//
// Slide captions are the one string in this app that is authored by an
// admin and shown to EVERY user — in the modal and in the broadcast
// email. Two things have to hold forever:
//
//   - a caption written before the constructor had a rich-text editor is
//     plain text, and a published release is immutable, so those rows can
//     never be migrated. They must keep rendering as text;
//   - markup is sanitised harder here than a document viewer would, in
//     particular dropping `<img>`: a caption image would follow the
//     pages `data-file-id` contract, which neither the anonymous carousel
//     nor the email can re-mint.
import { describe, expect, it } from 'vitest'
import { isEmptyCaptionHtml, releaseBodyHtml } from './releaseBody'

describe('releaseBodyHtml', () => {
  it('leaves legacy plain text as text', () => {
    expect(releaseBodyHtml('Перший рядок\nдругий')).toBeNull()
    expect(releaseBodyHtml('')).toBeNull()
    expect(releaseBodyHtml('   ')).toBeNull()
    // A caption that merely MENTIONS a tag is still text — otherwise it
    // would lose its newlines and emit an unclosed element.
    expect(releaseBodyHtml('use <b> for bold')).toBeNull()
  })

  it('treats real editor output as markup', () => {
    const html = releaseBodyHtml('<p>Hello <strong>world</strong></p>')
    expect(html).toBe('<p>Hello <strong>world</strong></p>')
  })

  it('drops scripts, handlers and images', () => {
    const html = releaseBodyHtml(
      '<p onclick="alert(1)">hi</p><script>alert(1)</script>' +
        '<img src="" data-file-id="f1">',
    )
    expect(html).not.toBeNull()
    expect(html).not.toContain('onclick')
    expect(html).not.toContain('alert(1)')
    expect(html).not.toContain('<img')
    expect(html).toContain('hi')
  })

  it('keeps a safe link and its hardening, drops a javascript: one', () => {
    const ok = releaseBodyHtml('<p><a href="https://example.com">go</a></p>')
    expect(ok).toContain('href="https://example.com"')
    expect(ok).toContain('rel="noopener noreferrer"')

    const bad = releaseBodyHtml('<p><a href="javascript:alert(1)">go</a></p>')
    expect(bad).not.toContain('javascript:')
    expect(bad).toContain('go')
  })
})

describe('isEmptyCaptionHtml', () => {
  it('recognises the shapes an emptied editor produces', () => {
    expect(isEmptyCaptionHtml('')).toBe(true)
    expect(isEmptyCaptionHtml('<p></p>')).toBe(true)
    expect(isEmptyCaptionHtml('<p><br></p>')).toBe(true)
    expect(isEmptyCaptionHtml('<p>&nbsp;</p>')).toBe(true)
    expect(isEmptyCaptionHtml('<p>x</p>')).toBe(false)
  })
})
