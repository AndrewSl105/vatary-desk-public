---
description: Run the green-before-commit set for one package — client | server | ai-runtime | workflow-runtime | docsvc | all
argument-hint: <package>
---
Package: $ARGUMENTS (default: the package of the files changed in `git status`).
Run the block from that package's `CLAUDE.md` "Green before every commit", exactly those commands, from the right directory, and report per command: ✓/✗ and the summary line (tests passed/failed, error count). For `all`, run every package's set; Go and docsvc go through `make test-*` at the root. Do not fix anything here — report, then stop.
