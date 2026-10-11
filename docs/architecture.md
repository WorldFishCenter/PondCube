# Architecture, infrastructure & plan

How PondCube Collect is built and where its data lives. This is the reference for
infrastructure and roadmap decisions; day-to-day coding rules are in
`.claude/CLAUDE.md`, and domain terms are in `docs/glossary.md`.

## The shape of the system

Operators open the app on a phone or tablet, pick who they are and which pond
they're at, and record one of four kinds of observation. Each record is validated
on the device, re-validated on the server, and written whole (or not at all) to a
Postgres database. There are no logins in v1 — a shared site code gates saving.

```
device (phone/tablet)                 server (Vercel, sin1)        data (Neon Postgres, Singapore)
─────────────────────                 ─────────────────────        ──────────────────────────────
pick operator + pond                  server action:               assets        (ponds, static)
fill a record  ──── draft in ────▶    access check                 operators     (pick-list)
  (validated locally)  localStorage   → re-validate (same zod)      wq_readings
                                       → record intake (all/none)   feeding_events
                                                        │           mortality_events
                                                        └────────▶  sampling_events + fish_measurements
```

## Data model

Two static dimension tables and five event tables, all keyed on `pond_code`.
Source of truth is `lib/schema.ts` (Drizzle); don't restate columns elsewhere.

- **`assets`** — one row per Pond. Mirrors the Airtable asset table (see below).
  Carries `legacy_location` + `legacy_tank_id` so converted historical rows map
  onto today's pond codes.
- **`operators`** — the pick-list of people who record. No auth; a name is attached
  to each record as its `enumerator`.
- **`wq_readings`, `feeding_events`, `mortality_events`** — flat event tables.
- **`sampling_events` + `fish_measurements`** — header/detail: a sampling event owns
  one or more fish measurements (cascade delete). Intake writes them together or
  not at all.

## Infrastructure

### Neon Postgres — the one database

All manual records land here, and sensor data will land in the **same** database
later (see roadmap). Region: **Singapore / ap-southeast-1**, closest to Penang HQ.

Two branches give clean dev/prod separation on identical schema:

| Environment       | Neon branch | `DATABASE_URL` set in       |
| ----------------- | ----------- | --------------------------- |
| Local dev         | `dev`       | your `.env`                 |
| Vercel Preview    | `dev`       | Vercel "Preview" env var    |
| Vercel Production | `main`      | Vercel "Production" env var |

`main` is production; `dev` is a copy-on-write branch with isolated data, so test
records never touch production. Schema is applied per branch with
`npm run db:push`. Always use the **pooled** connection string.

### Airtable — the human editing surface for ponds and operators

The Airtable base **PondCube** is where people add and edit ponds (`ponds` table) and
operators (`operators` table: `name`, `active`, `notes`) by hand. Neon is the system
of record the app reads and writes. The flow is one-way:
**Airtable → `npm run db:sync` → Neon `assets` / `operators`** (or one table:
`db:sync-ponds`, `db:sync-operators`). It upserts, so re-run it after edits. Never edit
ponds or operators directly in Neon.

- **Checked first, all-or-nothing.** Every Airtable row is checked (required columns,
  numbers, dates, pond code format, duplicates) before anything is written; any problem
  is listed and nothing changes. The write itself is a single all-or-nothing step.
- **Retiring.** A pond removed from Airtable is set to `retired` in Neon (hidden from the
  app, kept for its records); re-adding it makes it active again. To retire an operator,
  untick `active` or remove the row: either way they're deactivated, never deleted, so
  past records keep the name.
- **Production needs `--prod`.** `npm run db:sync -- --prod` writes to `DATABASE_URL_PROD`;
  without the flag the sync refuses to write if `DATABASE_URL` is the production database.
  It prints the target and what will change before writing.

### Vercel — hosting

Next.js app deployed on Vercel, functions pinned to `sin1` (Singapore, next to the
database) via `vercel.json`. The optional
[Neon–Vercel integration](https://neon.tech/docs/guides/vercel) can wire branches
to environments automatically, including a DB branch per preview deploy.

### Access (v1)

No logins. A shared site code (`ACCESS_CODE`) is entered once per device, stored in
an httpOnly cookie, and checked by every save. Changing it locks out every device
until re-entered. Set a different code per Vercel environment.

## Roadmap / open decisions

- **Mandible sensor data** lands in the same Neon database in its own table(s).
  Manual and sensor data meet on `pond_code` + timestamp — keep that join in mind
  for any schema change.
- **Airtable → Neon sync**: currently run by hand (`npm run db:sync`). A scheduled
  sync is the natural next step once edits happen regularly in Airtable.
- **Auth**: v1 is deliberately login-free. Per-operator auth is a later decision,
  not a v1 gap.
- **Real operators**: the Airtable `operators` table holds two placeholders
  ("Operator 1", "Operator 2"); add the real names and untick the placeholders before
  go-live, then sync.

## Setup & deployment

### Prerequisites

Node.js 20+, a Neon account, a Vercel account, and internet access (the shadcn CLI
fetches components).

### First run (against the DEV branch)

1. Create the Neon project in **Singapore / ap-southeast-1**. `main` is production.
2. Create a `dev` branch from `main`.
3. Copy the **pooled** connection strings for each branch.

```bash
cp .env.example .env
# paste the DEV pooled connection string into DATABASE_URL
# set ACCESS_CODE to a long random code
# set AIRTABLE_API_KEY to a token with read access to the PondCube base

npm install
npm run db:push     # create tables in the dev branch
npm run db:sync     # copy ponds + operators from Airtable
npm run dev         # http://localhost:3000
```

### Deploy (production = `main` branch)

1. Push the repo to GitHub; **Import** it in Vercel.
2. Set env vars per environment:
   - `DATABASE_URL` — Production → Neon `main` pooled URL; Preview → Neon `dev`.
   - `ACCESS_CODE` — a different shared code per environment.
3. Apply the schema to production once:
   ```bash
   DATABASE_URL="<main branch url>" npx drizzle-kit push
   npm run db:sync -- --prod   # needs DATABASE_URL_PROD in .env
   ```
