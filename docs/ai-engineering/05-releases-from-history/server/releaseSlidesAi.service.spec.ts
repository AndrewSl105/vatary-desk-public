jest.mock('../prisma/prisma.service', () => ({ PrismaService: class {} }));

import { BadGatewayException } from '@nestjs/common';
import { cleanGenerated, ReleaseSlidesAiService, RELEASE_SLIDES_MAX } from './releaseSlidesAi.service';
import type { AiTextService } from '../ai/aiText.service';

/**
 * The model is an untrusted producer: its slides are cleaned like a
 * paste before the editor ever sees them.
 */
describe('cleanGenerated', () => {
  it('keeps the caption allowlist and drops everything else', () => {
    const out = cleanGenerated({
      titleUk: 'Реліз',
      titleEn: 'Release',
      slides: [
        {
          titleUk: '<b>Канбан</b>',
          titleEn: 'Kanban',
          bodyUk: '<p onclick="x()">Дошки</p><script>alert(1)</script><ul><li><strong>Картки</strong> — опис</li></ul>',
          bodyEn: '<h2>Boards</h2><p style="color:red">Cards</p>',
        },
      ],
    });
    const [s] = out.slides;
    expect(s.titleUk).toBe('Канбан');
    expect(s.bodyUk).toBe('<p>Дошки</p><ul><li><strong>Картки</strong> — опис</li></ul>');
    expect(s.bodyEn).toBe('Boards<p>Cards</p>');
    expect(out.titleEn).toBe('Release');
  });

  it('wraps a markup-less body in a paragraph', () => {
    const out = cleanGenerated({ slides: [{ titleEn: 'A', bodyEn: 'Just text' }] });
    expect(out.slides[0].bodyEn).toBe('<p>Just text</p>');
    expect(out.slides[0].bodyUk).toBe('');
  });

  it('drops empty slides, caps the count, and refuses an empty answer', () => {
    const many = Array.from({ length: 20 }, (_, i) => ({ titleEn: `S${i}` }));
    expect(cleanGenerated({ slides: [{}, ...many] }).slides).toHaveLength(RELEASE_SLIDES_MAX);
    expect(() => cleanGenerated({ slides: [{ titleEn: '  ' }] })).toThrow(BadGatewayException);
    expect(() => cleanGenerated('nonsense')).toThrow(BadGatewayException);
  });
});

describe('ReleaseSlidesAiService', () => {
  it('bills the admin’s personal org', async () => {
    const calls: unknown[][] = [];
    const ai = {
      generateReleaseSlides: (...args: unknown[]) => {
        calls.push(args);
        return Promise.resolve({ slides: [{ titleEn: 'A', bodyEn: '<p>b</p>' }] });
      },
    } as unknown as AiTextService;
    await new ReleaseSlidesAiService(ai).generate('notes here', 'prof_1');
    expect(calls[0][0]).toEqual({ text: 'notes here', maxSlides: RELEASE_SLIDES_MAX });
    expect(calls[0][1]).toEqual({ profileId: 'prof_1', orgId: expect.any(String) });
  });
});
