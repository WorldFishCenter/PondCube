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

Five static dimension tables and five event tables, all keyed on `pond_code`, plus `data_links` and the export views.
Source of truth is `lib/schema.ts` (Drizzle); don't restate columns elsewhere.

- **`site`** — one row per site (WorldFish DMS v5 `SITE`: three-letter `site` code, `name_site`,
  owner, contact, position), mirroring the Airtable `sites` table. Never removed from Neon. Also its `timezone`
  (IANA, e.g. `Asia/Kuala_Lumpur`; not in the DMS), which the exports use for local dates and times.
- **`pond`** — one row per Pond. Mirrors the Airtable `ponds` table (see below). Where the
  WorldFish DMS v5 names a field, the column (and the Airtable field) uses that name: `site`,
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
- **`wq_readings`, `feeding_events`, `mortality_events`** — flat event tables. A water-quality Correction names
  the reading of its pond it replaces in `replaces` (no foreign key: that reading may reach the server later, or be
  refused); `export_wq` leaves replaced readings out.
- **`app_version`** on every record table (fish measurements inherit it from their sampling
  event): the app version that saved it, set on the server by record intake, or `legacy` for the
  imported Excel log. Use it to trace records to the code and rules that accepted them.
- **`sampling_events` + `fish_measurements`** — header/detail: a sampling event owns
  one or more fish measurements (cascade delete). Intake writes them together or
  not at all.
