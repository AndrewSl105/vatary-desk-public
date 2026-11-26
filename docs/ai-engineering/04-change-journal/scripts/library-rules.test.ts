/** node --test scripts/changes/library-rules.test.ts */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { coversWarnings, featureEntriesWithoutArticles, globToRegExp, hasLibraryNone, readFrontmatter } from './library-rules.ts';

const entry = (fm: string) => ({ path: 'changes/2026-10-18-x.md', content: `---\nid: 2026-10-18-x\n${fm}\n---\n## uk\nТекст.\n## en\nText.\n` });
const articleFile = (locale: string, covers: string) => ({
  path: `library/articles/pages/ai-edit-part.${locale}.md`,
  content: `---\nid: pages.ai-edit-part\nsection: pages\norder: 30\ntitle: T\nsummary: S\ncovers:${covers}\naudience: user\nupdated: 2026-10-12\n---\nBody.\n`,
});

test('frontmatter: scalars, flow lists, block lists, comments', () => {
  const fm = readFrontmatter('---\ntype: feature   # a comment\narticles: [a.b, "c"]\ncovers:\n  - server/src/x/**\n  - client/src/y.tsx\nempty: []\n---\nbody');
  assert.deepEqual(fm, { type: 'feature', articles: ['a.b', 'c'], covers: ['server/src/x/**', 'client/src/y.tsx'], empty: [] });
});

test('a nested `shot:` block never leaks into the top-level fields the gate reads', () => {
  const shot = 'shot:\n  route: /n/x\n  steps:\n    - wait: { testid: page-editor }\n  area: viewport';
  for (const fm of [`type: feature\naudience: user\narticles: []\n${shot}`, `${shot}\ntype: feature\naudience: user\narticles:\n  - pages.a`]) {
    const parsed = readFrontmatter(entry(fm).content);
    assert.equal(parsed.type, 'feature');
    assert.equal(parsed.audience, 'user');
    assert.equal(parsed.route, undefined);
  }
  assert.deepEqual(readFrontmatter(entry(`articles:\n  - pages.a\n${shot}`).content).articles, ['pages.a']);
  assert.equal(featureEntriesWithoutArticles([entry(`type: feature\naudience: user\narticles: [pages.a]\n${shot}`)], '').length, 0);
});

test('a new user/admin feature naming no article fails, unless the PR says why', () => {
  assert.equal(featureEntriesWithoutArticles([entry('type: feature\naudience: user\narticles: []')], '').length, 1);
  assert.equal(featureEntriesWithoutArticles([entry('type: feature\naudience: admin\narticles: []')], '').length, 1);
  assert.equal(featureEntriesWithoutArticles([entry('type: feature\naudience: user\narticles: [pages.ai-edit-part]')], '').length, 0);
  assert.equal(featureEntriesWithoutArticles([entry('type: fix\naudience: user\narticles: []')], '').length, 0);
  assert.equal(featureEntriesWithoutArticles([entry('type: feature\naudience: internal\narticles: []')], '').length, 0);
  assert.equal(featureEntriesWithoutArticles([entry('type: feature\naudience: user\narticles: []')], 'Adds X.\n\nLibrary: none — admin-only toggle, described in the release\n').length, 0);
});

test('"Library: none" needs a reason', () => {
  assert.equal(hasLibraryNone('Library: none — the label only moved'), true);
  assert.equal(hasLibraryNone('library: none - typo'), true);
  assert.equal(hasLibraryNone('Library: none'), false);
  assert.equal(hasLibraryNone('Library: none —  '), false);
});

test('globs', () => {
  assert.equal(globToRegExp('server/src/ai/pageEditPart/**').test('server/src/ai/pageEditPart/a/b.ts'), true);
  assert.equal(globToRegExp('server/src/ai/**/*.ts').test('server/src/ai/x.ts'), true);
  assert.equal(globToRegExp('client/src/*.tsx').test('client/src/a/b.tsx'), false);
  assert.equal(globToRegExp('server/src/ai/pageEditPart').test('server/src/ai/pageEditPart/x.ts'), true);
  assert.equal(globToRegExp('server/src/ai/page').test('server/src/ai/pageEditPart/x.ts'), false);
});

test('an article covering changed code, itself unchanged, is a warning', () => {
  const files = [articleFile('uk', '\n  - server/src/ai/pageEditPart/**'), articleFile('en', '\n  - server/src/ai/pageEditPart/**')];
  assert.deepEqual(coversWarnings(files, ['server/src/ai/pageEditPart/run.ts', 'client/src/x.ts']), [
    { article: 'pages.ai-edit-part', files: ['server/src/ai/pageEditPart/run.ts'] },
  ]);
  // Either locale changed → reviewed.
  assert.deepEqual(coversWarnings(files, ['server/src/ai/pageEditPart/run.ts', 'library/articles/pages/ai-edit-part.en.md']), []);
  assert.deepEqual(coversWarnings(files, ['client/src/x.ts']), []);
  assert.deepEqual(coversWarnings([articleFile('uk', ' []')], ['server/src/ai/pageEditPart/run.ts']), []);
});
