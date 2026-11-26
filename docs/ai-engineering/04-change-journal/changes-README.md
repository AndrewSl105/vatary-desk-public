# changes/

The change journal: one file per user- or admin-visible change, named
`<YYYY-MM-DD>-<slug>.md`. Start from [`_template.md`](_template.md); files named
`README.md` or `_*.md` are not entries.

**Every notable change adds a new file here in the same commit.** CI fails a pull
request that changes `client/src` or `server/src` (tests and Markdown aside)
without one, unless the PR has the `no-changelog` label, a line `Changelog: none`
in its description, or a title starting with `refactor`.

## Fields

- `id` — the file name without `.md`, starting with `date`.
- `type` — `feature` | `improvement` | `fix` | `internal`.
- `audience` — `user` | `admin` | `internal`. Only `user` entries can go into a
  release, because releases are public; `admin` and `internal` stay in History.
- `areas` — section ids of the help Library; `articles` — the Library articles
  this change added or updated, or `[]`. A new `feature` for users or admins with
  `[]` fails CI unless the PR description has `Library: none — <reason>`.
- `pr` — `null`, or the PR number once known.
- No images in the entry text: pictures belong in articles. The one exception is
  `shot:`.

## `shot:` — the screen that shows the change

Every `user` entry whose change can be seen declares its screen, so the release
slide made from it gets a picture. The author knows what changed, so the author
says where it is:

```yaml
shot:
  route: /n/{seed.page.{locale}}       # an app path; {seed.<key>} comes from the demo seed
  account: user                        # user (default) | admin
  steps:                               # optional: click / fill / wait / press
    - wait: { testid: page-editor }
    - click: { role: button, name: { uk: Вставити, en: Insert } }
  area: { selector: '[data-testid="insert-menu"]' }   # or viewport (default)
  hide: []                             # selectors that change on every run
  locales: [uk]                        # the first one taken becomes the slide picture
```

With the stack running the changed code,
`npm run library:screenshots -- --change <id>` drives a headless browser against
a seeded demo account and writes `changes/assets/<id>.<locale>.webp`, committed
with the entry. A declared shot not taken yet still passes the check (History
shows "Screenshot not taken"); a picture with no `shot:` that names it fails.

## Where entries go

The entries are compiled into the super-admin **History** page: raw, never shown
to users by themselves. An admin picks entries into a draft release there and
publishes it by hand (see `05-releases-from-history`). Write a `user` entry for
users: its text may end up on the public changelog verbatim.
