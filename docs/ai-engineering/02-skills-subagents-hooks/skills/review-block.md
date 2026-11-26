---
description: Fresh-eyes behaviour review of a refactor commit range via the refactor-reviewer agent
argument-hint: <range, e.g. abc123..HEAD>
---
Spawn the `refactor-reviewer` agent with the range `$ARGUMENTS` (default `origin/dev..HEAD`, or the last phase-block start noted in PROGRESS.md). Paste its verdict block verbatim, then append the verdict line to the current block's entry in `docs/refactor/PROGRESS.md` ("reviewer: NEUTRAL" / "NOT NEUTRAL: …"). If NOT NEUTRAL, stop and show the findings — do not commit anything.
