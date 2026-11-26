jest.mock('../prisma/prisma.service', () => ({ PrismaService: class {} }));
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import type { JournalEntry } from '../library/journal.logic';
import { AttachReleaseChangesSchema } from './dto';
import { listedChanges, markdownToCaption, planAttach, seedSlide, snapshotOf } from './releaseChanges.logic';
import { ReleaseChangesService } from './releaseChanges.service';

const entry = (id: string, extra: Partial<JournalEntry> = {}): JournalEntry => ({
  id,
  date: id.slice(0, 10),
  type: 'feature',
  audience: 'user',
  areas: ['pages'],
  articles: [],
  pr: null,
  title: { uk: `${id} uk`, en: `${id} en` },
  body: { uk: 'Тіло **жирне**.', en: 'Body with [[pages.intro|a link]].' },
  releasable: true,
  ...extra,
});

describe('releaseChanges.logic', () => {
  it('turns entry Markdown into a plain-text caption', () => {
    expect(markdownToCaption('Press {{kbd:mod+k}} and **save** — see [[pages.intro|the guide]] or [docs](https://x).\n\n\n\nNext `code`.')).toBe(
      'Press mod+k and save — see the guide or docs.\n\nNext code.',
    );
    expect(markdownToCaption('snake_case stays, *this* goes')).toBe('snake_case stays, this goes');
  });

  it('seeds a text slide with both locales and no media', () => {
    expect(seedSlide(entry('2026-10-12-a'))).toEqual({
      mediaType: 'image',
      layout: 'below',
      fileId: null,
      titleUk: '2026-10-12-a uk',
      titleEn: '2026-10-12-a en',
      bodyUk: 'Тіло жирне.',
      bodyEn: 'Body with a link.',
    });
  });

  it('refuses unknown ids and anything not meant for users, and skips the already linked', () => {
    const known = new Map([
      ['a', entry('2026-10-12-a', { id: 'a' })],
      ['i', entry('2026-10-12-i', { id: 'i', audience: 'internal', releasable: false })],
    ]);
    expect(planAttach(['a', 'x'], known, new Set()).problem).toEqual({ kind: 'unknown', ids: ['x'] });
    expect(planAttach(['a', 'i'], known, new Set()).problem).toEqual({ kind: 'not-public', ids: ['i'] });
    const ok = planAttach(['a', 'a'], known, new Set(['a']));
    expect(ok).toEqual({ problem: null, toLink: [], skipped: ['a'] });
  });

  it('the body defaults to seeding slides', () => {
    expect(AttachReleaseChangesSchema.parse({ changeIds: ['a'] }).slides).toBe('entries');
    expect(AttachReleaseChangesSchema.parse({ changeIds: ['a'] }).placement).toBe('slide');
    expect(() => AttachReleaseChangesSchema.parse({ changeIds: ['a'], placement: 'modal' })).toThrow();
    expect(() => AttachReleaseChangesSchema.parse({ changeIds: [] })).toThrow();
  });

  it('a published release lists only its `list` entries, rendered, in link order', () => {
    const snap = (id: string, placement: string, extra: Partial<ReturnType<typeof snapshotOf>> = {}) => ({
      changeId: id,
      placement,
      ...snapshotOf(entry(id)),
      ...extra,
    });
    const listed = listedChanges([
      snap('2026-10-12-a', 'slide'),
      snap('2026-10-13-b', 'list', { snapType: 'fix', snapBodyEn: '' }),
      snap('2026-10-14-c', 'list', { snapTitleUk: '', snapTitleEn: '' }),
      snap('2026-10-15-d', 'list', { snapType: 'weird' }),
    ]);
    expect(listed.map((l) => [l.id, l.type])).toEqual([
      ['2026-10-13-b', 'fix'],
      ['2026-10-15-d', 'improvement'],
    ]);
    expect(listed[0].title).toEqual({ uk: '2026-10-13-b uk', en: '2026-10-13-b en' });
    expect(listed[0].bodyHtml.uk).toContain('<strong>жирне</strong>');
    expect(listed[0].bodyHtml.en).toBe('');
  });
});

