---
description: Where the refactor programme stands — open phase in PROGRESS.md and the ratchet counters
---
1. Print the first `## Phase … (status: in-progress` or `planned` section of `docs/refactor/PROGRESS.md` (heading + unchecked items only).
2. Run `node scripts/refactor/ratchet.mjs --report` and show the table.
3. `git status --short | head` and `git log --oneline -5`.
4. One line: what the next block is, per the phase file it points to. No other commentary.
