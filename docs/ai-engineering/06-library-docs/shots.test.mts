/** node --test scripts/library/shots.test.mts */
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { test } from 'node:test';
import { diffRatio, isUnchanged, MAX_BYTES, toWebp } from './shots.image.mts';
import { assertLocalBase, assetPath, changeFrontmatter, parseArgs, readChangeShots, readManifest, resolveRoute, selectShots } from './shots.logic.mts';

const ids = new Set(['admin.history', 'pages.ai-edit-part']);
const shot = (extra: Record<string, unknown> = {}) => ({ article: 'admin.history', name: 'history-page', account: 'admin', route: '/admin/history', ...extra });

test('command line', () => {
  assert.deepEqual(parseArgs([]), { article: null, change: null, onlyMissing: false, seed: false, force: false, help: false });
  assert.equal(parseArgs(['--change', '2026-11-11-x']).change, '2026-11-11-x');
  assert.equal(parseArgs(['--change=2026-11-11-x']).change, '2026-11-11-x');
  assert.throws(() => parseArgs(['--change']), /needs a change id/);
  assert.throws(() => parseArgs(['--article', 'a', '--change', 'b']), /separate runs/);
  assert.equal(parseArgs(['--article', 'admin.history', '--only-missing']).article, 'admin.history');
  assert.equal(parseArgs(['--article=pages.x']).article, 'pages.x');
  assert.throws(() => parseArgs(['--article']), /needs an article id/);
  assert.throws(() => parseArgs(['--nope']), /unknown option/);
});

test('manifest: defaults, and every problem at once', () => {
  const { shots, problems } = readManifest({ shots: [shot({ steps: [{ click: { testid: 'x' } }, { wait: 500 }] })] }, ids);
  assert.deepEqual(problems, []);
  assert.deepEqual(shots[0], {
    article: 'admin.history', name: 'history-page', account: 'admin', route: '/admin/history',
    steps: [{ click: { testid: 'x' } }, { wait: 500 }], area: 'viewport', locales: ['uk', 'en'], theme: 'light', hide: [],
  });
  assert.deepEqual(readManifest({ shots: [shot({ hide: ['[data-testid="x"]'] })] }, ids).shots[0].hide, ['[data-testid="x"]']);
  assert.match(readManifest({ shots: [shot({ hide: [''] })] }, ids).problems[0], /hide is a list/);
  const bad = readManifest(
    { shots: [shot({ article: 'ghost' }), shot({ name: 'Bad Name' }), shot(), shot(), shot({ name: 'b', account: 'root' }), shot({ name: 'c', theme: 'dark' }), shot({ name: 'd', steps: [{ hover: 1 }] })] },
    ids,
  );
  assert.equal(bad.problems.length, 6);
  assert.match(bad.problems.join('\n'), /unknown article "ghost"[\s\S]*Bad Name[\s\S]*duplicate[\s\S]*account[\s\S]*theme[\s\S]*a step is/);
  assert.deepEqual(readManifest({}, ids).problems, ['shots.yaml: expected `shots:` with a list']);
});

test('routes, paths and selection', () => {
  assert.equal(resolveRoute('/n/{seed.page.{locale}}', 'uk', { 'page.uk': 'abc' }), '/n/abc');
  assert.throws(() => resolveRoute('/n/{seed.page.{locale}}', 'en', { 'page.uk': 'abc' }), /no seeded "page.en"/);
  assert.equal(assetPath({ article: 'admin.history', name: 'history-page' }, 'en'), 'library/assets/admin.history/history-page.en.webp');
  const { shots } = readManifest({ shots: [shot(), shot({ article: 'pages.ai-edit-part', name: 'p', locales: ['uk'] })] }, ids);
  assert.equal(selectShots(shots, { article: null, onlyMissing: false }, () => false).length, 3);
  assert.deepEqual(selectShots(shots, { article: 'pages.ai-edit-part', onlyMissing: false }, () => false).map((t) => t.locale), ['uk']);
  const missing = selectShots(shots, { article: null, onlyMissing: true }, (p) => p.endsWith('history-page.uk.webp'));
  assert.deepEqual(missing.map((t) => assetPath(t.shot, t.locale)), ['library/assets/admin.history/history-page.en.webp', 'library/assets/pages.ai-edit-part/p.uk.webp']);
});

