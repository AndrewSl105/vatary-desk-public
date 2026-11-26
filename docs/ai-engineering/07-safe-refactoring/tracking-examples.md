# Tracking files: the format

Two files carry the programme's state between sessions. The entries below show the format; their
content is illustrative.

## PROGRESS.md

```markdown
## Phase 2 — Frontend   (status: in-progress)
- [x] Characterization tests for the dashboard's layout reducer — commit 3f1c2ab — coverage 41% → 88%
- [x] Extract useDashboardLayout from DashboardView.tsx — commit 9be04d1 — 3 120 → 2 740 lines
- [x] Move the tile context menu into its own component — commit 52aa7e0 — 2 740 → 2 410 lines
- [ ] Split the selection model into selection.logic.ts + useSelection
### Deviations / decisions
- WidgetTile.tsx stays at 320 lines: one coherent job, splitting it would only scatter it.
### Problems found (see FOUND_BUGS.md)
- Hooks after a conditional return in the rail component (pinned, not fixed).
### Phase metrics: files > 500 lines: 65 → 61; client coverage: 58% → 61%
```

## FOUND_BUGS.md

A bug found during a refactor is recorded, pinned by a characterization test, and fixed later in
its own `fix:` commit, never inside a refactor commit.

```markdown
Line format: `- [ ] <package>/<file>:<line> — <what is wrong> — <how to reproduce> — found in Phase N`

- [ ] server/src/journal/journal.controller.ts:47 — the date path parameter is never validated,
  so an invalid date reaches the database layer as a 500 instead of a 400 — `GET /api/journal/entries/not-a-date`
  — pinned in journal.controller.spec.ts — found in Phase 2
- [x] client/src/features/widgets/preview.ts:33 — the sanitizer skipped the root element of a
  fragment — repro pinned in preview.test.ts — found in Phase 2 — FIXED in its own `fix:` commit with the test flipped
```
