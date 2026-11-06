# PondCube Collect — project instructions

Mobile/tablet-first field data collection for WorldFish PondCube (Penang HQ).
Operators record four kinds of observation about aquaculture ponds and the app
writes them to a Neon Postgres database. Replaces the old Kobo/Excel flow.

Read these alongside this file:

- Domain terms (use them exactly): @docs/glossary.md
- Next.js version rules (auto-managed): @AGENTS.md
- Infrastructure, data model, roadmap, setup/deploy: `docs/architecture.md`
- What PondCube is, for people: `README.md`

## Stack

Next.js 16 (App Router) · React 19 · TypeScript · shadcn/ui (Base UI) ·
Tailwind v4 · Drizzle ORM · Neon serverless Postgres · zod · react-hook-form ·
Clerk (one account per Operator).
Hosted on Vercel (functions pinned to Singapore). Node 20+.

## Commands

| Command                                       | Does                                                                                                                                                                                                                                                                                         |
| --------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run dev` / `build` / `start`             | Next.js                                                                                                                                                                                                                                                                                      |
| `npm run format` / `format:check`             | Prettier: rewrite / verify formatting (skips `components/ui`)                                                                                                                                                                                                                                |
| `npm run lint` / `typecheck`                  | ESLint / `tsc --noEmit`                                                                                                                                                                                                                                                                      |
| `npm run check`                               | Self-checks: validation ranges, draft lifecycle, outbox, rounds, record intake, Airtable sync, operator access, legacy import, seeing the data, the .xlsx download — against in-memory Postgres (PGLite, no network); the .xlsx one opens files with openpyxl (python3 with openpyxl, or uv) |
| `npm run db:push`                             | Apply the Drizzle schema to the branch in `DATABASE_URL`                                                                                                                                                                                                                                     |
| `npm run db:sync`                             | Check, then copy sites + species + feeds + ponds + operators from Airtable into `DATABASE_URL` (all-or-nothing); `-- --prod` → `DATABASE_URL_PROD`                                                                                                                                           |
| `npm run db:sync-ponds` / `db:sync-operators` | Same, sites + ponds (with species) or sites + operators only                                                                                                                                                                                                                                 |
| `npm run db:import-legacy -- <csv>`           | One-off: legacy water-quality log (converted CSV) → `wq_readings`, checked, all-or-nothing; `-- --prod` as above                                                                                                                                                                             |

Run `npm run check`, `npm run typecheck` and `npm run format:check` before committing.

## Project layout

```
app/page.tsx              Signed-in operator check per request (Suspense), then cached ponds
app/layout.tsx            Inter font (shadcn preset), viewport, ClerkProvider (shadcn theme), ThemeProvider
app/sign-in               Clerk's sign-in page (sign-in-or-up, no sign-up page); proxy.ts = clerkMiddleware (routes stay public)
app/api/records/route.ts  Where the Outbox sends each Record (POST); Person = signed-in operator
app/api/download/route.ts Water-quality download: one site + month as .xlsx (GET, signed in)
app/api/data/[file]/route.ts   Data link CSVs (wq|feeding|mortality|sampling|ponds .csv?key=…), streamed
app/api/data-link/route.ts     Makes the signed-in account's data link key (POST), replacing the old one
app/globals.css           shadcn theme tokens (incl. --logo-outline) + 44px touch-target rule
app/icon.svg              Favicon (outline follows OS theme); apple-icon.png = iOS home screen
app/manifest.ts           Web app manifest (installable); icons in public/icon-*.png
public/sw.js              Service worker: last page + build files kept so the app opens offline
components/service-worker.tsx   Registers public/sw.js; useKeepForOffline() = keep this page when the worker didn't see it load (first load, sign-in)
components/ui/*            Stock shadcn components (Base UI). Do NOT edit by hand.
components/theme-provider.tsx, theme-toggle.tsx   shadcn dark mode (next-themes); one-tap light↔dark switch
components/pondcube-logo.tsx   Logo mark for in-app use (same artwork as app/icon.svg)
components/install-prompt.tsx  "Install the app" link + drawer (opens itself once, on load, on a first visit in a phone
                          browser): install steps per platform; one-tap Install where the browser offers it. In app/page.tsx
components/steps.tsx      Numbered instructions (install drawer, data sheet)
components/sign-in-card.tsx  Clerk's sign-in, with the app's width and touch size (both sign-in routes)
components/collection/*    App UI: shell (Operator's name, record kinds → tabs, Pond + date above the forms), not-on-list card, pond picker,
                          water-round.tsx = the Water tab, a Round through an Area (one form on the Pond reached, rows below);
                          the 3 other forms, feedback sheet (Airtable form), data sheet ("Your data": download + data link);
                          record-form.tsx = shared form hooks (draft, save) + fields + STATUS, StatusBadge, FILLED_TAB;
                          outbox.tsx = sending to app/api/records + the "waiting to send" notice
lib/schema.ts             Drizzle tables and export views (PROVISIONAL names) — the single source of truth for the data model
lib/export.ts             Seeing the data: readRows (the only site filter on rows people see), data link keys, CSV
lib/workbook.ts           The water-quality .xlsx (write-excel-file, plus table + comment "features")
lib/validation.ts         zod: form side (device) + save side (server); RANGES; recorded-at rules; RECORD_KINDS; withNewNames() reads
                          Drafts and Outbox Records saved before 0.8.0
lib/intake.ts             Record intake: validate + store a record of any kind, all-or-nothing; the caller names the Person
lib/data.ts               Server-only cached reads (operator by email, a site's ponds and feeds)
lib/access.ts             Signed-in access, and a data link key's access: wires Clerk into lib/operators.ts (server-only)
lib/operators.ts          Operator access: account → signed out / not on the list / Operator (with sites); refusal() = pond not at
                          their sites or feed not used there; email normaliser (shared with sync)
lib/storage.ts            Device storage seam (localStorage, guarded): Drafts, Outbox, Round marks, remembered pond and Recorded-at
lib/draft.ts              Draft per record kind + pond: restore, change, submit to the Outbox (only that clears it; storage + keep injected)
lib/outbox.ts             Outbox: saved Records waiting on the device, sent one at a time oldest first, removed only once stored (storage + send injected)
lib/round.ts              A Round on the device: which one it is, how far it got (marks per day + Period), what a tap on Save or Skip comes to, what a Correction keeps (storage + clock + keep injected)
lib/db.ts                 Neon HTTP + Drizzle client (server-only)
lib/options.ts            Choice lists (periods, causes), the Period of a time, Areas in walking order, a pond code's number; feeds come from each site's list in the database
lib/version.ts            App version from package.json (server-only: footer, feedback form)
scripts/sync-airtable.ts  Airtable (PondCube base: sites, species, feeds, ponds, operators) → Neon, same tables
scripts/import-legacy.ts  One-off: legacy Excel log (converted CSV) → wq_readings; its decisions are in the file header
scripts/migrate-0.8.0.sql One-off: production from 0.7.0 to 0.8.0 (DMS v3 renames, values kept); see docs/architecture.md
scripts/migrate-0.10.0.sql One-off: each site's timezone and a changed view, before push (0.9.0 → 0.10.0)
scripts/migrate-0.12.0.sql One-off: a pond's species become a list; area_code, zone optional; before push (0.11.0 → 0.12.0)
scripts/check-*.ts        The self-checks run by `npm run check` (fake-storage.ts: their storage adapters; xlsx-dump.py: openpyxl)
```

## How to work

Adapted from [andrej-karpathy-skills/CLAUDE.md](https://github.com/multica-ai/andrej-karpathy-skills/blob/main/CLAUDE.md).
These favour care over speed; on trivial tasks, use judgment.

- **Think before coding.** Say what you're assuming. If a request can be read more than
  one way, lay out the readings and ask; don't choose one quietly. If something is
  unclear, stop and say what's unclear. If a simpler approach exists, propose it.
- **Keep it simple.** Write the least code that does what was asked. No extra features,
  no abstractions for code used once, no options nobody requested, no handling for cases
  that can't happen. If it could be a quarter of the length, rewrite it.
- **Make surgical changes.** Every changed line should trace back to the request. Don't
  reformat, refactor or "improve" nearby code, and match the existing style. Remove
  imports or helpers your own change made unused; point out other dead code, don't
  delete it.
- **Keep code comments terse.** One short line, only where the reason isn't obvious from
  the code. No paragraphs, no restating what the code does.
- **Work toward a checkable goal.** Turn the task into something you can verify (a failing
  check that then passes; `npm run check` / `typecheck` green before and after) and loop
  until it holds. For multi-step work, state a short plan with a check for each step.

## Conventions — how this codebase works

- **Follow the official shadcn/ui standards for all UI work.** Before building or
  changing UI, read the official docs for what you touch (`npx shadcn@latest docs
<component>`, ui.shadcn.com/docs) and do it the documented way; don't invent patterns.
  This project uses Base UI, so use `render`, never Radix's `asChild`. Styling order:
  built-in variant → `className` with semantic tokens (`bg-primary`, `text-muted-foreground`,
  never raw colours) → a wrapper component. Custom colours are CSS variables in
  `app/globals.css` (`:root` + `.dark`, registered in `@theme inline`). Theming is shadcn's
  next-themes setup; never hard-code light/dark colours.
- **Every user-visible change goes in `CHANGELOG.md`** under a new version (semantic
  versioning: fix → patch, feature → minor, breaking → major), then
  `npm version <patch|minor|major> --no-git-tag-version` so `package.json` matches; the
  app footer shows that version. Entries are short and written for non-technical readers:
  what changed, improved or got fixed, in plain words. No code, file or library names.
  Pushing to `main` with a new top version publishes a GitHub release (tag `vX.Y.Z`, notes =
  that section) via `.github/workflows/release.yaml`; it fails if `package.json` disagrees.
- **One look for one meaning, in every section.** A Record's state has one word, icon and colour (`STATUS` in
  `record-form.tsx`); Badge variants mean only that (context badges are `outline`). Units go in the field's label, in
  brackets. An optional field says "Optional." under it, a required one says nothing. Free text is always "Remarks".
  Every tap target is 44px, set once in `app/globals.css`; text reaches 4.5:1 in both themes. Fix a miss there, in
  the shared component or in a token, not at one call site.
- **shadcn/ui components are generated, not authored.** Everything in
  `components/ui/*` comes from the shadcn CLI. Update them with
  `npx shadcn@latest add <component>`; never hand-edit. This Next.js version has
  breaking changes vs. training data — check `node_modules/next/dist/docs/` before
  writing Next.js code (see @AGENTS.md).
- **Validation is defined once and enforced twice.** `RANGES` and the zod schemas
  in `lib/validation.ts` are the only place bounds live. The form schema runs on
  the device for instant feedback; the save schema re-runs in `app/api/records`
  before intake. The database never receives an out-of-range value silently. Add a
  bound by editing `RANGES`/the schema, not the UI.
- **Number fields are text with a number keypad, never `type="number"`.** Browsers read that differently per device and
  region. `toNumber` (`lib/validation.ts`) reads what's typed, the same everywhere; only where a field allows 1000 or more is `1,500` refused as ambiguous.
- **Record intake is all-or-nothing.** A record is stored whole or not at all — a
  Sampling event never persists without its Fish measurements. Keep new write paths
  going through `lib/intake.ts`. Every Record carries an id made on the device;
  intake skips one already stored, so a resend never duplicates it.
- **Drafts must survive interruption.** Each form autosaves to `localStorage` per
  record kind and pond; a refresh, lost signal or pond switch must not lose a
  half-entered record. A Draft clears only once its Record is in the Outbox, and the
  Outbox drops a Record only once the server has stored it. Don't add a code path
  that can drop either.
- **A Round's progress says how far the Operator got.** Its marks (`lib/round.ts`) never decide whether a
  Record is saved or sent: each reading goes through its Draft and the Outbox like any Record. The one thing read from them
  for a save is what a Correction replaces and keeps. A Round's rules live in `createRound`, checked through the same taps
  the Operator makes; `water-round.tsx` keeps only focus, scroll and rendering.
- **Recorded-at is an instant, not a wall-clock string.** The device reads local
  time; the server accepts only a Date or an ISO string with an offset/Z, so an
  observation's true instant is preserved regardless of server timezone.
- **Server-only boundaries.** `lib/db.ts`, `lib/data.ts`, `lib/access.ts` and
  `app/api/*` are server-only. Never import them into client components or leak
  `DATABASE_URL`/`CLERK_SECRET_KEY` to the client.
- **Rows people see are filtered by site in one place.** Every download or data link reads through
  `readRows` (`lib/export.ts`) with the Operator's sites from `accessFor` on that request. Don't add another
  read of Records for people, or another site filter. A changed export view needs `DROP VIEW` before
  `db:push` (push skips changed views). `export_wq` leaves out readings a Correction of the same pond replaces
  (`wq_readings.replaces`); nothing is ever deleted for a correction.
- **Everything keys on `pond_code`.** It's the join across the pond table, every event
  table, legacy history, and (later) sensor data.

## Data & infrastructure (summary)

One Neon Postgres database in Singapore holds all records. Two branches:
`production` and `dev` (same schema, isolated data); the app just
reads `DATABASE_URL`. Airtable is the human editing surface for the pond list and is
synced one-way into Neon (`npm run db:sync`) — don't treat Neon as the pond editor.
Operators are edited there too, with the `email` they sign in with (`active` unticked
= can't sign in).
Sensor (Mandible) data will land in the same database later, joined on
`pond_code` + timestamp. Full detail and setup/deploy steps: `docs/architecture.md`.