test("a change entry's shot: same rules, uk by default, its own folder", () => {
  const fm = changeFrontmatter('---\nid: 2026-11-11-x\nshot:\n  route: /n/new\n---\n## uk\nТекст.\n');
  assert.equal(fm, 'id: 2026-11-11-x\nshot:\n  route: /n/new');
  assert.equal(changeFrontmatter('no frontmatter'), null);
  const { shots, problems } = readChangeShots([
    { id: '2026-11-11-x', path: 'changes/2026-11-11-x.md', shot: { route: '/n/new', steps: [{ wait: { testid: 'page-editor' } }] } },
    { id: '2026-11-11-none', path: 'changes/2026-11-11-none.md', shot: undefined },
  ]);
  assert.deepEqual(problems, []);
  assert.equal(shots.length, 1);
  assert.deepEqual(shots[0].locales, ['uk']);
  assert.equal(shots[0].change, '2026-11-11-x');
  assert.equal(assetPath(shots[0], 'uk'), 'changes/assets/2026-11-11-x.uk.webp');
  const bad = readChangeShots([
    { id: 'a', path: 'changes/a.md', shot: { route: 'n/new' } },
    { id: 'b', path: 'changes/b.md', shot: { route: '/x', steps: [{ hover: 1 }] } },
    { id: 'c', path: 'changes/c.md', shot: '/x' },
  ]);
  assert.equal(bad.problems.length, 3);
  assert.match(bad.problems.join('\n'), /changes\/a\.md: shot: route[\s\S]*changes\/b\.md: shot\.steps\[0\]: a step is[\s\S]*changes\/c\.md: shot: is a mapping/);

  const { shots: articleShots } = readManifest({ shots: [shot()] }, ids);
  const all = [...articleShots, ...shots];
  assert.equal(selectShots(all, { article: null, change: null, onlyMissing: false }, () => false).length, 3);
  assert.deepEqual(
    selectShots(all, { article: null, change: '2026-11-11-x', onlyMissing: false }, () => false).map((t) => assetPath(t.shot, t.locale)),
    ['changes/assets/2026-11-11-x.uk.webp'],
  );
  assert.equal(selectShots(all, { article: 'admin.history', change: null, onlyMissing: false }, () => false).length, 2);

  // A taken change picture is history: a full run leaves it alone; only --change <id> retakes it.
  const taken = (p: string) => p.startsWith('changes/assets/');
  assert.deepEqual(
    selectShots(all, { article: null, change: null, onlyMissing: false }, taken).map((t) => assetPath(t.shot, t.locale)),
    ['library/assets/admin.history/history-page.uk.webp', 'library/assets/admin.history/history-page.en.webp'],
  );
  assert.equal(selectShots(all, { article: null, change: '2026-11-11-x', onlyMissing: false }, taken).length, 1);
  assert.equal(selectShots(all, { article: null, change: '2026-11-11-x', onlyMissing: true }, taken).length, 0);
});

test('local stacks only', () => {
  assert.equal(assertLocalBase('http://localhost:5173').port, '5173');
  assert.ok(assertLocalBase('http://desk.localhost:5173'));
  assert.throws(() => assertLocalBase('https://vatarydesk.com'), /not a local app/);
});

const sharp = createRequire(join(import.meta.dirname, '../../server/package.json'))('sharp');
const png = (w: number, h: number, color: { r: number; g: number; b: number }, noise = false) => {
  const data = Buffer.alloc(w * h * 3);
  for (let i = 0; i < w * h; i++) {
    const n = noise ? (i * 2654435761) % 256 : 0;
    data[i * 3] = noise ? n : color.r;
    data[i * 3 + 1] = noise ? (n * 7) % 256 : color.g;
    data[i * 3 + 2] = noise ? (n * 13) % 256 : color.b;
  }
  return sharp(data, { raw: { width: w, height: h, channels: 3 } }).png().toBuffer() as Promise<Buffer>;
};

test('webp: under the limit even for a noisy 2× screen', async () => {
  const out = await toWebp(await png(2880, 1800, { r: 0, g: 0, b: 0 }, true));
  assert.ok(out.length <= MAX_BYTES, `${out.length} bytes`);
  assert.equal((await sharp(out).metadata()).format, 'webp');
});

test('diff: the same picture is unchanged, another colour or size is not', async () => {
  const a = await toWebp(await png(400, 300, { r: 240, g: 240, b: 240 }));
  const b = await toWebp(await png(400, 300, { r: 240, g: 240, b: 240 }));
  assert.equal(await isUnchanged(a, b), true);
  assert.equal(await isUnchanged(a, await toWebp(await png(400, 300, { r: 30, g: 90, b: 200 }))), false);
  assert.equal(await diffRatio(a, await toWebp(await png(401, 300, { r: 240, g: 240, b: 240 }))), 1);
});
