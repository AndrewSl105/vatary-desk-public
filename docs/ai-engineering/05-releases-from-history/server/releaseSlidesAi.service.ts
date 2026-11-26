import { BadGatewayException, Injectable } from '@nestjs/common';

import { AiTextService } from '../ai/aiText.service';
import { personalOrgId } from '../common/org-context';
import { cleanCaptionHtml } from './releaseCaptionHtml';

/** Slides per generation; a draft holds up to 20 in total. */
export const RELEASE_SLIDES_MAX = 8;
const MAX_TITLE_LENGTH = 120;

const HTML_TAG = /<[^>]*>/g;
const WHITESPACE_RUN = /\s+/g;
const BLOCK_CLOSING_TAG = /<\/(p|ul|ol|li)>/i;

export interface GeneratedSlide {
  titleUk: string;
  titleEn: string;
  bodyUk: string;
  bodyEn: string;
}

export interface GeneratedReleaseSlides {
  titleUk: string;
  titleEn: string;
  slides: GeneratedSlide[];
}

/**
 * "Generate from text" in the release editor: raw notes in any language →
 * slides written in Ukrainian and English.
 *
 * Nothing is saved here. The admin gets a proposal, the editor drops it into
 * the draft, and the draft is saved like a hand-written one, so a bad
 * generation costs an undo, never a published release. The model is an
 * untrusted producer: its output is cleaned like a paste.
 */
@Injectable()
export class ReleaseSlidesAiService {
  constructor(private readonly ai: AiTextService) {}

  async generate(text: string, adminProfileId: string): Promise<GeneratedReleaseSlides> {
    const raw = await this.ai.generateReleaseSlides(
      { text, maxSlides: RELEASE_SLIDES_MAX },
      // Billed to the admin's personal organization: it is their tool, not a workspace's.
      { profileId: adminProfileId, orgId: personalOrgId(adminProfileId) },
    );
    return cleanGenerated(raw);
  }
}

const asRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' ? (value as Record<string, unknown>) : {};

/** A plain-text title: tags removed, whitespace collapsed, length capped. */
function plainText(value: unknown, maxLength: number): string {
  if (typeof value !== 'string') {
    return '';
  }
  return value.replace(HTML_TAG, '').replace(WHITESPACE_RUN, ' ').trim().slice(0, maxLength);
}

/** A body the editor can render as markup; a model that forgot the markup still gets a paragraph. */
function captionBody(value: unknown): string {
  if (typeof value !== 'string' || !value.trim()) {
    return '';
  }
  const cleaned = cleanCaptionHtml(value);
  if (!cleaned) {
    return '';
  }
  return BLOCK_CLOSING_TAG.test(cleaned) ? cleaned : `<p>${cleaned}</p>`;
}

const hasContent = (slide: GeneratedSlide) => Boolean(slide.titleUk || slide.titleEn || slide.bodyUk || slide.bodyEn);

export function cleanGenerated(raw: unknown): GeneratedReleaseSlides {
  const response = asRecord(raw);
  const rawSlides = Array.isArray(response.slides) ? response.slides : [];

  const slides = rawSlides
    .map((rawSlide): GeneratedSlide => {
      const slide = asRecord(rawSlide);
      return {
        titleUk: plainText(slide.titleUk, MAX_TITLE_LENGTH),
        titleEn: plainText(slide.titleEn, MAX_TITLE_LENGTH),
        bodyUk: captionBody(slide.bodyUk),
        bodyEn: captionBody(slide.bodyEn),
      };
    })
    .filter(hasContent)
    .slice(0, RELEASE_SLIDES_MAX);

  if (slides.length === 0) {
    throw new BadGatewayException('The AI returned no slides — try again or shorten the text.');
  }

  return {
    titleUk: plainText(response.titleUk, MAX_TITLE_LENGTH),
    titleEn: plainText(response.titleEn, MAX_TITLE_LENGTH),
    slides,
  };
}
