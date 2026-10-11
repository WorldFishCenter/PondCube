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
Tailwind v4 · Drizzle ORM · Neon serverless Postgres · zod · react-hook-form.
Hosted on Vercel (functions pinned to Singapore). Node 20+.

## Commands

| Command                                       | Does                                                                                                                            |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `npm run dev` / `build` / `start`             | Next.js                                                                                                                         |
| `npm run format` / `format:check`             | Prettier: rewrite / verify formatting (skips `components/ui`)                                                                   |
| `npm run lint` / `typecheck`                  | ESLint / `tsc --noEmit`                                                                                                         |
| `npm run check`                               | Self-checks: validation ranges, draft lifecycle, record intake, Airtable sync — against in-memory Postgres (PGLite, no network) |
| `npm run db:push`                             | Apply the Drizzle schema to the branch in `DATABASE_URL`                                                                        |
| `npm run db:sync`                             | Check, then copy ponds + operators from Airtable into `DATABASE_URL` (all-or-nothing); `-- --prod` → `DATABASE_URL_PROD`        |
| `npm run db:sync-ponds` / `db:sync-operators` | Same, one table only                                                                                                            |

Run `npm run check`, `npm run typecheck` and `npm run format:check` before committing.

## Project layout

```
app/page.tsx              Access check per request (Suspense), then cached ponds + operators
app/layout.tsx            Inter font (shadcn preset), viewport, ThemeProvider (light/dark/system)
app/globals.css           shadcn theme tokens (incl. --logo-outline) + 44px touch-target rule
app/icon.svg              Favicon (outline follows OS theme); apple-icon.png = iOS home screen
components/ui/*            Stock shadcn components (Base UI). Do NOT edit by hand.
components/theme-provider.tsx, theme-toggle.tsx   shadcn dark mode (next-themes); one-tap light↔dark switch
components/pondcube-logo.tsx   Logo mark for in-app use (same artwork as app/icon.svg)
components/collection/*    App UI: shell (who/where/when panel, record kinds → tabs), unlock card, pond picker,
                          the 4 forms; record-form.tsx = shared form hook (draft, save) + fields
lib/schema.ts             Drizzle tables — the single source of truth for the data model
lib/validation.ts         zod: form side (device) + save side (server); RANGES; recorded-at rules
lib/intake.ts             Record intake: validate + store a record of any kind, all-or-nothing
lib/data.ts               Server-only cached reads (ponds, operators)
lib/actions.ts            Server actions: unlock + saveRecord(kind, input)
lib/access.ts             Shared site-code check (httpOnly cookie, server-only)
lib/draft.ts              Drafts per record kind + pond; remembered operator/pond (storage injected)
lib/db.ts                 Neon HTTP + Drizzle client (server-only)
lib/options.ts            Choice lists (periods, feed types, causes)
scripts/sync-airtable.ts  Airtable (PondCube base: ponds, operators) → Neon assets/operators
scripts/check-*.ts        The self-checks run by `npm run check`
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
- **shadcn/ui components are generated, not authored.** Everything in
  `components/ui/*` comes from the shadcn CLI. Update them with
  `npx shadcn@latest add <component>`; never hand-edit. This Next.js version has
  breaking changes vs. training data — check `node_modules/next/dist/docs/` before
  writing Next.js code (see @AGENTS.md).
- **Validation is defined once and enforced twice.** `RANGES` and the zod schemas
  in `lib/validation.ts` are the only place bounds live. The form schema runs on
  the device for instant feedback; the save schema re-runs in the server action
  before intake. The database never receives an out-of-range value silently. Add a
  bound by editing `RANGES`/the schema, not the UI.
- **Record intake is all-or-nothing.** A record is stored whole or not at all — a
  Sampling event never persists without its Fish measurements. Keep new write paths
  going through `lib/intake.ts`.
- **Drafts must survive interruption.** Each form autosaves to `localStorage` per
  record kind and pond; a refresh, lost signal or pond switch must not lose a
  half-entered record. Drafts clear only on successful save. Don't add a code path
  that can drop an unsaved draft.
- **Recorded-at is an instant, not a wall-clock string.** The device reads local
  time; the server accepts only a Date or an ISO string with an offset/Z, so an
  observation's true instant is preserved regardless of server timezone.
- **Server-only boundaries.** `lib/db.ts`, `lib/data.ts`, `lib/access.ts` and the
  server actions are server-only. Never import them into client components or leak
  `DATABASE_URL`/`ACCESS_CODE` to the client.
- **Everything keys on `pond_code`.** It's the join across assets, every event
  table, legacy history, and (later) sensor data.

## Data & infrastructure (summary)

One Neon Postgres database in Singapore holds all records. Two branches:
`main` = production, `dev` = development (same schema, isolated data); the app just
reads `DATABASE_URL`. Airtable is the human editing surface for the pond list and is
synced one-way into Neon (`npm run db:sync`) — don't treat Neon as the pond editor.
Operators are edited there too (`active` unticked = hidden from the pick-list).
Sensor (Mandible) data will land in the same database later, joined on
`pond_code` + timestamp. Full detail and setup/deploy steps: `docs/architecture.md`.
