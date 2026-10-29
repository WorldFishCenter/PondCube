# Architecture, infrastructure & plan

How PondCube Collect is built and where its data lives. This is the reference for
infrastructure and roadmap decisions; day-to-day coding rules are in
`CLAUDE.md`, and domain terms are in `docs/glossary.md`.

## The shape of the system

Operators sign in on a phone or tablet, pick which pond they're at, and record one
of four kinds of observation. Each record is validated on the device, re-validated
on the server, and written whole (or not at all) to a Postgres database. Each
Operator has their own Clerk account; the server names the Person from it.

```
device (phone/tablet)                 server (Vercel, sin1)        data (Neon Postgres, Singapore)
─────────────────────                 ─────────────────────        ──────────────────────────────
sign in, pick pond                    POST /api/records:           pond          (static)
fill a record  ── draft, then ───▶    signed-in operator           operators     (name + email)
  (validated locally)  outbox, in     → re-validate (same zod)      wq_readings
                       localStorage   → record intake (all/none)   feeding_events
                                                        │           mortality_events
                                                        └────────▶  sampling_events + fish_measurements
```

## Data model

Five static dimension tables and five event tables, all keyed on `pond_code`.
Source of truth is `lib/schema.ts` (Drizzle); don't restate columns elsewhere.

- **`site`** — one row per site (WorldFish DMS v3 `SITE`: three-letter `site` code, `name_site`,
  owner, contact, position), mirroring the Airtable `sites` table. Never removed from Neon.
- **`pond`** — one row per Pond. Mirrors the Airtable `ponds` table (see below). Where the
  WorldFish DMS v3 names a field, the column (and the Airtable field) uses that name: `site`,
  `lat_pond`, `long_pond`, `area_pond` (hectares), `note_pond` (see `docs/naming-alignment.md`).
  Carries `legacy_location` + `legacy_tank_id` so converted historical rows map onto today's pond
  codes. Its `site` points to a row of `site`, its `species` to a row of `species`.
- **`feed`** — the DMS feed list (`feed`, three characters; `note_feed`) with the `sites` that use
  it, mirroring the Airtable `feeds` table. A Feeding event's `feed` points to one; the form offers
  the feeds of the chosen pond's site, and the records route refuses any other.
- **`species`** — the DMS species list (`species` two-letter code, `species_latin`, `species_common`),
  mirroring the Airtable `species` table. In Airtable a pond's species is a link to that table; the
  sync turns the link into the code. Never removed from Neon.
- **`operators`** — the people who record, with the email each signs in with and the `sites`
  (one or more codes) whose ponds they see and record. The signed-in operator's name is attached
  to each record as its `person`.
- **`wq_readings`, `feeding_events`, `mortality_events`** — flat event tables.
- **`app_version`** on every record table (fish measurements inherit it from their sampling
  event): the app version that saved it, set on the server by record intake, or `legacy` for the
  imported Excel log. Use it to trace records to the code and rules that accepted them.
- **`sampling_events` + `fish_measurements`** — header/detail: a sampling event owns
  one or more fish measurements (cascade delete). Intake writes them together or
  not at all.

## Infrastructure

### Neon Postgres — the one database

All manual records land here, and sensor data will land in the **same** database
later (see roadmap). Region: **Singapore / ap-southeast-1**, closest to Penang HQ.

Two branches give clean dev/prod separation on identical schema:

| Environment       | Neon branch  | `DATABASE_URL` set in       |
| ----------------- | ------------ | --------------------------- |
| Local dev         | `dev`        | your `.env`                 |
| Vercel Preview    | `dev`        | Vercel "Preview" env var    |
| Vercel Production | `production` | Vercel "Production" env var |

`production` is the default (production) branch; `dev` is a copy-on-write branch with isolated data, so test
records never touch production. Schema is applied per branch with
`npm run db:push`. Always use the **pooled** connection string. A rename goes as explicit
`ALTER … RENAME` SQL on each branch instead (e.g. `scripts/migrate-0.8.0.sql`): push can't tell a rename
from a drop plus an add.

### Airtable — the human editing surface for ponds and operators

The Airtable base **PondCube** is where people add and edit ponds (`ponds` table) and
operators (`operators` table: `name`, `email`, `active`, `notes`) by hand. Neon is the system
of record the app reads and writes. The flow is one-way:
**Airtable → `npm run db:sync` → Neon `site` / `species` / `feed` / `pond` / `operators`** (or
`db:sync-ponds`, which brings species with it, and `db:sync-operators`; sites come with both).
Ponds and operators link to `sites`, ponds to `species`: the sync turns each link into the code,
and stops if a link points nowhere or an active operator has no site. It upserts, so re-run it
after edits. Never edit ponds or operators directly in Neon. Feeds removed from Airtable stay in Neon
for the Records that use them, but are offered nowhere.