describe('ReleaseChangesService', () => {
  const A = entry('2026-10-12-a');
  const B = entry('2026-10-13-b');
  const INTERNAL = entry('2026-10-14-i', { audience: 'internal', type: 'internal', releasable: false });
  const known = new Map([A, B, INTERNAL].map((e) => [e.id, e]));

  let prisma: {
    release: { findUnique: jest.Mock };
    releaseChange: { findMany: jest.Mock; createMany: jest.Mock; deleteMany: jest.Mock };
    releaseSlide: { aggregate: jest.Mock; createMany: jest.Mock };
    $transaction: jest.Mock;
  };
  let history: { enabled: boolean; find: jest.Mock; lookup: jest.Mock };
  let audit: { write: jest.Mock };
  let service: ReleaseChangesService;
  const ctx = { adminId: 'admin-1', ip: '127.0.0.1' };

  beforeEach(() => {
    prisma = {
      release: { findUnique: jest.fn().mockResolvedValue({ id: 'r1', status: 'draft' }) },
      releaseChange: {
        findMany: jest.fn().mockResolvedValue([]),
        createMany: jest.fn().mockReturnValue('links'),
        deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      releaseSlide: {
        aggregate: jest.fn().mockResolvedValue({ _max: { position: 2 }, _count: 3 }),
        createMany: jest.fn().mockReturnValue('slides'),
      },
      $transaction: jest.fn().mockResolvedValue([]),
    };
    const pick = (ids: string[]) => new Map(ids.filter((id) => known.has(id)).map((id) => [id, known.get(id)!]));
    history = { enabled: true, find: jest.fn(pick), lookup: jest.fn(pick) };
    audit = { write: jest.fn().mockResolvedValue(undefined) };
    service = new ReleaseChangesService(prisma as never, history as never, audit as never);
  });

  it('links entries to a draft and appends one slide each after the existing ones', async () => {
    const res = await service.attach('r1', { changeIds: [A.id, B.id], slides: 'entries' }, ctx);
    expect(res.linked).toEqual([A.id, B.id]);
    expect(res.slidesAdded).toBe(2);
    expect(prisma.$transaction).toHaveBeenCalledWith(['links', 'slides']);
    expect(prisma.releaseChange.createMany).toHaveBeenCalledWith({
      data: [
        { releaseId: 'r1', changeId: A.id, position: 0, placement: 'slide', ...snapshotOf(A) },
        { releaseId: 'r1', changeId: B.id, position: 1, placement: 'slide', ...snapshotOf(B) },
      ],
    });
    const [[{ data: slides }]] = prisma.releaseSlide.createMany.mock.calls as [[{ data: { position: number; titleEn: string }[] }]];
    expect(slides.map((s) => [s.position, s.titleEn])).toEqual([
      [3, A.title.en],
      [4, B.title.en],
    ]);
    expect(audit.write).toHaveBeenCalledWith(expect.objectContaining({ action: 'RELEASE_CHANGES_LINKED', targetId: 'r1', adminId: 'admin-1' }));
  });

  it("slides: 'none' only links — the AI writes the slides in the editor", async () => {
    const res = await service.attach('r1', { changeIds: [A.id], slides: 'none' }, ctx);
    expect(res.slidesAdded).toBe(0);
    expect(prisma.$transaction).toHaveBeenCalledWith(['links']);
    expect(prisma.releaseSlide.createMany).not.toHaveBeenCalled();
  });

  it("placement: 'list' links with the entry's text and never seeds a slide", async () => {
    const res = await service.attach('r1', { changeIds: [A.id], slides: 'entries', placement: 'list' }, ctx);
    expect(res.slidesAdded).toBe(0);
    expect(prisma.$transaction).toHaveBeenCalledWith(['links']);
    expect(prisma.releaseSlide.createMany).not.toHaveBeenCalled();
    expect(prisma.releaseSlide.aggregate).not.toHaveBeenCalled();
    expect(prisma.releaseChange.createMany).toHaveBeenCalledWith({
      data: [
        {
          releaseId: 'r1',
          changeId: A.id,
          position: 0,
          placement: 'list',
          snapType: 'feature',
          snapTitleUk: A.title.uk,
          snapTitleEn: A.title.en,
          snapBodyUk: A.body.uk,
          snapBodyEn: A.body.en,
        },
      ],
    });
  });

  it("placement: 'list' is not capped by the slide limit", async () => {
    prisma.releaseSlide.aggregate.mockResolvedValue({ _max: { position: 19 }, _count: 20 });
    const res = await service.attach('r1', { changeIds: [A.id, B.id], slides: 'entries', placement: 'list' }, ctx);
    expect(res.linked).toEqual([A.id, B.id]);
  });

  it('refreshes every snapshot from History before publishing; a vanished entry keeps its own', async () => {
    const update = jest.fn((args: unknown) => args);
    (prisma.releaseChange as unknown as { update: jest.Mock }).update = update;
    prisma.releaseChange.findMany.mockResolvedValue([{ changeId: A.id }, { changeId: '2026-01-01-gone' }]);
    await service.refreshSnapshots('r1');
    expect(update).toHaveBeenCalledTimes(1);
    expect(update).toHaveBeenCalledWith({
      where: { releaseId_changeId: { releaseId: 'r1', changeId: A.id } },
      data: snapshotOf(A),
    });
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
  });

  it('never touches the snapshots of a published release', async () => {
    prisma.release.findUnique.mockResolvedValue({ id: 'r1', status: 'published' });
    await service.refreshSnapshots('r1');
    expect(prisma.releaseChange.findMany).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('only a draft takes entries: a published release is a 409', async () => {
    prisma.release.findUnique.mockResolvedValue({ id: 'r1', status: 'published' });
    await expect(service.attach('r1', { changeIds: [A.id], slides: 'entries' }, ctx)).rejects.toBeInstanceOf(ConflictException);
    await expect(service.detach('r1', A.id, ctx)).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('an unknown release is a 404', async () => {
    prisma.release.findUnique.mockResolvedValue(null);
    await expect(service.attach('nope', { changeIds: [A.id], slides: 'entries' }, ctx)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('an admin entry is never moved into a release — releases are public', async () => {
    const ADMIN = entry('2026-10-15-adm', { audience: 'admin', releasable: false });
    known.set(ADMIN.id, ADMIN);
    await expect(service.attach('r1', { changeIds: [A.id, ADMIN.id], slides: 'entries' }, ctx)).rejects.toThrow(/Only entries for users/);
    known.delete(ADMIN.id);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('an internal entry is never moved into a release', async () => {
    await expect(service.attach('r1', { changeIds: [A.id, INTERNAL.id], slides: 'entries' }, ctx)).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(audit.write).not.toHaveBeenCalled();
  });

  it('History switched off in this environment refuses with 409', async () => {
    history.enabled = false;
    await expect(service.attach('r1', { changeIds: [A.id], slides: 'entries' }, ctx)).rejects.toBeInstanceOf(ConflictException);
  });

  it('an entry linked already gets no second slide', async () => {
    prisma.releaseChange.findMany.mockResolvedValueOnce([{ changeId: A.id, position: 0 }]);
    const res = await service.attach('r1', { changeIds: [A.id], slides: 'entries' }, ctx);
    expect(res).toMatchObject({ linked: [], skipped: [A.id], slidesAdded: 0 });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('respects the 20-slide cap', async () => {
    prisma.releaseSlide.aggregate.mockResolvedValue({ _max: { position: 18 }, _count: 19 });
    await expect(service.attach('r1', { changeIds: [A.id, B.id], slides: 'entries' }, ctx)).rejects.toThrow(/at most 20 slides/);
  });

  it('unlinking is audited and keeps the slide', async () => {
    await service.detach('r1', A.id, ctx);
    expect(prisma.releaseChange.deleteMany).toHaveBeenCalledWith({ where: { releaseId: 'r1', changeId: A.id } });
    expect(audit.write).toHaveBeenCalledWith(expect.objectContaining({ action: 'RELEASE_CHANGE_UNLINKED', payload: { changeId: A.id } }));
    prisma.releaseChange.deleteMany.mockResolvedValue({ count: 0 });
    await expect(service.detach('r1', A.id, ctx)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('lists links with their entry, or null when the entry left this build — History off or not', async () => {
    history.enabled = false;
    history.find.mockReturnValue(new Map());
    prisma.releaseChange.findMany.mockResolvedValue([
      { changeId: A.id, position: 0, createdAt: new Date('2026-10-18T00:00:00Z') },
      { changeId: '2026-01-01-gone', position: 1, createdAt: new Date('2026-10-18T00:00:00Z') },
    ]);
    const links = await service.list('r1');
    expect(links.map((l) => [l.changeId, l.entry?.title.en ?? null])).toEqual([
      [A.id, A.title.en],
      ['2026-01-01-gone', null],
    ]);
  });
});
