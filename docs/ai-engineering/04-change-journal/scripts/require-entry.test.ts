/** node --test scripts/changes/require-entry.test.ts */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { isProductFile, judge, parseNameStatus, type ChangedFile } from './require-entry.ts';

const pr = (extra: Partial<{ title: string; body: string; labels: string[] }> = {}) => ({ title: 'feat: x', body: '', labels: [], ...extra });
const M = (path: string): ChangedFile => ({ status: 'M', path });
const A = (path: string): ChangedFile => ({ status: 'A', path });

test('product files are client/src and server/src outside tests and Markdown', () => {
  assert.equal(isProductFile('client/src/pages/admin/AdminHistoryPage.tsx'), true);
  assert.equal(isProductFile('server/src/releases/releases.service.ts'), true);
  assert.equal(isProductFile('server/src/releases/releases.service.spec.ts'), false);
  assert.equal(isProductFile('client/src/pages/admin/AdminHistoryPage.test.tsx'), false);
  assert.equal(isProductFile('server/src/library/library.fixture.ts'), false);
  assert.equal(isProductFile('server/src/README.md'), false);
  assert.equal(isProductFile('server/prisma/schema.prisma'), false);
  assert.equal(isProductFile('docs/x.ts'), false);
});

test('a product change without a new entry fails', () => {
  assert.equal(judge([M('server/src/a.ts')], pr()).ok, false);
  // Editing an existing entry, the README or the template is not a new entry.
  assert.equal(judge([M('server/src/a.ts'), M('changes/2026-10-12-x.md'), A('changes/_template.md'), A('changes/README.md')], pr()).ok, false);
});

test('a new entry, the label, the description line or a refactor title passes', () => {
  assert.equal(judge([M('server/src/a.ts'), A('changes/2026-10-18-history.md')], pr()).ok, true);
  assert.equal(judge([M('server/src/a.ts')], pr({ labels: ['no-changelog'] })).ok, true);
  assert.equal(judge([M('server/src/a.ts')], pr({ body: 'Fixes a typo.\n\nChangelog: none\n' })).ok, true);
  assert.equal(judge([M('server/src/a.ts')], pr({ title: 'refactor(server): split releases.service' })).ok, true);
  assert.equal(judge([M('server/src/a.ts')], pr({ title: 'Refactor the thing' })).ok, false);
});

test('tests, docs and deletions alone need no entry', () => {
  assert.equal(judge([M('server/src/a.spec.ts'), M('docs/x.md'), { status: 'D', path: 'client/src/old.ts' }], pr()).ok, true);
});

test('name-status parsing takes the new path of a rename', () => {
  assert.deepEqual(parseNameStatus('M\tserver/src/a.ts\nR087\tclient/src/old.tsx\tclient/src/new.tsx\n'), [
    { status: 'M', path: 'server/src/a.ts' },
    { status: 'R087', path: 'client/src/new.tsx' },
  ]);
});
