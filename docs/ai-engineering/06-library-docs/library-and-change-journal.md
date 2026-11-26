# The Library and the change journal

The Library is the product's user documentation: one article per capability, in Ukrainian and
English. The change journal is one file per user-visible change; an admin picks entries into a
release, and they appear on the public changelog.

**The source of truth is text in the repository.** Agents and admins edit the same files;
nothing writes documentation to a database.

| Path | What |
|---|---|
| `library/sections.yaml` | the section tree: `id`, `order`, `icon`, `title_uk`, `title_en`, optional `parent`, optional `audience: admin` |
| `library/articles/<section>/<slug>.<uk\|en>.md` | one article per locale, with frontmatter |
| `library/assets/<article-id>/*.webp\|png` | images, each at most 500 KB |
| `changes/<YYYY-MM-DD>-<slug>.md` | one journal entry per change, so parallel branches never conflict |

## Build

```bash
npm run library:build              # compile articles and assets into a read-only SQLite file
npm run library:build -- --check   # validate only
```

The compiled database is a **build artifact**: never committed, never migrated. The server image
runs the build, so an image serves exactly the documentation of its commit, and CI runs it on
every change to the sources or the compiler.

The build fails when:
- an article is missing a locale, or its two locale files disagree on `id`, `section`, `order`, `covers`, `related` or `audience`;
- an `id` is duplicated, or a `section` is unknown or not the directory the file sits in;
- a `related` id or a `[[link]]` points to an article that does not exist, or a user article links to an admin-only one;
- an image is missing, is not webp/png, or exceeds the size limit;
- frontmatter has an unknown key (a typo must never fall back to a default silently);
- the body uses a block the renderer does not know (an unknown callout, an `#` title, an image outside `assets/`, a `javascript:` link);
- a change entry has an unknown area, article, type or audience, an `id` that is not its file name, or is missing a title or body in either locale.

## Article

```yaml
---
id: pages.ai-edit-part        # stable and the same in both locales; survives a move between sections
section: pages                # must equal the directory
order: 30
title: Editing part of a page
summary: The AI changes one section and leaves the rest of the document alone.
covers:                        # the code this article describes (globs); CI warns when it changes
  - server/src/ai/pageEditPart/**
related: [pages.ai-panel]
audience: user                 # user (everyone signed in) | admin (super-admins only)
updated: 2026-10-12
---
```

The body is Markdown (`##`–`####` headings, lists, quotes, tables, fenced code, emphasis, links)
plus:
- `:::tip` / `:::info` / `:::warning` blocks closed by `:::`; text after the name is a title;
- `![alt](assets/<article-id>/file.webp)`;
- `[[article-id]]`, `[[article-id#anchor]]`, `[[article-id|label]]`;
- `{{kbd:mod+k}}` (`mod` is Ctrl, or ⌘ on a Mac);
- `## Heading {#anchor}` pins an anchor, so deep links survive a reworded heading.

Raw HTML is shown as text. The renderer emits only the tags it writes itself.

## Change entry

```yaml
---
id: 2026-10-12-page-edit-part   # equals the file name and starts with the date
date: 2026-10-12
type: feature                   # feature | improvement | fix | internal
audience: user                  # user | admin | internal; only user entries can go into a release
areas: [pages]                  # section ids
articles: [pages.ai-edit-part]
pr: null                        # filled by CI
title_uk: ШІ редагує лише вказаний розділ
title_en: AI edits only the section you name
shot:                           # optional: the screen that shows the change, for its release slide
  route: /n/{seed.page.{locale}}
  steps: [{ wait: { role: heading, name: { uk: Ризики, en: Risks } } }]
---
## uk
1–3 sentences on what changed for the user. No file or component names.
## en
…
```

## Screenshots

`npm run library:screenshots` takes every picture the articles use, from a locally running app,
never in CI. It drives a real browser, signs in through the real sign-in form with dedicated test
accounts, and seeds its own demo content first.

```bash
npm run library:screenshots                       # every shot
npm run library:screenshots -- --article <id>     # one article
npm run library:screenshots -- --change <id>      # one change entry's `shot:`
npm run library:screenshots -- --only-missing     # only pictures not on disk yet
npm run library:screenshots -- --force            # write even unchanged pictures
npm run library:check                             # then: the build accepts them
```

- **Manifest** (`shots.yaml`): per shot an `article`, a `name`, an `account` (user | admin), a
  `route`, `steps` (click / fill / wait / press on a test id, a role and name, a text or a CSS
  selector), an `area` (the viewport or a selector), `locales`, and `hide` (selectors blanked
  first, for anything that changes on every run).
- **Output**: `library/assets/<article-id>/<name>.<locale>.webp`, used in the article as
  `![…](assets/<article-id>/<name>.uk.webp)` in the `uk` file and `.en.webp` in the `en` file.
- **Change entries** may declare `shot:` with the same fields. Their pictures are kept apart
  from the public article assets and shown to super-admins only, because a change may show
  something not released yet. A taken change picture is a record of its release and is never
  retaken by a full run.
- **Held still**: a fixed viewport at 2×, light theme, reduced motion with no animation, a
  frozen clock, no caret or cursor, no toasts, avatars hidden, the cookie banner dismissed.
- **No churn**: a new picture that differs from the file on disk by less than 0.2 % of pixels
  is not written.
