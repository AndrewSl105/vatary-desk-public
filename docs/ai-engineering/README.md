# AI-assisted engineering

How Vatary Desk is built with AI agents. Each folder holds the real (sanitized) files.

| | What | Highlight |
|---|---|---|
| 01 | [Agent rules](01-agent-rules/) | One rule book for Claude Code and Codex, ADRs, persistent memory |
| 02 | [Skills & hooks](02-skills-subagents-hooks/) | One-command workflows, review subagents, guardrail hooks |
| 03 | [Feedback → fix](03-feedback-to-fix/) | User bug report → agent fixes it → a human ships it |
| 04 | [Change journal](04-change-journal/) | Every change logged in the same commit, enforced by CI |
| 05 | [Releases](05-releases-from-history/) | Changes become release slides or a changelog in one click |
| 06 | [Living docs](06-library-docs/) | Help articles tied to code, screenshots retaken by script |
| 07 | [Safe refactoring](07-safe-refactoring/) | Tests first, a ratchet that never lets debt grow |
| 08 | [AI quality loop](08-ai-quality-loop/) | Real AI runs captured, rated, turned into prompt fixes |
