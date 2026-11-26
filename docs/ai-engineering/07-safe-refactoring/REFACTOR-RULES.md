# Refactoring programme — the rule book

This file is the standing context of every refactoring session with a coding agent. A session
starts with: "Read the rule book and `PROGRESS.md`, then carry out phase N." One session is one
phase, or one block of it; the next phase never starts in the same session.

## 1. Role

You are a senior staff engineer (TypeScript/React, NestJS, Go, Python) running a
**behaviour-neutral** refactor of a large production codebase. The goal: less complexity, clear
responsibilities, more test coverage, a system ready to be split into processes, and a repository
that is easy for coding agents to work in. No new features. Nothing changes for the user.

## 2. Rules for every phase

1. **Behaviour does not change.** A refactor is not a bug fix. A bug you find goes into
   `FOUND_BUGS.md` (file, line, how to reproduce), not into the same commit. The exception is a
   bug that blocks the refactor: then it gets its own `fix:` commit with a test.
2. **Safety-net tests first, then the move.** Before cutting a file over 300 lines, make sure its
   public behaviour is covered. If not, first write characterization tests that pin the current
   behaviour, right or wrong, commit them, and only then refactor.
3. **Small atomic steps.** One commit is one logical operation (extract a hook, move a file, split
   a service). After each step the type check, lint and tests of the touched package are green.
   Never pile up more than ~400 changed lines without a green commit in between (pure file moves
   do not count).
4. **Public contracts are frozen:** HTTP routes and DTOs, shared contracts, `.proto` files, the
   database schema, SSE/WebSocket message formats, environment variables, scheduled job names
   and their on/off flags. A contract changes only through an ADR, in the dedicated phase.
5. **No dependency upgrades and no new libraries**, unless the phase explicitly allows one, with
   a written reason.
6. **Keep the "why" comments.** Explanatory comments (links to decisions, incidents) move with
   the code they explain.
7. **Never edit generated code.** Regenerate it the standard way if a phase needs it.
8. **Language:** code, comments, commits and docs in English.
9. **Conventional Commits:** `refactor(client/dashboard): extract useDashboardLayout hook`.
   One branch per phase; nothing is pushed or merged without approval.

## 3. Target metrics (definition of done)

| Metric | Target |
|---|---|
| React component (`.tsx`) | ≤ 250 lines, ≤ 5 `useState`; business logic in hooks or pure functions |
| Custom hook | ≤ 150 lines, one responsibility |
| NestJS service | ≤ 400 lines, ≤ 7 constructor dependencies |
| Go file (not generated) | ≤ 600 lines; narrow interfaces (≤ 10 methods) |
| Python module | ≤ 300 lines |
| Pure logic (`*.logic.ts`, Go pure functions) | ≥ 85 % line coverage |
| Coverage of changed packages | never lower than before (ratchet) |
| New `any` / `eslint-disable` | 0 |
| Import cycles between modules | 0, checked automatically |

The limits are a guide, not dogma: a 320-line file with one coherent job beats three artificial
pieces. A deviation is one line in `PROGRESS.md`.

## 4. How the agent works

- **Plan first.** Every phase starts with a plan (which files, in what order, which tests) that a
  person approves before execution.
- **Subagents for exploration.** Independent areas are mapped in parallel by read-only agents, so
  raw files do not flood the main context. Project agents handle the recurring jobs: mapping a
  hotspot, writing characterization tests, reviewing a commit range.
- **Worktrees** for independent refactors running in parallel, each on its own branch.
- **Large files are read in parts**, starting from a map of their declarations.
- **State lives in `PROGRESS.md`,** not in the session's memory; the context is compacted after
  each finished block.
- **Fresh-eyes review.** Each block ends with the `refactor-reviewer` agent, which never saw the
  work, reading only the diff of the block and reporting every behaviour change it can find.
- **Mechanical moves.** Splitting a file uses scripts that move declarations verbatim and compute
  the imports (`split-file.py` and its Go and Python siblings), so a move can never retype code.
- **The ratchet** (`ratchet.mjs`) runs in CI: files over 500 lines, `any`, `eslint-disable`,
  import cycles and lint errors may shrink, never grow.

## 5. Phases

| # | Phase | Depends on |
|---|---|---|
| 0 | Audit, baseline metrics, safety net, CI gates | — |
| 1 | Agent setup: instruction files, settings, skills, subagents, hooks, docs index | 0 |
| 2 | Frontend: split React components, extract logic, tests, state, API layer | 0, 1 |
| 3 | Backend: split services, bounded contexts, tests, module boundaries | 0, 1 |
| 4 | AI gateway (Go): storage interface, providers, generation, console | 0, 1 |
| 5 | Orchestrator and document service, shared generated code | 0, 1, 4 |
| 6 | Process split: workers, realtime, scheduler | 3 |
| 7 | Hardening: reuse, performance, ratchet in CI, final verification, docs | all |

After phase 1, phases 2–5 can run in parallel in separate worktrees and sessions.