- **Checked first, all-or-nothing.** Every Airtable row is checked (required columns,
  numbers, dates, pond code format, duplicates) before anything is written; any problem
  is listed and nothing changes. The write itself is a single all-or-nothing step.
- **Retiring.** A pond removed from Airtable is set to `retired` in Neon (hidden from the
  app, kept for its records); re-adding it makes it active again. To retire an operator,
  untick `active` or remove the row: either way they're deactivated, never deleted, so
  past records keep the name. Renaming an operator works the same way: the old name is
  deactivated, and the new name (with the email) is added.
- **Feedback stays in Airtable.** The `feedback` table collects what operators send from the
  in-app "Send feedback" form (an embedded Airtable form). It is never synced to Neon.
- **Production needs `--prod`.** `npm run db:sync -- --prod` writes to `DATABASE_URL_PROD`;
  without the flag the sync refuses to write if `DATABASE_URL` is the production database.
  It prints the target and what will change before writing.

### Legacy history — the old Excel log

Water-quality readings from before the app (the paper/Excel log, July 2025) are imported once with
`npm run db:import-legacy -- <pondcube_observations_wide.csv>` (then `-- --prod`). The CSV comes from
`convert_pondcube.py` next to the repo, which also documents the source in `pondcube_DATA_DICTIONARY.md`.
Each old tank maps to its Pond through `legacy_location` + `legacy_tank_id`. The log has no times or
names, so morning = 08:00 and afternoon = 14:00 Penang time, and the Person is Mahirah Mahmuddin.
It deliberately bypasses record intake: readings without dissolved oxygen or temperature are kept with
blanks, and two out-of-range temperatures (114.0 and 59.3 °C, Fish Tank 3) are kept as recorded. All
of this is listed in the script's header. Re-running is safe: readings have fixed ids.

### Vercel — hosting

