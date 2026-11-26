# Vatary Desk — working notes for coding agents

Shared by every agent (Codex reads this file; Claude Code imports it from
`CLAUDE.md`). Agent-specific notes stay in that agent's own file.

One repository, six containers. Read `docs/architecture.md` first; the
decisions behind it are one file each in `docs/adr/`. `docs/INDEX.md` lists
every document. Each package has its own `CLAUDE.md` with the commands that
must be green before a commit and its local traps — read the one for the
directory you are editing.

**Refactor programme:** `docs/refactor/00-MASTER.md` is the rule book
(behaviour-neutral, characterization tests first, atomic commits, contracts
frozen), `PROGRESS.md` the state, `FOUND_BUGS.md` the parking lot.
`node scripts/refactor/ratchet.mjs` must not report a grown counter. Files are
split with mechanical movers that move declarations verbatim and compute
imports; every block ends with a fresh-eyes behaviour review of its commit
range (`.claude/agents/refactor-reviewer.md`).

## History: every notable change writes its entry (changes/)

**Each notable change = a new file `changes/<YYYY-MM-DD>-<slug>.md` in the
same commit**; the format is in `changes/README.md`, start from
`changes/_template.md`; before finishing run `npm run library:check`.
"Notable" = anything a user or an admin could notice (feature, improvement,
fix); write `type: internal` / `audience: internal` for the rest you still
want on record. These entries are the super-admin **History**, raw and never
shown to users by themselves; a release is assembled from them and published
by hand — as slides, or as list entries the public changelog shows verbatim —
so write a `user` entry's text for users. CI fails a PR that changes app code
(tests and Markdown aside) without a new entry, unless the PR is labelled
`no-changelog`, says `Changelog: none`, or its title starts with `refactor`.

**A `user` change people can SEE also declares its screen**: `shot:` in the
entry's frontmatter (route, account, steps, area). You know what you changed,
so you say where it is; the release slide made from the entry gets that
picture. Take it with `npm run library:screenshots -- --change <id>` once the
stack runs your code, and commit the image with the entry.

## The Library moves with the change (library/)

After a notable change, decide whether it touches the **Library**:
- new functionality (`type: feature`, `audience: user|admin`) → a new article,
  or a new section of an existing one;
- a change to the behaviour, names, steps or interface of a function an
  article describes → update the article and re-take its screenshots
  (`npm run library:screenshots -- --article <id>`);
- internal work, a refactor, a small fix with nothing visible → leave the
  Library alone.

List every article you touched in the entry's `articles` field. If no update
is needed, say why in the PR description with a line
`Library: none — <reason>`.

CI enforces it: a new user- or admin-facing `feature` with `articles: []`
fails unless the description has that line; an article whose `covers` match a
changed file, while the article itself is unchanged, is a **warning** naming
the articles to check. `npm run library:check` fails on an unknown `[[id]]`, a
`[[id#anchor]]` with no such heading, a missing or oversized image.

## Layout

| Path | What | Language | Talks to |
|---|---|---|---|
| `client/` | the web app (React + Vite + MUI) | TS | `server` over HTTPS |
| `server/` | the API: auth, orgs, quotas, credits, storage, Postgres | TS (NestJS) | Postgres, object storage, **orchestrator (gRPC)** |
| `workflow-runtime/` | **the orchestrator**: workflow registry, steps, retries, progress, event log | Go | `docsvc`, `ai-runtime` (gRPC) |
| `ai-runtime/` | LLM gateway: prompt registry, providers, cost | Go | LLM providers |
| `docsvc/` | documents: conversion, PDF editing, chunking | Python | object storage via presigned URLs |
| `proto/` | **the only source of truth for every gRPC contract** | protobuf | — |

Rules that make this work (each is an ADR):

1. **The orchestrator calls both** docsvc and ai-runtime; they never call each other.
2. **Bytes never travel in a gRPC payload.** Inputs and outputs are presigned `BlobRef` URLs minted by the API; Go and Python hold no storage credentials.
3. **Fast jobs are synchronous** (client deadline = budget); long ones start and are polled.
4. **Quotas, credits and billing stay in the API.** Every workflow output carries a `usage` block the API records. Provider API keys live only in ai-runtime.
5. **Internal consoles are never public** without their own authentication.
6. **One correlation id** flows end to end: API request → orchestrator job → every AI call → document-service log line.

## Commands

```bash
make up            # the whole stack in Docker
make proto         # regenerate Go + Python gRPC code from proto/ — COMMIT the result
make test          # Go ×2 + pytest, all inside containers (no local toolchains needed)
make e2e           # a real document import through orchestrator → docsvc
```

## Things that bite

- **Editing a `.proto` without `make proto`** fails CI's freshness check. Generated code is committed on purpose so each service builds from its own directory.
- **Retry semantics are encoded in gRPC codes.** Services answer `INVALID_ARGUMENT` / `FAILED_PRECONDITION` / `NOT_FOUND` for "will never work" and `UNAVAILABLE` / `INTERNAL` / `DEADLINE_EXCEEDED` for "try again"; the orchestrator turns the former into a permanent failure.
- **No direct provider calls.** ai-runtime is the only process holding a model API key; a test fails the build if a provider SDK appears in the API.
- **Model kinds are load-bearing**: catalog entries are `chat` / `embedding` / `transcription`, and model selection never crosses kinds.
- **A new page node or mark = bump the page client build.** An editor build that does not know a node deletes it from a shared document, so the realtime gateway refuses builds that are too old.
- **Never mix `import()` and a static import of one module** — the bundler can give it its own chunk that reads an entry binding before it exists. It shows only in production builds.
- **Raw SQL is proven against a real Postgres, never by unit specs.** Unit specs mock the ORM; a raw statement is an exported builder with bound parameters, and every new raw call site ships with its row in the integration suite.
- Never run prettier in this repo. Never read or print `.env*` files.

## Where to look when something fails

1. Any API 5xx: the admin **Errors** page, searched by the request id from the toast.
2. The orchestrator console: the job → its step graph, retries and error text.
3. The AI runtime console, filtered by the same correlation id.
4. The document-service logs for conversion output.
