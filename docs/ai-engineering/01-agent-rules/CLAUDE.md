# Vatary Desk — working notes for Claude Code

The shared rules — layout, ADRs, commands, things that bite, the History
rule (a new `changes/*.md` with every notable change) and the Library rule —
live in **`AGENTS.md`**, imported here so Codex and Claude Code read one text:

@AGENTS.md

## Claude Code only

- The fresh-eyes check per refactor block is the `refactor-reviewer` agent
  (`.claude/agents/refactor-reviewer.md`); the `review-block`, `green` and
  `refactor-status` skills wrap it, the green set and `PROGRESS.md`.
- Per-package notes are each package's `CLAUDE.md` (`client/`, `server/`,
  `ai-runtime/`, `workflow-runtime/`, `docsvc/`).