Next.js app deployed on Vercel, functions pinned to `sin1` (Singapore, next to the
database) via `vercel.json`. The optional
[Neon–Vercel integration](https://neon.tech/docs/guides/vercel) can wire branches
to environments automatically, including a DB branch per preview deploy.

### Access

Each Operator signs in with their own Clerk account (app "PondCube"). A device gets
in when the account's verified primary email matches an active operator; that
operator's name becomes the Person of every record saved, whatever the device
sends. Emails are edited in Airtable (`email` column on `operators`) and synced.
Signing in is one flow for everyone (`<SignIn withSignUp />`): an email, then a code
sent to it; a new email gets its account in the same flow. There's no sign-up page and
no password. `withSignUp` is set explicitly so a leftover `NEXT_PUBLIC_CLERK_SIGN_UP_URL`
can't bring a separate sign-up step back. Clerk Dashboard settings, on both instances:

- Email: Sign-up with email on, Verify at sign-up by email code; Sign-in with email by
  email code. Password off.
- No other sign-up fields (first/last name, username, phone, legal consent), else a
  first-time Operator gets an extra "Create your account" form. Names come from Airtable.
- Sessions: an Operator types a new code only when the session ends (Clerk's maximum
  lifetime, 7 days by default, under Sessions); renewing it needs signal and their mailbox.

Anyone can create an account, but one whose email isn't on the list can't record.
Removing or deactivating an operator locks them out within about a minute.

An Operator sees and records only the ponds of their own sites (`sites` on `operators`, from the
`site` links in Airtable); some people have several. The page lists only those ponds, and the
records route refuses a Record for any other pond with a 422, so it shows as "needs attention".

### Installable app (PWA)

`app/manifest.ts` makes the app installable (Add to Home screen) and opens it
full-screen. `public/sw.js`, a hand-written service worker, keeps the last page that
loaded plus its build files on the device, so the app opens with no signal. The kept
page is replaced on every load with signal. The first load, and a sign-in, reach the
signed-in app without a navigation the worker sees, so in those two cases the app asks
the worker to keep its page and build files (`useKeepForOffline`): it opens offline from
the very first sign-in, and a normal open doesn't fetch the page twice. Test it with `next build && next start`, not `next dev`.

In a phone or tablet browser (not the installed app, not a computer),
`components/install-prompt.tsx` shows how to install: a drawer that opens by itself once,
as the first visit loads (never mid-task), and an "Install the app" link that reopens it.
`app/page.tsx` mounts it once, inside the Suspense boundary, so the drawer hydrates with
the page it covers and isn't remounted by a sign-in. It shows steps that work in any browser, starting with
"open it in Safari/Chrome" for a link opened inside another app. Where the browser offers
to install (`beforeinstallprompt`: Chrome/Edge on Android; it never fires once installed),
the steps become a one-tap Install button. Next's PWA guide advises against relying on
that event since it isn't cross-browser; here it's only a shortcut on top of the steps.
Until the drawer has been seen, it also holds back Chrome's own install bar. iPhone/iPad
steps end with signing in from the home screen, as that app doesn't share Safari's
storage: for the same reason the drawer warns about Records waiting in the Outbox.

### Saving without signal (the Outbox)

Save never needs signal. It gives the Record and each of its Fish measurements an id
(made on the device), moves it from its Draft into the Outbox (`lib/outbox.ts`, one
localStorage key per Record) and clears the form. If storage refuses it (full or
blocked), Save sends it straight away instead, and the Draft stays unless that works.
The shell sends what's waiting to `POST /api/records` when the app opens or comes back
to the foreground, when signal returns, after each Save and on "Send now", one Record
at a time, and removes a Record only once the server answers 204. The route is a fixed
URL rather than a server action because an action's id changes with every deploy, and
a device can hold Records across one.

- **Resends are safe.** Intake skips any row whose id is already stored, so a reply
  lost on a weak signal never leads to a duplicate Record or Fish measurement.
- **Who sends it.** Each Record carries the sign-in account that saved it (Clerk user
  id, so renaming the Operator in Airtable doesn't strand it). The device sends only
  that account's Records, and the route refuses any other (401), so nothing is ever
  stored under someone else's name on a shared device.
- **Sign-in.** A 401 gets one retry with a fresh Clerk token. If that fails (signed
  out, a stale page, or Clerk never loaded because the app opened offline), the notice
  asks to tap "Send now", which reloads the page. A 403 (no longer on the operator
  list) asks the Operator to see their supervisor.
- **Refused Records.** A 422 (not valid as sent, e.g. a Range tightened by a deploy
  since the device checked it) or a server error marks that Record "needs attention"
  with the reason, stored with it, and sending carries on with the next. It's retried
  on every send; nothing in the app can edit or discard it yet.
- iPhones and iPads don't run background sync for web apps, so sending happens only
  while the app is open. Safari can clear a website's storage after 7 days without a
  visit, while the home-screen app is counted separately; installing protects later
  Records, not those already waiting in Safari (the install drawer says to send them first).

Known limits: after sign-out, the kept page can still show the previous operator until
the next load with signal (saves are always checked against whoever is signed in).
Build files from old deploys stay on the device until `CACHE` in `sw.js` is bumped.
`next.config.ts` also sets the Next.js PWA guide's security headers on every page.

## Roadmap / open decisions

- **Mandible sensor data** lands in the same Neon database in its own table(s).
  Manual and sensor data meet on `pond_code` + timestamp — keep that join in mind
  for any schema change.
- **Airtable → Neon sync**: currently run by hand (`npm run db:sync`). A scheduled
  sync is the natural next step once edits happen regularly in Airtable.
- **Real operators**: the Airtable `operators` table holds two placeholders
  ("Operator 1", "Operator 2"); add the real names and untick the placeholders before
  go-live, then sync.

## Setup & deployment

### Prerequisites

Node.js 20+, a Neon account, a Vercel account, and internet access (the shadcn CLI
fetches components).

### First run (against the DEV branch)

1. Create the Neon project in **Singapore / ap-southeast-1**. The default branch, named `production`, is production.
2. Create a `dev` branch from `production`.
3. Copy the **pooled** connection strings for each branch.

```bash
cp .env.example .env
# paste the DEV pooled connection string into DATABASE_URL
# Clerk dev keys: `npx clerk@latest link --app app_3KuaeryWjtXBii7NYHMS8o8xhw3 && npx clerk@latest env pull`
# set AIRTABLE_API_KEY to a token with read access to the PondCube base

npm install
npm run db:push     # create tables in the dev branch
npm run db:sync     # copy sites, species, feeds, ponds + operators from Airtable
npm run dev         # http://localhost:3000
```

### Deploy (production)

1. Push the repo to GitHub; **Import** it in Vercel.
2. Set env vars per environment:
   - `DATABASE_URL` — Production → Neon `production` pooled URL; Preview → Neon `dev`.
   - `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY` — Production → the
     Clerk production instance (`npx clerk@latest deploy`); Preview → development keys.
   - `NEXT_PUBLIC_CLERK_SIGN_IN_URL=/sign-in`; remove `NEXT_PUBLIC_CLERK_SIGN_UP_URL` if present.
3. Apply the schema to production once:
   ```bash
   DATABASE_URL="<production branch url>" npx drizzle-kit push
   npm run db:sync -- --prod   # needs DATABASE_URL_PROD in .env
   ```
4. Production still at 0.7.0: before deploying 0.8.0, run its renames instead of push, when no one is
   recording (0.7.0 stops working once they're applied). They keep every Record value; tested in-memory
   against the 0.7.0 schema.
   ```bash
   psql "$DATABASE_URL_PROD" -f scripts/migrate-0.8.0.sql
   npm run db:sync -- --prod   # sets the new sites, species, feeds and links
   ```
