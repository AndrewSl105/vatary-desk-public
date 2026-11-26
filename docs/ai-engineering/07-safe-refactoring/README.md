# Safe refactoring

Refactoring with agents under strict rules: tests first, no behaviour change, every block reviewed.

- `REFACTOR-RULES.md` — the rule book
- `ratchet.mjs` — CI check: tech debt counters can only go down
- `split-file.py` — splits big files without touching logic
