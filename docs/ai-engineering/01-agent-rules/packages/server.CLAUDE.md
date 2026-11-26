# server/ — the API (NestJS + Prisma on Postgres/pgvector)

Read the root `CLAUDE.md` first; this file holds only what is server-local.

## Green before every commit (run FROM this directory)
```bash
npm run build                          # nest build (specs excluded)
npx jest --silent                      # the unit suite; one file: npx jest src/x/y.spec.ts
npx eslint "{src,test}/**/*.ts" --rule 'prettier/prettier: off'   # real errors only; the count must not grow
npm run arch:check                     # module-boundary ratchet
node ../scripts/refactor/ratchet.mjs   # files>500, `: any`, eslint-disable, eslint errors
npm run test:int                       # only when a raw SQL call site changed (a disposable Postgres)
```
`npm run lint` uses `--fix` and the prettier rule: never run it in this repo.

## Layout
- One Nest module per directory under `src/`; `src/ai/` is the largest bounded context.
- `src/contracts/` is shared with the client at run time (`@contracts/*`): pure, free of Nest imports.
- `src/prisma/raw-sql.ts` — the `sql` tag; an architecture map says which module owns which Prisma model.
- Cron jobs: `@Cron` on services plus database leases; job names and their on/off flags are frozen contracts.

## Where logic goes
- `<name>.service.ts` orchestrates I/O; pure decisions live in `<name>.logic.ts` next to it, tested without ORM mocks.
- Targets: service ≤ 400 lines, ≤ 7 constructor dependencies. A large service gets a test-module factory before anything is extracted.
- Keep `@Cron` methods on the class that owns them; they delegate.

## Things that bite here
- **Raw SQL is proven against a real Postgres, never by unit specs.** A new raw call site ships with its row in the integration suite — the call-site count fails otherwise.
- A migration is applied BEFORE the server that needs it; `migrate deploy`, not `migrate dev`.
- No model-provider SDKs here: a spec fails the build if one comes back.
- Never read or print `.env*`; `.env.example` is the contract the startup check tests — a new env var is added there in the same commit.
- `PROCESS_ROLE` gates the cron scheduler and the realtime websocket; a new `@Cron` still needs its on/off flag and its startup-check row.
- Zod strips undeclared keys; `.default()` on a nested schema never fires for absent parents.
