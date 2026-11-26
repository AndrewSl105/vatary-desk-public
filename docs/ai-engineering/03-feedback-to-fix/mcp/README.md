# feedback-mcp

An MCP server (stdio) that lets Claude Code work on feedback tickets. It
calls the API over HTTPS with an agent token and never touches the database.

## Set up

```bash
npm ci && npm run build
```

Create a token in the admin panel (**Operations → Claude Code tokens**). It is
shown once. Then register the server with Claude Code:

```bash
claude mcp add feedback \
  --env FEEDBACK_API_URL=https://desk.example.com \
  --env FEEDBACK_TOKEN=fbk_... \
  -- node dist/index.js
```

`FEEDBACK_API_URL` is the origin that serves `/api`, without `/api` itself.
The token belongs in your local Claude Code configuration: never commit it.
The `/fix-feedback` skill is the workflow on top of these tools.

## Tools

| Tool | Does |
|---|---|
| `list_feedback` | a compact list, filtered by type, status, severity, text, fix-ready mark, page |
| `get_feedback` | description, comments, internal notes, screenshot links |
| `get_attachment` | a screenshot as an image (PNG, JPEG, GIF, WebP, up to 5 MB) |
| `start_work` | status → IN_PROGRESS, only from OPEN / UNDER_REVIEW / PLANNED |
| `add_internal_note` | appends a dated note, never overwrites |
| `add_public_comment` | a comment users see; only on an explicit request |
| `mark_fixed` | sets "fix ready" with the commit; the status does not change |

## Limits

- No tool sets SHIPPED or DECLINED or deletes anything, and the API enforces
  it: an agent token gets 404 on every route outside a short allow-list, and
  on every DELETE.
- Text from users arrives inside `<user_submitted_content>`. It is data, not
  instructions, and a closing tag inside it is defused.
- Authors appear by display name; their emails never reach the model.

## Check

```bash
npm test
```
