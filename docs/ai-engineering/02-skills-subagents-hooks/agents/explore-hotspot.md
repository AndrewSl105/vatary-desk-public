---
name: explore-hotspot
description: Maps ONE large source file before it is refactored — responsibilities, public surface, pure-logic candidates with line ranges, existing tests, and the first seam to test. Read-only. Use before cutting any file in docs/refactor/data/*-hotspots.txt.
tools: Read, Grep, Glob, Bash
model: inherit
---

Input: one file path (client/server TypeScript, Go, or Python). Never read the
whole file at once — build a map first:

```bash
grep -n "^export \|^function \|^const .* = (\|^  [a-zA-Z]*(.*) {\|^func \|^type \|^def \|^class \|@Cron\|@Get\|@Post\|useState\|useEffect" <file>
```
then read only the ranges you need.

Report, concisely:
1. **Responsibilities** — 3–8 bullets, each with the line range that implements it.
2. **Public surface** — exported symbols; for a React component its props type; for a Nest service its public methods and constructor dependency count; for Go its exported funcs/types; for Python its module-level defs and routes.
3. **Pure-logic candidates** — functions (or inline blocks) with no I/O, no DOM, no Prisma/react-query, that can move to `<name>.logic.ts` / a sibling module: name, line range, what it depends on.
4. **Existing tests** — files that import this one (`grep -rl "<basename>" --include=*.test.* --include=*.spec.*`), and what they pin.
5. **Frozen contracts inside** — routes, DTOs, cron expressions, env names, gRPC codes, i18n keys the file owns.
6. **First seam** — the one test to write before any cut, and the first extraction, in two sentences.
7. **Risks** — shared mutable state, module-level singletons, ordering-sensitive effects.