- **`data_links`** — one row per sign-in account that has a data link: the SHA-256 of its key, never the key.
- **Views `export_wq`, `export_feeding`, `export_mortality`, `export_sampling`, `export_pond`** — what people
  see of the data, in export names (see [Seeing the data](#seeing-the-data)).

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
and stops if a link points nowhere, an active operator has no site, or a site's `timezone` is missing or isn't
an IANA name (an offset like `+08:00` is refused: Postgres reads it with the sign flipped). It upserts, so re-run it
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

### Water-quality rounds

The Water tab is a Round (`components/collection/water-round.tsx`), built on the Penang operators' feedback of
2026-10-31: almost 245 Ponds a round, at least six taps per Pond with one form per Record. An Area is picked once.
A bar with the Pond reached, its two required readings and one button sits over a list of the Area's Ponds. The button
says Save once something is typed and Skip on an empty Pond. The inputs stay the same elements from Pond to Pond, so
the keyboard stays up. The button never moves under the thumb: the page scrolls to bring the bar to the top only on a
tap into it or on a row, and once it's there the list scrolls under it. Opening More readings unsticks the bar, so the
page scrolls back to it and it stays where it was on screen. A Pond's state is one Badge, the same in its
row and in the bar's confirmation: Saved, Waiting (in the Outbox) or Not saved (a Draft left behind). The Outbox notice
sits under the bar here and under the form on the other tabs, as the save messages sit under Save, so neither can move
the button. The bar holds
only what changes at each Pond; the Period and date, which don't, head the list.

Number fields, on every tab, are text with a number keypad, not `type="number"`: browsers read that per device and
region (`1,500` as 1.5 or as nothing, `1,5` as 1.5 or as nothing). `toNumber` in `lib/validation.ts` reads what's
typed instead, the same everywhere: a comma is a decimal comma, since some keypads have no point. Only where a field
allows 1000 or more can `1,500` be thousands, so there it's refused rather than guessed.

There's no new write path: `createRound` (`lib/round.ts`) takes each tap on Save or Skip and puts the reading through the
Pond's Draft, so each Pond has its Draft, and each Save puts one Record in the Outbox, never waiting for the network.
`water-round.tsx` keeps only focus, scroll and rendering, and `scripts/check-round.ts` makes the same taps. A Pond left blank makes no Record. Retyping a Pond that has a reading in this Round makes a Correction: a new Record that names
the reading it replaces (its mark's id) and keeps its Recorded-at, so it lands in the same cell even past noon. It
replaces the whole reading, so at validation a field left blank takes that reading's value (`keptFrom`), pH and remarks included: nothing's typed into the form. The
export leaves the replaced one out, whatever order the two arrive in. The Outbox sends oldest first anyway.

What keeps a reading on its Pond: on a Pond nothing was typed at, Skip works only after it has shown for a second
(a double tap must not skip a Pond). A Draft that wasn't typed while this Round was on screen (another day, a reload)
needs a second Save. A row tap during a save is ignored. The other tabs follow the Pond the
Round reached. Typing from paper stays on through a reload or the browser closing the page, so those readings can't
take the current time; its time clears after 30 minutes away from the app, so a later Round can't inherit it.

`lib/round.ts` keeps how far the Round got on the device, per day and Period (today's and yesterday's only, so
it can't fill the storage the Outbox needs). These marks never decide whether a Record is saved or sent; a Correction
reads from them what it replaces and keeps. A Round stays the same one while readings keep coming (30
minutes apart at most), so its marks don't vanish if it runs past noon. The Period itself still follows each reading's
hour, as everywhere else, so readings after noon are afternoon ones. That's still to be confirmed with the Operators
(when does a round run?); if rounds do run past noon, it's `periodAt` and the `PERIOD` of `export_wq`. It also means a new
walk begun within those 30 minutes is still the old Round, so retyping a Pond there corrects its earlier reading.

Tested in Chromium and WebKit at phone size, and on a real iPhone so far only for the number keypad: there, still check
that the keyboard stays up on Save.

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
  lost on a weak signal never leads to a duplicate Record or Fish measurement. That holds with no room on the device
  too: the Draft stays, and saving the same values again sends the same ids (kept in memory, so not past a reload).
- **Who sends it.** Each Record carries the sign-in account that saved it (Clerk user
  id, so renaming the Operator in Airtable doesn't strand it). The device sends only
  that account's Records, and the route refuses any other (401), so nothing is ever
  stored under someone else's name.
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

## Seeing the data

The database is the only source of truth. Nothing pushes rows into a shared file: every file people get is a
copy, and corrections are made in the app: for water quality, a Correction in the Round (other Record kinds not yet).
`export_wq` shows a corrected reading only as its Correction, and only one of the same pond can replace it, so a
forged `replaces` can't hide another site's reading. Two ways in, both under "Your data" at the bottom
of the app, shown from tablet width up (`md`): nobody works with the data on a phone, so a leaked data link is
stopped from a tablet or computer too.

**What people see: the export views.** One view per Record kind plus ponds (`lib/schema.ts`). Column names are
the export headers in lowercase (exports upper-case them). They're the WorldFish DMS v5 names where
`docs/naming-alignment.md` (Status) settles them, and for everything else the `PROVISIONAL` mapping next to the
views: change a name there, once, when Matt answers. `date` is the site's local date as `YYYYMMDD` text, `time` its
local `HH:MM`, both from the site's `timezone`. `period` follows that local time too (morning before `NOON`, the
device's rule in `lib/options.ts`), not the Period the device stored, so the three agree even for a device set to
another time zone. Legacy rows are included (`source` = `legacy`). Sampling is one row per Fish measurement, its
event's fields repeated, with `sampling_event` grouping them and `measure_event` = `MONITOR` (the DMS v5 measurement event for
routine monitoring of ponds).

**One reader, the only site filter.** `readRows` in `lib/export.ts` reads a view for a list of sites, optionally
narrowed to one site and one month (or year). Every route passes it the Operator's sites, worked out on that
request the same way as recording (`accessFor` + `operators.sites`), so another site's rows never come through,
and a deactivated Operator gets nothing within about a minute (the operator lookup is cached, as for recording).
Nothing else filters rows by site.

**Way in 1: the water-quality download** (`GET /api/download?site=PEN&month=2025-07`, signed in, both required).
One site and one month as an `.xlsx` (`lib/workbook.ts`, written with write-excel-file plus two small "features" for the
Excel table and the cell comments). Tabs: About (how to read it, column meanings and units); Readings (one row
per reading, an Excel table with filters, DATE a real date shown `yyyymmdd`); one tab per area in the old log's
layout (tanks down, including tanks without readings; days across in 7-column blocks; morning above afternoon;
frozen at B4; out-of-range cells red; a day with several readings shows the latest in yellow, or red, with a
comment, also where the latest has no value but an earlier one does);
Tank averages (AM/PM for oxygen and temperature); Daily averages (per area per day, chart-ready). Averages leave
out-of-range values out. Area tabs follow Penang's old log order (`AREA_ORDER` in `lib/options.ts`); other areas
come after, alphabetically. It follows the agreed sample (`../PondCube PEN 2025-07 sample.xlsx`, made from the July
2025 log), apart from the About wording and averages that are now unrounded (shown to two decimals). `npm run check`
builds a file from a few test readings and checks key cells against them; when the sample is there, it also
compares the two with openpyxl tab for tab: names, frozen panes, merged cells, tables and each tab's header rows.
Nothing checks the rest of the sample cell for cell.

**Way in 2: the data link** (`GET /api/data/{wq,feeding,mortality,sampling,ponds}.csv?key=…`). A secret key per
sign-in account, made in the app (`POST /api/data-link`) and shown once; `data_links` keeps only its hash. Making
a new one replaces the old, which stops working. Each request looks the key's account up in Clerk and runs it
through `accessFor`, so the CSVs follow the operator list: removed, deactivated or moved to another site, and the
link changes with it. Every row of the Operator's sites, all months, read and streamed a site-local year at a time
(`rowsByYear`), so memory holds one year, not the whole history. Links are open to every Operator before Matt has
answered the naming questions (decided 2026-10-30): a rename then breaks the queries built on the old name, and
they get reshaped at that point.

The key travels in the address (`?key=`), as Excel's "Web API" credential and Google Sheets' `IMPORTDATA` both need.
So it shows in Vercel's request logs (project team only) and in any "From Web" URL someone pastes. Only its hash is
stored; a leaked key is stopped by making a new link.

**What the app shows with a new link.** A tab each for Google Sheets and Excel, with a line per CSV to copy:
`=IMPORTDATA("…")` for cell A1 of a sheet, or the address for Excel for the web (Data → Get Data → Web API, then
Anonymous). Both put the key in the file, and the app says so: share that file only with people who may see the
records. The template below keeps the key out of the workbook, on Excel 365 for Windows.

Checked on 2026-10-30:

- **Vercel's 4.5 MB response limit.** The limits page states 4.5 MB for "the request body or the response body"
  and doesn't mention streaming; Vercel's knowledge base article on that limit (updated 2025-11-10) recommends
  "streaming functions, which don't have this limit". The CSVs are streamed (`Transfer-Encoding: chunked`); one
  month of Penang water quality is 417 KB, so a site-year is about 5 MB. Not yet tried on Vercel: before relying
  on it, fetch a CSV of more than 4.5 MB from a preview deploy.
- **drizzle-kit push and views.** Push creates new views and drops removed ones, but skips a changed definition
  (`drizzle-kit` 0.31.11 only re-creates altered views outside push). To change a view: `DROP VIEW` it, then push.
  Postgres also refuses to change a column a view uses: drop the view first there too.
- **Excel's "Web API" credential.** With `Web.Contents(url, [ApiKeyName = "key"])`, Power Query adds the key from
  the credential to the URL; Microsoft's `Web.Contents` reference describes exactly this to avoid "hard-coding
  the secret key in M". Credentials live in Power Query's own store (Data → Get Data → Data Source Settings →
  Global permissions), per user on that computer, not in the workbook. Pasting a URL that contains `?key=` into
  "From Web" does put the key in the workbook. Not checked: Excel for Mac, whose Power Query may not offer Web API
  credentials.

### Building the Excel template (Power Query)

For Excel 365 on Windows. Each person who refreshes it needs their own data link: the key isn't in the file.

1. In the app, "Your data" → "Make a data link". Copy the key.
2. Excel → Data → Get Data → From Other Sources → Blank Query → Advanced Editor. Paste, with the app's address:
   ```
   let
       Source = Csv.Document(
           Web.Contents("https://<app address>/api/data/wq.csv", [ApiKeyName = "key"]),
           [Delimiter = ",", Encoding = 65001, QuoteStyle = QuoteStyle.Csv]),
       Headers = Table.PromoteHeaders(Source, [PromoteAllScalars = true]),
       Typed = Table.TransformColumnTypes(Headers, {
           {"TANK", Int64.Type}, {"DISSOLVED_OXYGEN", type number}, {"TEMPERATURE", type number},
           {"PH", type number}, {"AMMONIA", type number}, {"NITRITE", type number}, {"NITRATE", type number}},
           "en-US"),
       Day = Table.AddColumn(Typed, "DAY", each #date(
           Number.From(Text.Start([DATE], 4)), Number.From(Text.Middle([DATE], 4, 2)),
           Number.From(Text.End([DATE], 2))), type date)
   in
       Day
   ```
   `"en-US"` reads decimals with a point whatever the computer's language. DATE stays `YYYYMMDD` text; DAY is the
   same date as a real date, for pivots and charts.
3. When Excel asks how to connect: Web API, paste the key, set the level to the app's address, Connect.
4. Name the query `wq`, then Close & Load To → Table, on a new sheet. Repeat for `feeding`, `mortality`,
   `sampling` and `ponds` (right-click the query → Duplicate, change the file name; type their number columns
   the same way).
5. Tank × day, one per period: Insert → PivotTable from the `wq` table. Filters: AREA, PERIOD; Rows: TANK;
   Columns: DAY (right-click → Ungroup, so each day is its own column); Values: Average of DISSOLVED_OXYGEN and
   Average of TEMPERATURE. Set PERIOD to morning; copy the pivot and set the copy to afternoon.
6. Daily average per area: another PivotTable from `wq`. Filters: PERIOD; Rows: DAY; Columns: AREA; Values:
   Average of TEMPERATURE (or DISSOLVED_OXYGEN). Insert → PivotChart → Line. Add slicers for PERIOD and AREA.
7. Data → Refresh All brings everything up to date (Query Properties → "Refresh data when opening the file"
   does it on open). To start over with a new key: Data Source Settings → Global permissions → the app's
   address → Edit Permissions → Edit.

Google Sheets: `=IMPORTDATA("https://<app address>/api/data/wq.csv?key=<key>")`. The key is then in the sheet, so
anyone who can open the sheet can read the data.

## Roadmap / open decisions

- **Different ways of working per Site**: Operators work differently in each place, so the app will need per-Site
  front-end settings. Not built: design them from two real cases, when a second Site's way of working is known. The
  Site's row in Airtable is their natural home. Penang's choices today: the Round as the Water tab
  (`components/collection/water-round.tsx`) and the Area order (`lib/options.ts`).
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
5. From 0.9.0 to 0.10.0 (seeing the data): add each site's time zone first, since push can't add a required
   column to a table with rows, then push the views and `data_links`. It sets PEN only, the one site on dev
   (branched from production): if production has another, add its line, or the file stops and changes nothing. It
   also turns notes left blank (`''`) into null, as the app saves them from 0.10.0, and drops `export_sampling` and
   `export_wq` (push skips a changed view). Applied to the dev branch on 2026-10-30.
   ```bash
   psql "$DATABASE_URL_PROD" -f scripts/migrate-0.10.0.sql   # sets PEN to Asia/Kuala_Lumpur
   DATABASE_URL="$DATABASE_URL_PROD" npx drizzle-kit push
   npm run db:sync -- --prod   # from now on the zone comes from Airtable's sites.timezone
   ```
6. From 0.10.0 to 0.11.0 (rounds): before deploying the app, drop `export_wq` (push skips a changed view) and push,
   which adds `wq_readings.replaces` and recreates the view. 0.10.0 keeps working on the new schema; 0.11.0 needs
   it, as intake writes `replaces`. The download and data links fail for the seconds between the two commands. Do
   the same on the dev branch with `DATABASE_URL`.
   ```bash
   psql "$DATABASE_URL_PROD" -c 'DROP VIEW IF EXISTS export_wq'
   DATABASE_URL="$DATABASE_URL_PROD" npx drizzle-kit push
   ```
