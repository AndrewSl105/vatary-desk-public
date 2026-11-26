import { releaseAnimationEmailHtml, renderReleaseEmail, type ReleaseEmailInput } from './releaseEmail';

const base: ReleaseEmailInput = {
  version: '1.4.0',
  titleUk: 'Таймлайн та пошта',
  titleEn: 'Timeline & mail',
  slides: [
    {
      titleUk: 'Новий таймлайн',
      titleEn: 'New timeline',
      bodyUk: 'День, тиждень, місяць.',
      bodyEn: 'Day, week, month.',
      imageUrl: 'https://cdn.example.com/a.png',
    },
    {
      titleUk: 'Тільки українською',
      titleEn: '',
      bodyUk: '',
      bodyEn: '',
      imageUrl: null,
    },
  ],
  appUrl: 'https://app.example.com/home',
  unsubscribeUrl: 'https://app.example.com/unsubscribe?u=u1&t=token',
};

describe('renderReleaseEmail', () => {
  it('defaults to English — subject and body', () => {
    const { subject, html, text } = renderReleaseEmail(base);
    expect(subject).toBe('Vatary Desk 1.4.0 — Timeline & mail');
    expect(html).toContain('What&#39;s new');
    expect(text).toContain('Day, week, month.');
  });

  it('writes ONE language, never both', () => {
    const en = renderReleaseEmail(base, 'en');
    expect(en.html).not.toContain('Що нового');
    expect(en.text).not.toContain('День, тиждень, місяць.');

    const uk = renderReleaseEmail(base, 'uk');
    expect(uk.subject).toBe('Vatary Desk 1.4.0 — Таймлайн та пошта');
    expect(uk.html).toContain('Що нового');
    expect(uk.html).not.toContain('What&#39;s new');
    expect(uk.text).not.toContain('Day, week, month.');
  });

  it('falls back to the other language rather than dropping a slide', () => {
    // Slide 2 has no English copy at all. The wrong language beats no
    // text — the same rule `pickReleaseText` applies in the app.
    const { html } = renderReleaseEmail(base, 'en');
    expect(html).toContain('Тільки українською');
    expect(html.split('Тільки українською').length - 1).toBe(1);
  });

  it('escapes admin-authored text and links', () => {
    const hostile = {
      ...base,
      titleUk: '<script>alert(1)</script> & "quotes"',
      slides: [
        {
          titleUk: 'x',
          titleEn: '',
          bodyUk: 'line1\nline2 <b>',
          bodyEn: '',
          imageUrl: 'https://cdn.example.com/a.png?x="1"',
        },
      ],
    };
    // Rendered in Ukrainian: the hostile copy under test is the UK side.
    const { html, subject } = renderReleaseEmail(hostile, 'uk');
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
    expect(html).toContain('line1<br>line2 &lt;b&gt;');
    expect(html).toContain('a.png?x=&quot;1&quot;');
    expect(subject).toContain('<script>'); // subject is not HTML
  });

  it('keeps a rich-text caption as markup, scrubbed', () => {
    const rich = {
      ...base,
      slides: [
        {
          titleUk: 'x',
          titleEn: '',
          bodyUk:
            '<p>Перший <strong>рядок</strong></p><ul><li>пункт</li></ul>' +
            '<p><a href="https://app.example.com/x">лінк</a></p>' +
            '<script>alert(1)</script><p onclick="alert(1)">клік</p>' +
            '<a href="javascript:alert(1)">погане</a>',
          bodyEn: '',
          imageUrl: null,
        },
      ],
    };
    const { html, text } = renderReleaseEmail(rich);
    // Structure survives, with the inline styles a mail client needs.
    expect(html).toContain('<strong>рядок</strong>');
    expect(html).toContain('<li style="margin:0 0 4px">пункт</li>');
    expect(html).toContain('<a href="https://app.example.com/x"');
    // …and nothing else does.
    expect(html).not.toContain('alert(1)');
    expect(html).not.toContain('onclick');
    // The unusable href is dropped; its element stays so `</a>` balances.
    expect(html).toContain('<a>погане</a>');
    // The caption's own <p> may not nest inside one.
    expect(html).not.toContain('<p style="margin:0;font-size:14.5px');
    // Text-only clients get the caption flattened, not raw tags.
    expect(text).not.toContain('<p>');
    expect(text).toContain('Перший рядок');
  });

  it('leaves a legacy plain-text caption escaped, newlines and all', () => {
    const plain = {
      ...base,
      slides: [
        {
          titleUk: 'x',
          titleEn: '',
          // No closing tag and no block element — a caption that merely
          // MENTIONS a tag is still plain text.
          bodyUk: 'line1\nline2 <b>',
          bodyEn: '',
          imageUrl: null,
        },
      ],
    };
    const { html } = renderReleaseEmail(plain, 'uk');
    expect(html).toContain('line1<br>line2 &lt;b&gt;');
  });

  it('always carries the unsubscribe link and the CTA', () => {
    const { html, text } = renderReleaseEmail(base);
    // `&` in a query string is `&amp;` inside an href — that IS the URL.
    expect(html).toContain(
      `href="${base.unsubscribeUrl.replace('&', '&amp;')}"`,
    );
    expect(text).toContain(base.unsubscribeUrl);
    expect(html).toContain(base.appUrl);
    expect(text).toContain(base.appUrl);
  });

  it('renders an image slide with the picture and a text slide without one', () => {
    const { html } = renderReleaseEmail(base);
    expect(html).toContain('<img src="https://cdn.example.com/a.png"');
    // Once. The email carries one language block, so the picture that
    // used to appear in each of two now appears in the only one.
    expect((html.match(/<img /g) ?? []).length).toBe(1);
  });

  it('gives a video slide a link into the app instead of an embed', () => {
    // No mail client plays a clip, so the slide must not arrive as a
    // bare caption with its media silently dropped.
    const withVideo: ReleaseEmailInput = {
      ...base,
      slides: [
        {
          titleUk: 'Коротке відео',
          titleEn: 'Short clip',
          bodyUk: 'Дивіться в застосунку.',
          bodyEn: 'Watch it in the app.',
          imageUrl: null,
          videoUrl: 'https://app.example.com/home',
        },
      ],
    };
    const { html, text } = renderReleaseEmail(withVideo, 'uk');
    expect(html).not.toContain('<img ');
    expect(html).toContain('Переглянути відео в застосунку');
    expect(html).not.toContain('Watch the clip in the app');
    expect(text).toContain('https://app.example.com/home');
  });

  it('gives an animation with no still a link into the app', () => {
    // The first slide may carry only an animation; no mail client runs
    // one, so the hero becomes a link rather than vanishing.
    const animated: ReleaseEmailInput = {
      ...base,
      slides: [
        {
          titleUk: '',
          titleEn: 'Kanban',
          bodyUk: '',
          bodyEn: '',
          imageUrl: null,
          animationUrl: 'https://app.example.com/home',
        },
      ],
    };
    const { html, text } = renderReleaseEmail(animated);
    expect(html).not.toContain('<img ');
    expect(html).toContain('See it animated in the app');
    expect(text).toContain('See it animated in the app: https://app.example.com/home');
  });

  it('mails an HTML animation with no still as its rendered markup, not a link', () => {
    const animated: ReleaseEmailInput = {
      ...base,
      slides: [
        {
          titleUk: '',
          titleEn: 'Kanban',
          bodyUk: '',
          bodyEn: '',
          imageUrl: null,
          animationHtml:
            '<style>.card{animation:pop 1s}</style><div class="card" onclick="x()">Board</div><script>go()</script>',
        },
      ],
    };
    const { html } = renderReleaseEmail(animated);
    expect(html).toContain('<style>.card{animation:pop 1s}</style><div class="card">Board</div>');
    expect(html).not.toContain('<script');
    expect(html).not.toContain('onclick');
    expect(html).not.toContain('See it animated');
    // In a box the in-app hero's height.
    expect(html).toContain('height:240px');
  });

  it('a still beats the HTML animation too', () => {
    const both: ReleaseEmailInput = {
      ...base,
      slides: [
        {
          titleUk: '',
          titleEn: 'Kanban',
          bodyUk: '',
          bodyEn: '',
          imageUrl: 'https://cdn.example.com/still.png',
          animationHtml: '<div class="only-in-app">x</div>',
        },
      ],
    };
    const { html } = renderReleaseEmail(both);
    expect(html).toContain('still.png');
    expect(html).not.toContain('only-in-app');
  });

  it('releaseAnimationEmailHtml strips what runs or reaches out and keeps the rest', () => {
    expect(
      releaseAnimationEmailHtml(
        '<div onmouseover=\'a()\' class="x">A</div><iframe srcdoc="y"></iframe><link rel="stylesheet" href="z"><a href="javascript:alert(1)">b</a><script type="module">c()</script><svg><circle r="4"/></svg>',
      ),
    ).toBe('<div class="x">A</div><a href="alert(1)">b</a><svg><circle r="4"/></svg>');
  });

  it('prefers the still over the animation link', () => {
    const both: ReleaseEmailInput = {
      ...base,
      slides: [
        {
          titleUk: '',
          titleEn: 'Kanban',
          bodyUk: '',
          bodyEn: '',
          imageUrl: 'https://cdn.example.com/still.png',
          animationUrl: null,
        },
      ],
    };
    const { html } = renderReleaseEmail(both);
    expect(html).toContain('<img src="https://cdn.example.com/still.png"');
    expect(html).not.toContain('See it animated');
  });

  it('keeps a media-less, text-less slide out of the email entirely', () => {
    const blank: ReleaseEmailInput = {
      ...base,
      slides: [
        { titleUk: '', titleEn: '', bodyUk: '', bodyEn: '', imageUrl: null },
      ],
    };
    // The slide row is the only `<td style="padding:0 0 24px">` in the
    // template (the brand header's style continues past the quote).
    const { html } = renderReleaseEmail(blank);
    expect(html.match(/<td style="padding:0 0 24px">/g)).toBeNull();
  });
});
