import { cleanCaptionHtml, releaseCaptionHtml } from './releaseCaptionHtml';

/**
 * The email-side allowlist is a regex over the string, not a DOM walk:
 * a top-level element is rebuilt like any other.
 */
describe.each([
  ['releaseCaptionHtml', releaseCaptionHtml],
  ['cleanCaptionHtml', cleanCaptionHtml],
] as const)('%s: top-level elements', (_name, render) => {
  it.each([
    '<p onclick="evil()" ONERROR="evil()">a</p>',
    '<a href=" JaVaScRiPt:alert(1)" onmouseover="evil()">b</a>',
    '<a href="java&#9;script:alert(1)">c</a>',
    '<a href="data:text/html,1">d</a>',
    '<iframe srcdoc="x">e</iframe>',
    '<base href="https://evil.example/"><p>f</p>',
  ])('scrubs %s', (html) => {
    expect(render(html)).not.toMatch(/\son[a-z]+=|javascript|data:|srcdoc|<iframe|<base|evil/i);
  });

  it('keeps a safe top-level link', () => {
    expect(render('<a href="https://example.com">x</a>')).toContain('href="https://example.com"');
  });
});
