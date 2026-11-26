---
name: shared-tree-no-stash
description: The checkout is shared with other agents' uncommitted work — never stash, reset or checkout to compare; stage only your own hunks
metadata:
  type: feedback
---

The main checkout often holds OTHER agents' uncommitted edits. Never `git stash`, `reset` or `checkout -- .` there, not even to compare lint baselines: lint the committed version with `git show HEAD:<file> | npx eslint --stdin --stdin-filename <file>` instead. When a file mixes their lines and yours, stage only yours (write the index entry from `HEAD` plus your change with `git hash-object -w` and `git update-index --cacheinfo`).

**Why:** another agent's uncommitted work once vanished around a merge; the only surviving copy was a stash left by a lint check.

**How to apply:** before any git operation that touches the working tree, check `git status` for files that are not yours and leave them alone.
