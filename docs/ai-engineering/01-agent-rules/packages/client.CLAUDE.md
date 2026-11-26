# client/ — the web app (React + TypeScript + Vite + MUI)

Read the root `CLAUDE.md` first; this file holds only what is client-local.

## Green before every commit (run FROM this directory)
```bash
npx tsc -b            # project references resolve only from client/
npm run lint          # eslint — the error COUNT must not grow (ratchet)
npx vitest run        # the unit suite; one file: npx vitest run src/path/x.test.tsx
node ../scripts/refactor/ratchet.mjs   # files>500, `: any`, eslint-disable, import cycles must not grow
```

## Layout
- `src/features/<area>/` — one directory per product area; the widget registry is `features/dashboard/widgetRegistry.ts`.
- `src/pages/` — route components; `src/shared/` — API clients, state, layout, theme, i18n, icons.
- `@contracts/*` → `../server/src/contracts` is a runtime alias (vitest, vite and tsconfig must agree); it is the only code shared with the API.
- Tests sit next to the code as `*.test.ts(x)`; the environment is `node` unless a file opts into jsdom.

## Where logic goes
- A `.tsx` file renders. Anything that can be a pure function or a hook lives beside it: `<Thing>.logic.ts` (pure, tested first) or `use<Thing>.ts` (one responsibility).
- Targets: component ≤ 250 lines and ≤ 5 `useState`; hook ≤ 150 lines. A 320-line file with one coherent job beats three artificial pieces — say so in `PROGRESS.md`.
- Before cutting a file, its public surface has a characterization test.

## Things that bite here
- **Never mix `import()` and a static import of one module** — check `vite build` output in a headless browser.
- Widget config is never parsed by zod `.default()` at read time — read with `?? []`.
- A ref held in memo-derived state disables React Compiler memoization for the whole component.
- MUI: a bare `MenuItem` outside `MenuList` crashes.
- The grid layout mounts tiles one commit late — wait on frames, not on `layout`.
- Never run prettier. All user-facing text goes through i18n (`shared/i18n/locales/{en,uk}.ts` — grep the key, do not read them whole).
