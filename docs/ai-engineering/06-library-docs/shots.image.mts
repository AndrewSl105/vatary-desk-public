/**
 * A browser PNG → the webp the Library ships, and "is it the same picture
 * as the one on disk?". sharp is loaded from the server's dependencies, so
 * the repository root needs no second native build.
 */
import { createRequire } from 'node:module';
import { join } from 'node:path';
import pixelmatch from 'pixelmatch';

import { UNCHANGED_RATIO } from './shots.logic.mts';

type Sharp = typeof import('../../server/node_modules/sharp/lib/index.js');

const ROOT = join(import.meta.dirname, '../..');
const sharp: Sharp = createRequire(join(ROOT, 'server/package.json'))('sharp');

const BYTES_PER_KB = 1024;
/** The Library compiler's image size limit. */
export const MAX_BYTES = 500 * BYTES_PER_KB;

/** Widths tried in order once quality alone no longer fits; the first is the 2× viewport fallback. */
const FALLBACK_WIDTHS = [2880, 2400, 2000, 1600] as const;
/** Quality steps tried at each width, best first. */
const WEBP_QUALITIES = [82, 74, 66, 58] as const;
const WEBP_EFFORT = 5;
/** Per-pixel colour distance pixelmatch tolerates. */
const PIXEL_THRESHOLD = 0.1;
/** Returned when the sizes differ: every pixel counts as changed. */
const FULLY_CHANGED = 1;

/** Quality first, then size: most screens fit at the top quality; a busy one steps down, and only then is it scaled. */
export async function toWebp(png: Buffer): Promise<Buffer> {
  const meta = await sharp(png).metadata();
  const widths = [meta.width ?? FALLBACK_WIDTHS[0], ...FALLBACK_WIDTHS.slice(1)];

  for (const width of widths) {
    for (const quality of WEBP_QUALITIES) {
      const out = await sharp(png)
        .resize({ width: Math.min(width, meta.width ?? width), withoutEnlargement: true })
        .webp({ quality, effort: WEBP_EFFORT })
        .toBuffer();
      if (out.length <= MAX_BYTES) return out;
    }
  }

  throw new Error(`could not fit the picture into ${MAX_BYTES / BYTES_PER_KB} KB — crop it with an area selector`);
}

async function rgba(image: Buffer): Promise<{ data: Buffer; width: number; height: number }> {
  const { data, info } = await sharp(image).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return { data, width: info.width, height: info.height };
}

/**
 * Share of pixels that differ between two pictures. Compared after the
 * same webp encoding, so the codec's own noise does not count as a change.
 */
export async function diffRatio(a: Buffer, b: Buffer): Promise<number> {
  const [x, y] = await Promise.all([rgba(a), rgba(b)]);
  if (x.width !== y.width || x.height !== y.height) return FULLY_CHANGED;

  const changed = pixelmatch(x.data, y.data, undefined, x.width, x.height, { threshold: PIXEL_THRESHOLD });
  return changed / (x.width * x.height);
}

export async function isUnchanged(previous: Buffer, next: Buffer): Promise<boolean> {
  return (await diffRatio(previous, next)) < UNCHANGED_RATIO;
}
