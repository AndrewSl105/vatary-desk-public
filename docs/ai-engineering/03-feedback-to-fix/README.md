# Feedback → fix

A user reports a bug → Claude Code picks it up via MCP → fixes it, tests it, commits it → marks it ready → a human ships it.

**Safety**
- Only a person can ship or decline.
- Agent tokens: hashed, scoped, revocable, owner must be a super-admin.
- User text is data, never instructions.

**Files:** `skill/` the command · `mcp/` the MCP server · `server/` token auth and ticket actions, with tests.
