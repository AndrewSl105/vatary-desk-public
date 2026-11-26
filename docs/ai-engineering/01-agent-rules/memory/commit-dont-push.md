---
name: commit-dont-push
description: On the integration branch, commit only; never push unless the user asks for that push
metadata:
  type: feedback
---

On the integration branch, commit locally and do NOT `git push`; the owner pushes, because a push deploys an environment.

**Why:** the owner asked for it after several agent pushes landed mid-way through a larger programme of work.

**How to apply:** finish each block with a commit (the green set plus a change entry) and mention unpushed commits in the report. Push only on an explicit request for that push; ask when unclear. Related: [[shared-tree-no-stash]].
