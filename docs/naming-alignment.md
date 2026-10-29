# Naming alignment with the WorldFish GIP data standard

Draft for review with Matt Hamilton, 2026-10-29. What has already changed is under Status.

At the 2026-10-29 demo Matt asked that every genetic improvement program (GIP) site (Penang, Bangladesh, Egypt,
Zambia) use one set of names and identifiers, including the names Operators see in the app. This document maps PondCube
Collect's names onto that standard, lists the renames, lists what the standard records that we don't, and ends with the
questions only Matt can answer. Renames should land before Penang go-live and before the Excel export ships: after
that, a pond rename strands Drafts and Outbox Records on devices, and any column rename breaks people's Excel queries.

**Sources read**

- **DMS**: Hamilton MG. 2021. _WorldFish Carp Genetic Improvement Program Data Management System (Version 3): Data
  input._ All 49 pages, including the database schema in Annex 1.
- **Pond book**: `2025 CGIP pond book.xlsm`, the Bangladesh workbook in current use (Talbaria site, 51 sheets). Read
  cell by cell with openpyxl; macros were not run. Dropdown lists and Excel validation bounds were read from the sheet
  XML.
- Not read: the public 2020 pond book guide (Hamilton et al. 2020, doi:10.7910/DVN/DBN1UD).

**Our side**: `docs/glossary.md`, `lib/schema.ts`, `lib/options.ts`, `lib/validation.ts`, the form labels in
`components/collection/`, and the 296 Penang ponds in the dev database.

## Status

**Answered on 2026-10-29**

- Q1: where the DMS v3 and the pond book disagree, the DMS wins. From the table in 1.6, that settles: a pond is `SITE`
  plus `POND_NEST` (a whole number below 1000, unique within the site); species are written `CC`; causes of death are
  the DMS's four (`Cull`, `Unknown`, `Disease_parasites`, `Water_quality`); export headers look like `CAUSE_DEATH`;
  export dates are `YYYYMMDD` text.
- Q3 (in part): Penang's `NAME_SITE` is "Batu Maung". Whether `PEN` is its `SITE` code is still open.
- Q6: pond area is in hectares.

**Changed on 2026-10-29**: the pond fields the DMS v3 names.

| Before                  | Now                     | Standard                |
| ----------------------- | ----------------------- | ----------------------- |
| table `assets`          | `pond`                  | `POND`                  |
| `site_code`             | `site`                  | `SITE`                  |
| `site`                  | `name_site`             | `NAME_SITE`             |
| `latitude`, `longitude` | `lat_pond`, `long_pond` | `LAT_POND`, `LONG_POND` |
| `surface_area_m2` (m²)  | `area_pond` (hectares)  | `AREA_POND`             |
| `notes`                 | `note_pond`             | `NOTE_POND`             |

Done in the code, the Airtable `ponds` table and the Neon dev database. Production follows with
`scripts/migrate-0.8.0.sql` when the change is deployed. Only names changed: the area column was empty everywhere, so
no values needed converting. The Operators' screens and the Records on devices are unaffected. The site name ("Batu
Maung") is now set on the site's row in the Airtable `sites` table (`name_site` later moved from the pond to the site,
see Also done) and reaches Neon with the next sync.

Also changed (app version 0.8.0): the causes of death an Operator can pick are now the DMS's four, stored and shown as
the DMS writes them: `Cull`, `Unknown`, `Disease_parasites`, `Water_quality`. The app's earlier six (disease,
predation, handling, water_quality, unknown, other) came with its first version, not from Penang, and no Record used
them.

Also changed: the Record fields the DMS v3 names. Done in the code and the Neon dev database; production follows with
`scripts/migrate-0.8.0.sql` when the change is deployed. These are renames only, so existing values (e.g. the Person on
the 4,334 legacy readings) are kept. Drafts and Outbox Records saved on a device before the change are read under the
new names. A value with no new field (an old feed type, or a cause the DMS lacks) goes in the remarks or note, on
devices and in the database alike.

| Before                               | Now           | Standard                              |
| ------------------------------------ | ------------- | ------------------------------------- |
| `enumerator` (every Record table)    | `person`      | `PERSON`                              |
| `suspected_cause` (Mortality record) | `cause_death` | `CAUSE_DEATH`                         |
| `remarks` (Mortality record)         | `note_death`  | `NOTE_DEATH`                          |
| `weight_g` (Fish measurement)        | `wt`          | Trait `WT`, total weight in grams     |
| `length_cm` (Fish measurement)       | `len_st`      | Trait `LEN_ST`, standard length in cm |

Penang measures standard length from now on (decided 2026-10-29); the form says "Standard length (cm)".

Not renamed, because the DMS gives no name: `remarks` on Water-quality readings and Feeding events (the DMS has no such
tables) and `notes` on Sampling events (`NOTE_MEASURE` is a note on one fish). These stay as they are, like everything
else the DMS doesn't cover.

**Also decided on 2026-10-29**: the pond identifier (Q4) is dealt with last. `PERSON` holds the Operator's full name.
The app shows the standard names in plain words, not capitals and underscores (e.g. "Cause of death" for
`CAUSE_DEATH`).

**Also done on 2026-10-29**:

- Species: a `species` table (DMS `SPECIES`, `SPECIES_LATIN`; `species_common` from the pond book) in Airtable and
  Neon. Each pond links to its species; Neon stores the two-letter code. `ON` (_Oreochromis niloticus_) is ours, not in
  the DMS or the pond book: confirm the code with Matt.
- Ranges for fish measurements follow the DMS trait list: `wt` 0–20,000 g, `len_st` 0–100 cm.
- Sites: a `sites` table (DMS `SITE` fields; one row: `PEN`, Batu Maung) in Airtable and Neon. Ponds and operators
  link to it; `name_site` moved from the pond to the site, as in the DMS. An Operator sees and records only the ponds
  of their own sites, and some have several (decided).
- Feeds: a `feeds` table in Airtable with the DMS `FEED` fields only (`feed`, a three-character identifier, and
  `note_feed`), linked to the sites that use it, synced to Neon. The feeding form offers the feeds of the pond's site
  instead of a fixed list. Two test feeds for now (NAT, SUP: the DMS's own examples).
- Labels: the DMS-named fields show the standard name in plain words (Person, Pond, Cause of death, Note, Total
  weight, Standard length, Feed).
- Species: `ON` confirmed.
- Times: we keep the exact instant (ISO 8601 with offset, as the app already requires). Exports write DMS dates as
  `YYYYMMDD`, which is the ISO 8601 basic date format, in the site's local date.

**Decided on our side**: names are lowercase in Neon and Airtable (`lat_pond`), because Postgres folds unquoted names
to lowercase. Q2 asks Matt whether that counts as the same name.

**Waiting for Matt**: the rest of this document. First the site code and the pond numbers (Q3, Q4). Then the Record
fields and their values. Each further rename also needs Records still waiting on devices read under the new names, as
was done for this one.

## Summary

- The standard has two layers. The DMS is the genetics database: individual fish, families, spawning, deaths,
  measurements. It says pond environment and management data live in a separate system, the pond book, which records
  water chemistry, feed, fertiliser, treatments, fish and water transfers, deaths and random samples per pond per day.
  Our four Record kinds belong to the pond book's layer. The DMS supplies the naming grammar and identifier formats.
- Most of our terms have a standard equivalent with the same meaning and a different name. The units mostly agree:
  mg/l, °C, g, cm.
- **Pond codes are the hardest change.** We use `PEN-FT3-091` (site, area, number). The standard identifies a pond
  by site plus a number unique within the site, written `TAL_01`. Penang's 296 ponds use only 210 distinct numbers:
  Fish Tanks 1–3 share one run (1–210), but Hatchery, Block L, Aqua, Water Storage and Pond each restart at 1. So 86
  ponds need new numbers (Q4).
- No Record of ours carries a **species**. In the standard, every death, transfer and sample row does.
- Values that differ: mortality causes (now the DMS's four; the pond book has 12), Period (morning/afternoon vs
  morning/midday/afternoon), feed (kg per feeding vs grams per feed product per day).
- The two sources disagree with each other on a few points: pond area unit, species value, death causes, header
  spelling. Matt needs to say which source wins (Q1).
- The standard records things we don't yet: fish transfers, water transfers, fertiliser, treatments, Secchi disc and
  water depth, per-species random samples, pond category.

## 1. The standard

### 1.1 Naming grammar

| Rule                                                                                       | Examples                                                                  | Source    |
| ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------- | --------- |
| Field names are UPPER_SNAKE, attribute first, entity last                                  | `DATE_DEATH`, `CAUSE_DEATH`, `LAT_POND`, `AREA_POND`, `NAME_SITE`         | DMS       |
| Free text is `NOTE_<ENTITY>`                                                               | `NOTE_POND`, `NOTE_DEATH`, `NOTE_MEASURE`                                 | DMS       |
| `_NEST` marks an identifier that is unique only inside its parent                          | `POND_NEST` within `SITE`; `FAM_NEST` within `SPAWN_ROUND` + `SPECIES`    | DMS       |
| A pond in a role takes the role as suffix                                                  | `SITE_GROW_OUT` + `POND_NEST_GROW_OUT`; `SITE_NURSE` + `POND_NEST_NURSE`  | DMS       |
| Who did it is `PERSON` (free text, 50 chars)                                               | `KAMRUZZAMAN`, `MGH`                                                      | DMS       |
| Dates are text `YYYYMMDD`                                                                  | `20181013`                                                                | DMS       |
| Data-entry headers are spaced capitals with the unit on the row below; free text `REMARKS` | `DISOLVED OXYGEN MORNING (mg/l)`, `FEED 1 WEIGHT (g)`, `CAUSE OF DEATH`   | Pond book |
| Lookup sheets use DMS-style names                                                          | `SPECIES`, `SPECIES_LATIN`, `NAME_SITE`, `POND`, `AREA_POND`, `NOTE_POND` | Pond book |
| Code values: `Capitalised_with_underscores` or `UPPERCASE`                                 | `Disease_parasites`, `Water_quality`; `NURSERY`, `GROW_OUT`, `HARV`       | Both      |

### 1.2 Identifiers

| Entity                   | Format                                                                    | Example                                                 |
| ------------------------ | ------------------------------------------------------------------------- | ------------------------------------------------------- |
| Site                     | 3 uppercase letters                                                       | `TAL`, `KOT`, `PAL`, `HAI`                              |
| Pond                     | `SITE` + `POND_NEST` (integer < 1000); written `SITE_NN` in the pond book | `TAL_01`                                                |
| Placeholder ponds        | `SITE_00` = unknown backup ponds at that site                             | `HAI_00`, `NOV_00`                                      |
| Transfer sources         | Not ponds; used as the from-pond of a transfer                            | `BORE`, `YEAR_START`, `NURSERY`, `RECONCILIATION_ERROR` |
| Species                  | 2 uppercase letters, acronym of the scientific name                       | `LR` (_Labeo rohita_)                                   |
| Spawn round              | 7 characters: program letter + year + run number                          | `C202501`                                               |
| Individual fish          | `INDIV` = spawn round + `_` + PIT tag, up to 22 characters                | `C201701_00076AECF5`                                    |
| Family                   | `FAM_NEST`, integer < 10000 within spawn round + species                  | `214`                                                   |
| Measurement event        | Short code                                                                | `TAG`, `HARV`, `POST_HARV`                              |
| Trait                    | Short code, up to 10 characters                                           | `WT`, `LEN_ST`, `WT_HOG`                                |
| Feed / fertiliser codes  | 3 / 4 characters (DMS treatment level)                                    | `NAT`, `SUP`; `UNDE`                                    |
| Country                  | ISO 3166 alpha-3                                                          | `BGD`                                                   |
| Capture-system record id | 36 characters (a UUID), e.g. `DB_STOCK`, `DB_SPAWN`                       | `533cbeab-8ab7-4951-…`                                  |

The pond book keeps former names in `NOTE_POND` ("Before Jan 2019 known as Pond 6 (TAL_96 in database)",
"Merged TAL_03, TAL_04 and TAL_05").

### 1.3 Pond-level records (pond book)

One sheet per pond, one row per day, plus three logs. "Bounds" are the workbook's own validation limits, the closest
thing to our Ranges.

| Record            | Fields (unit)                                                                                                                               | Bounds                                    |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------- |
| Water chemistry   | `DATE`; for each of MORNING, MIDDAY, AFTERNOON: `TIME`, `pH`, `DISOLVED OXYGEN` (mg/l), `TEMPERATURE` (°C), `AMMONIA` (mg/l); `REMARKS`     | pH 0–14; DO, temperature, ammonia 0–50    |
| Secchi disc       | `TIME`, `SECCHI DISC` (cm), `WATER DEPTH` (cm), `REMARKS`                                                                                   | 0–500 cm, whole numbers                   |
| Feed              | Up to 3 per day: `FEED n TYPE`, `FEED n WEIGHT` (g); `REMARKS`                                                                              | 0–15 000 g                                |
| Fertiliser        | Up to 3 per day: `FERTILISER n TYPE`, `FERTILISER n WEIGHT` (g); `REMARKS`                                                                  | 0–100 000 g                               |
| Treatment         | Up to 3 per day: `TREATMENT n TYPE`, `TREATMENT n WEIGHT` (g); `REMARKS`                                                                    | 0–100 000 g                               |
| Random sample     | Up to 7 species: `SPECIES n`, `SPECIES n COUNT`, `SPECIES n MEAN WEIGHT` (g); `REMARKS`, `GENERAL REMARKS`                                  | count ≥ 0; mean weight 0–15 000 g         |
| Fish death        | Per fish: `DATE`, `SPECIES`, `PIT`, `POND`, `CAUSE OF DEATH`, `REMARKS`. Summary: `DATE`, `SPECIES`, `POND`, `CAUSE OF DEATH`, `COUNT_DEAD` | —                                         |
| Fish transfer     | Per fish: `DATE`, `SPECIES`, `FROM POND`, `TO POND`, `TO POND CATEGORY`, `PIT`, `REMARKS`. Summary: … `COUNT TRANSFERRED`                   | count ≥ 0                                 |
| Water transfer    | `DATE`, `FROM POND`, `TO POND`, `PUMP TIME` (hours), `REMARKS`                                                                              | ≥ 0                                       |
| Regime (per pond) | Feed: type, rate (% of body weight / day), frequency (days). Fertiliser and treatment: type, rate (g / decimal / day), frequency            | rate 0–100 / 0–1000; frequency 1–100 days |
| Pond              | `NAME_SITE`, `SITE`, `POND`, `AREA_POND` (decimals), `LAT_POND`, `LONG_POND`, `NOTE_POND`                                                   | —                                         |

In 2025 the logs hold 76 120 fish transfer rows, 18 025 fish death rows (one per tagged fish) and 103 water transfers.

### 1.4 DMS tables that touch ours

| Load file                   | Fields                                                                                                                                                                     |
| --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `site`                      | `SITE`, `NAME_SITE` (closest town or village on Google Maps), `OWNER_SITE`, `PHONE_SITE`, `EMAIL_SITE`, `LAT_SITE`, `LONG_SITE`, `NOTE_SITE`                               |
| `pond_desc`                 | `SITE`, `POND_NEST`, `AREA_POND` (ha), `LAT_POND`, `LONG_POND`, `NOTE_POND`                                                                                                |
| `species`                   | `SPECIES`, `SPECIES_LATIN`                                                                                                                                                 |
| `death`                     | `INDIV`, `SPECIES`, `DATE_DEATH`, `CAUSE_DEATH`, `NOTE_DEATH`                                                                                                              |
| `measure_data`              | `INDIV`, `MEASURE_EVENT`, one column per trait (`WT`, `LEN_ST`, `WIDTH`, `DEPTH`, …), `PERSON`, `NOTE_MEASURE`, `DATE_MEASURE`                                             |
| `trait`                     | `TRAIT`, `NAME_TRAIT`, `UNITS`, `MIN`, `MAX`, `TYPE`, `CATEGORY`, `BODY_PART`, `NOTE_TRAIT`. Examples: `WT` total weight, g, 0–20 000; `LEN_ST` standard length, cm, 0–100 |
| `feed`, `fert`, `treatment` | Treatment codes for progeny tests (`CULTURE` M/P, `FEED`, `FERT`, `NEST_TREAT`), not daily applications                                                                    |

The rest of the DMS (spawning, tagging, families, hapas, founders, EBVs, tissue samples, dissemination) is genetics work
outside PondCube Collect.

### 1.5 Controlled lists (pond book)

- **Species**: `CC` Catla (_Catla catla_), `HM` Silver carp (_Hypophthalmichthys molitrix_), `LR` Rohu (_Labeo
  rohita_), `CI` Grass carp (_Ctenopharyngodon idella_), `MP` Black carp (_Mylopharyngodon piceus_), `CH` Chital
  (_Chitala chitala_), `BG` Raj puti (_Barbonymus gonionotus_), `MR` Mrigal (_Cirrhinus cirrhosus_). Shown in cells as
  `CC (catla)`.
- **Cause of death**: `Cull_post_harvest_measure`, `Cull_post_mating`, `Cull_final`, `Cull_backup`, `Cull_other`,
  `Handling_mortality`, `Tagging_mortality`, `Measurement_mortality`, `Unknown`, `Disease_parasites`, `Water_quality`,
  `Missing` (not found when the pond was drained or netted, assumed dead).
- **Pond category**: `NURSERY`, `GROW_OUT`, `BROOD`, `PARENTS`, `BACKUP`, `OTHER`, `PREGROWOUT`. It describes what a
  pond is used for and is recorded on each transfer, not on the pond.
- **Feed type**: product names with composition (protein, carbohydrate, fat, ash, moisture %): Mega Nursery Powder,
  Mega Pre Starter, Mega Carp Grower, Nutri-egg, Tiger nursery feed.
- **Fertiliser type**: Urea, TSP, MOC, Yeast, Molasses, Rice_Polish.
- **Treatment type**: Lime, Timsen, Acimec, Salt, TSC (tea seed cake), Paratics.
- **Period**: MORNING, MIDDAY, AFTERNOON (column groups, each with its own time).
- **Measurement event** (DMS): `TAG`, `HARV`, `POST_HARV`.

### 1.6 Where the two sources disagree

| Topic           | DMS v3                                                                        | Pond book                                                |
| --------------- | ----------------------------------------------------------------------------- | -------------------------------------------------------- |
| Pond identifier | Two fields, `SITE` + `POND_NEST`                                              | One value, `TAL_01`                                      |
| Pond area unit  | Hectares (but the example values, 35, 36, 42, look like decimals)             | Decimals                                                 |
| Species value   | `CC`                                                                          | `CC (catla)`                                             |
| Causes of death | 4: `Cull`, `Unknown`, `Disease_parasites`, `Water_quality`; 22 characters max | 12 (above); `Cull_post_harvest_measure` is 25 characters |
| Header style    | `CAUSE_DEATH`, `DATE_DEATH`                                                   | `CAUSE OF DEATH`, `DATE`, `COUNT_DEAD`                   |
| Date            | Text `YYYYMMDD`                                                               | Excel date                                               |

## 2. Mapping: ours → standard

Match: **same** (name and meaning agree), **rename** (same meaning, different name), **recode** (values differ),
**unit** (unit differs), **none** (no equivalent), **done** (renamed on 2026-10-29, see Status).

### 2.1 Glossary terms

| Our term (`docs/glossary.md`) | Standard                                           | Match  | Note                                                         |
| ----------------------------- | -------------------------------------------------- | ------ | ------------------------------------------------------------ |
| Pond                          | Pond (`POND`)                                      | same   | Ours covers tanks too; the standard's examples are all ponds |
| Pond code                     | `POND` = `SITE` + `POND_NEST`                      | recode | See 2.2                                                      |
| Legacy location / tank ID     | Former name in `NOTE_POND`                         | none   |                                                              |
| Operator                      | —                                                  | none   | App sign-in concept                                          |
| Person (was Enumerator)       | `PERSON`                                           | done   | Q12                                                          |
| Who & where                   | —                                                  | none   | App concept                                                  |
| Record / Record kind          | Load file / pond book section                      | none   | App concepts                                                 |
| Water-quality reading         | Water chemistry                                    | rename |                                                              |
| Period                        | MORNING / MIDDAY / AFTERNOON                       | recode | Q8                                                           |
| Feeding event                 | Feed                                               | rename | Different shape, 2.5                                         |
| Mortality record              | Fish death (summary row)                           | rename |                                                              |
| Sampling event                | Random sample (pond book); measurement event (DMS) | rename | Q11                                                          |
| Fish measurement              | Trait values `WT`, `LEN_ST`                        | rename |                                                              |
| Recorded-at                   | `DATE` (+ `TIME` for water chemistry)              | rename | We keep the exact instant; the standard keeps a date. Q13    |
| Range                         | Trait `MIN` / `MAX`; workbook validation bounds    | same   | 2.8                                                          |
| Draft, Outbox, Record intake  | —                                                  | none   | App concepts                                                 |
| Site, Species                 | `SITE`, `SPECIES`                                  | done   | Added to our glossary                                        |
| —                             | Spawn round, PIT, Pond category                    | —      | Missing from our glossary                                    |

### 2.2 Ponds (`pond` table, Airtable `ponds`)

| Ours                                                   | Standard                                | Match  | Note                                                   |
| ------------------------------------------------------ | --------------------------------------- | ------ | ------------------------------------------------------ |
| table `pond` (was `assets`)                            | `POND`                                  | done   |                                                        |
| `pond_code` `PEN-FT3-091`                              | `POND` `PEN_091` (`SITE` + `POND_NEST`) | recode | Numbers collide across areas, Q4                       |
| `display_name` `Fish Tank 3 - #91`                     | —                                       | none   | The pond book shows the code itself                    |
| `name_site` (was `site`), now on `site`: `Batu Maung`  | `NAME_SITE`                             | done   | The closest town or village, per the DMS (Q3)          |
| `site` (was `site_code`) `PEN`                         | `SITE`                                  | done   | Is `PEN` the agreed code? Q3                           |
| `area`, `area_code`, `zone`                            | —                                       | none   | Penang only, Q5                                        |
| `unit_type` tank / hatchery_tank / pond / storage      | —                                       | none   | Pond category is about use and lives on transfers      |
| `legacy_location`, `legacy_tank_id`                    | `NOTE_POND` text                        | none   | We need them as fields to map the July 2025 log        |
| `lat_pond`, `long_pond` (were `latitude`, `longitude`) | `LAT_POND`, `LONG_POND`                 | done   | Both decimal degrees; empty for all Penang ponds       |
| `area_pond` (was `surface_area_m2`, m²)                | `AREA_POND`                             | done   | Hectares (Q6); empty for all Penang ponds              |
| `volume_m3`, `depth_m`                                 | —                                       | none   | The pond book records `WATER DEPTH` (cm) daily instead |
| `water_source`                                         | —                                       | none   | The pond book uses `BORE` as a transfer source         |
| `species` (was `species_strain`)                       | `SPECIES`                               | done   | Links to `species`; on each Record too? Q7             |
| `status`, `commissioned_date`                          | —                                       | none   |                                                        |
| `note_pond` (was `notes`)                              | `NOTE_POND`                             | done   |                                                        |

### 2.3 Fields on every Record

| Ours                           | Standard                                 | Match  | Note                                                              |
| ------------------------------ | ---------------------------------------- | ------ | ----------------------------------------------------------------- |
| `id` (made on the device)      | `DB_*` capture-system id (36 characters) | same   | Same shape as `DB_STOCK`, `DB_SPAWN`                              |
| `pond_code`                    | `POND`                                   | rename |                                                                   |
| `recorded_at` (instant)        | `DATE` / `DATE_<EVENT>`, plus `TIME`     | rename | Q13                                                               |
| `person` (was `enumerator`)    | `PERSON`                                 | done   | Q12                                                               |
| `remarks`; `notes` on sampling | `NOTE_<ENTITY>` (DMS, per Q1)            | rename | Done for deaths (`note_death`); no DMS entity for the others, Q12 |
| — (not recorded)               | `SPECIES`                                | none   | On deaths, transfers and samples, Q7                              |
| `app_version`, `created_at`    | —                                        | none   | Audit fields                                                      |

### 2.4 Water-quality reading (`wq_readings`) → water chemistry

| Ours                             | Standard                           | Match  | Note                                    |
| -------------------------------- | ---------------------------------- | ------ | --------------------------------------- |
| `period` `morning` / `afternoon` | `MORNING` / `MIDDAY` / `AFTERNOON` | recode | No midday in Penang, Q8                 |
| `dissolved_oxygen` (mg/L)        | `DISOLVED OXYGEN` (mg/l)           | same   | The pond book misspells "dissolved"     |
| `temperature` (°C)               | `TEMPERATURE` (°C)                 | same   |                                         |
| `ph`                             | `pH`                               | same   |                                         |
| `ammonia` (mg/L)                 | `AMMONIA` (mg/l)                   | same   | Neither source says total or un-ionised |
| `nitrite`, `nitrate` (mg/L)      | —                                  | none   | Penang measures them, Q8                |
| `remarks`                        | `REMARKS`                          | same   |                                         |
| — (time is inside `recorded_at`) | `TIME <PERIOD>`                    | same   | Our instant includes the time           |

### 2.5 Feeding event (`feeding_events`) → feed

The shapes differ. The pond book records, per pond per day, up to three feed products, each with its weight in grams.
We record one feeding at a time in kilograms, with a Feed from the site's list and a number of feedings.

| Ours                     | Standard          | Match | Note                                                  |
| ------------------------ | ----------------- | ----- | ----------------------------------------------------- |
| `feed` (was `feed_type`) | `FEED`            | done  | Each site's list, in Airtable; product lists? Q9      |
| (was `feed_type_other`)  | —                 | done  | Removed; old values kept in `remarks`                 |
| `feed_amount_kg`         | `FEED WEIGHT` (g) | unit  | kg → g                                                |
| `feedings_count`         | —                 | none  | The regime's `FREQUENCY` is days between applications |

### 2.6 Mortality record (`mortality_events`) → fish death

Our Mortality record matches the pond book's summary row (`COUNT_DEAD`), since Penang fish are not tagged. Per-fish
rows (`PIT`, DMS `INDIV`) need tagged fish.

| Ours                                  | Standard      | Match  | Note                   |
| ------------------------------------- | ------------- | ------ | ---------------------- |
| `mortality_count`                     | `COUNT_DEAD`  | rename |                        |
| `cause_death` (was `suspected_cause`) | `CAUSE_DEATH` | done   | Values done, see below |
| —                                     | `SPECIES`     | none   | Q7                     |
| `note_death` (was `remarks`)          | `NOTE_DEATH`  | done   |                        |

Causes: done on 2026-10-29. The app offers exactly the DMS's four (`Cull`, `Unknown`, `Disease_parasites`,
`Water_quality`), per Q1. The pond book's longer list (five `Cull_*`, three `*_mortality`, `Missing`) is not offered.

### 2.7 Sampling event + Fish measurement → random sample / measurement

We weigh and measure individual untagged fish. The pond book keeps only count and mean weight per species; the DMS
keeps individual values per tagged fish.

| Ours                                         | Standard                                         | Match  | Note                                                    |
| -------------------------------------------- | ------------------------------------------------ | ------ | ------------------------------------------------------- |
| `sampling_events` (header)                   | Random sample (pond book); `MEASURE_EVENT` (DMS) | rename | No event code for routine growth sampling, Q11          |
| `notes`                                      | `REMARKS` / `NOTE_MEASURE`                       | rename |                                                         |
| `fish_measurements.wt` (was `weight_g`)      | `WT` total weight (g)                            | done   | Same unit                                               |
| `fish_measurements.len_st` (was `length_cm`) | `LEN_ST` standard length (cm)                    | done   | Decided 2026-10-29                                      |
| — (derivable)                                | `SPECIES n COUNT`, `SPECIES n MEAN WEIGHT` (g)   | none   | Count and mean of our weights, once we know the species |
| —                                            | `SPECIES`                                        | none   | Q7                                                      |

### 2.8 Ranges

| Measurement      | Ours (`RANGES` and form schemas) | Pond book bounds               | DMS trait         |
| ---------------- | -------------------------------- | ------------------------------ | ----------------- |
| Dissolved oxygen | 0–20 mg/l                        | 0–50                           | —                 |
| Temperature      | 0–45 °C                          | 0–50                           | —                 |
| pH               | 0–14                             | 0–14                           | —                 |
| Ammonia          | 0–100 mg/l                       | 0–50                           | —                 |
| Nitrite, nitrate | 0–100, 0–500 mg/l                | —                              | —                 |
| Feed             | 0–100 000 kg per feeding         | 0–15 000 g per product per day | —                 |
| Fish weight      | over 0, up to 20 000 g           | mean 0–15 000 g                | `WT` 0–20 000 g   |
| Fish length      | over 0, up to 100 cm (standard)  | —                              | `LEN_ST` 0–100 cm |
| Dead fish count  | 0–1 000 000                      | —                              | —                 |

The bounds differ but nothing conflicts by name. Q8 asks whether program-wide Ranges exist.

### 2.9 What Operators see

| Where       | App label now                                     | Pond book label                                  |
| ----------- | ------------------------------------------------- | ------------------------------------------------ |
| Pond picker | Pond; `Fish Tank 3 - #91`                         | POND; `TAL_01`                                   |
| Period      | Time of day: Morning (AM), Afternoon (PM)         | MORNING, MIDDAY, AFTERNOON                       |
| Tab         | Water quality                                     | WATER CHEMISTRY                                  |
| Readings    | Dissolved oxygen, Temperature, pH, Ammonia (mg/L) | DISOLVED OXYGEN, TEMPERATURE, pH, AMMONIA (mg/l) |
| Tab         | Feeding                                           | FEED                                             |
| Feed        | Feed; Amount fed (kg); Feedings                   | FEED TYPE; FEED WEIGHT (g)                       |
| Tab         | Mortality                                         | FISH DEATH                                       |
| Deaths      | Number of dead fish; Cause of death; Note         | COUNT_DEAD; CAUSE OF DEATH; REMARKS              |
| Tab         | Sampling                                          | RANDOM SAMPLE                                    |
| Sample      | Notes; Total weight (g); Standard length (cm)     | REMARKS; MEAN WEIGHT (g); (DMS: standard length) |
| Free text   | Remarks                                           | REMARKS                                          |

## 3. Renames needed

Proposed targets, assuming the DMS grammar, lowercase in Postgres, and the standard's exact headers in exports (Q2).
Each item names the question it waits on.

1. **Pond identifier** (Q3, Q4): `PEN-FT3-091` → `PEN_091`. To make numbers unique within Penang, keep Fish Tank
   numbers 1–210 as they are (Operators already use them) and move the other areas into free hundreds: Hatchery 301–318,
   Block L 401–424, Aqua 501–524, Water Storage 601–618, Pond 701–702. This changes every event table, Airtable and the
   remembered pond on devices. Drafts and Outbox Records are kept per pond, so do it before go-live or with a mapping
   for devices still holding old codes. The legacy import is unaffected: it maps through legacy location + tank ID.
2. **Pond table**: done (see Status).
3. **Every Record** (Q13): `enumerator` → `person` done (see Status). Open: `pond_code` follows the pond identifier
   (item 1); a name for free text on Water-quality readings, Feeding events and Sampling events; `recorded_at` stays,
   exported as `DATE` + `TIME`.
4. **Water chemistry** (Q8): table `wq_readings` → `water_chemistry`; Period values → `MORNING` / `AFTERNOON` (+
   `MIDDAY`). Reading names stay; keep the correct spelling "dissolved".
5. **Feed** (Q9): `feed_type` → `feed` from each site's list, and `feed_type_other` removed: done (see Status). Open:
   `feed_amount_kg` → `feed_weight` in g. Table name: the DMS already uses `FEED` for its feed codes, so `feed_event`
   rather than `feed`.
6. **Fish death** (Q10): `cause_death`, its values and `note_death` done (see Status). Open: table
   `mortality_events` → `fish_death`; `mortality_count` → `count_dead`; add `species`.
7. **Sampling** (Q11): `wt` and `len_st` done (see Status). Open: add `species`.
8. **Labels Operators see** (Q2): the pond book words in sentence case, e.g. "Water chemistry", "Cause of death",
   "Feed weight (g)", "Remarks", "Pond"; and the pond code in the picker.
9. **Glossary**: rename the terms above (Site and Species added); add Spawn round, PIT, Pond category; add Fish
   transfer, Water transfer, Fertiliser, Treatment, Secchi disc when they are built.

## 4. What the standard has that we don't record yet

| What                      | Standard fields                                                                                            | Note for Penang                                  |
| ------------------------- | ---------------------------------------------------------------------------------------------------------- | ------------------------------------------------ |
| Species on fish records   | `SPECIES` (2-letter code)                                                                                  | Needed for deaths, samples and transfers         |
| Fish transfers            | Date, species, from pond, to pond, to-pond category, count (or PIT per fish)                               | Also stocking at year start and from the nursery |
| Water transfers           | Date, from pond, to pond, pump time (hours)                                                                | `BORE` as source                                 |
| Fertiliser                | Type (list), weight (g), up to 3 per day                                                                   |                                                  |
| Treatments                | Type (list), weight (g), up to 3 per day                                                                   | Lime, salt, antiparasitics                       |
| Secchi disc, water depth  | Time, Secchi disc (cm), water depth (cm)                                                                   |                                                  |
| Midday water chemistry    | Third period with its own time                                                                             |                                                  |
| Random sample per species | Count and mean weight per species                                                                          | Derivable from our fish measurements             |
| Feeding regimes           | Per pond: feed rate (% of body weight / day), frequency; fertiliser and treatment rate (g / decimal / day) | Drives "next application" in the pond book       |
| Pond category             | `NURSERY`, `GROW_OUT`, `BROOD`, …                                                                          | On each transfer                                 |
| Feed composition          | Protein, carbohydrate, fat, ash, moisture (%)                                                              | On the feed list                                 |
| Pond area and position    | `AREA_POND`, `LAT_POND`, `LONG_POND`                                                                       | We have the columns; all empty                   |
| Site details              | Owner, phone, email, position, notes                                                                       | One row for Penang                               |
| Tagged fish               | `PIT`, `INDIV`, spawn round, family                                                                        | Only if Penang works with tagged fish            |

## 5. What we record that the standard doesn't

Nitrite and nitrate; number of feedings; area, zone, unit type, volume, depth, water
source, status and commissioning date of a pond; the legacy location and tank ID; the exact instant of a Record with its
time zone; who saved it (sign-in account) and with which app version. Q14 asks which of these stay and under what names.

## 6. Questions for Matt

Each question has our proposal so a yes is enough.

**Which source**

1. Where the DMS v3 and the 2025 pond book disagree (1.6), which one is the standard? Is there a DMS version newer than
   v3, or a written pond book field list newer than the 2020 guide? **Answered: the DMS wins** (see Status).

**Names**

2. Same words, but may the case differ by place? Neon and Airtable now use lowercase (`lat_pond`), because Postgres
   folds unquoted names to lowercase. _Proposal: lowercase for every database name (`count_dead`), the standard's exact
   headers in Excel exports, sentence case in the app ("Cause of death")._ Export headers follow the DMS style
   (`CAUSE_DEATH`), per Q1. **Decided for the app: standard names in plain words.**

**Ponds**

3. Is `PEN` Penang's site code? Is there a list of the site codes already in use? (`NAME_SITE` is answered: Batu
   Maung.)
4. Penang pond numbers collide across areas (86 of 296). _Proposal: keep Fish Tank numbers 1–210 and renumber the
   other areas in free hundreds (section 3, item 1)._ Zero-padded to three digits (`PEN_091`) or not (`PEN_91`)? Given the one-name
   rule, will Operators call Hatchery tank 1 "301" on site, with new labels on the tanks? **Deferred: dealt with last.**
5. Can the area (Fish Tank 3, Hatchery, …) stay as a grouping in the pond picker and as an extra pond field, or does
   it go? It is how Penang Operators find a tank among 296.
6. Pond area: hectares (DMS) or decimals (pond book)? **Answered: hectares.**

**Species**

7. Which species are in Penang tanks, and what are their codes? Must every Record carry its species, as in the pond
   book? _Proposal: yes for deaths and samples, chosen from the program's species list._

**Water chemistry**

8. Should Penang add a midday reading? May nitrite and nitrate stay, and under which names? Are there program-wide
   Ranges for water chemistry? _Proposal: one shared set; until then, keep ours (narrower than the workbook's 0–50 for
   oxygen and temperature, wider for ammonia)._

**Feed**

9. Record feed per product per day in grams, as the pond book does, instead of per feeding in kilograms? Is the feed
   product list global or per country (the current one has Bangladesh brands)? Are `NAT` / `SUP` still used?

**Deaths**

10. Are count-only rows (no PIT) acceptable as the standard record for untagged fish? (The cause list is settled: the
    app now offers the DMS's four.)

**Sampling**

11. Keep individual weights and lengths (and derive count and mean weight per species), or record only count and mean
    weight? Is there a `MEASURE_EVENT` code for routine growth sampling? (Length is decided: standard length,
    `len_st`.)

**People and notes**

12. `PERSON` now names who recorded a Record and holds the full name (decided). Free text follows `NOTE_<ENTITY>`
    where the DMS has the entity; Water-quality readings, Feeding events and Sampling events keep `remarks` / `notes`
    (decided: the DMS doesn't cover them).

**Dates**

13. Export dates are `YYYYMMDD` text, per Q1. We store the exact instant with its time zone; is a separate `TIME`
    column, in site local time, right?

**Extras**

14. Which of our extras (section 5) may stay, and under what names?

## 7. Scaling to more sites

- Done: one `site` table that ponds and operators point to, and Operators limited to their own sites' ponds.
- Pond codes start with the site code, in our format and in the standard's, so they stay unique across sites.
- Still to do when the export is built: the site's time zone, which the export needs to turn our exact instants into
  the DMS's local dates (`YYYYMMDD`). The DMS has no field for it.
- Done: each site's own feed list, edited in Airtable.

## 8. Tagged fish (later, for Bangladesh)

Penang has no tagged fish today; Bangladesh has. The model can take them by adding to it, without changing what's
there or the Records already stored:

- Identity: the DMS's `INDIV` is the spawn round (`SPAWN_ROUND`, 7 characters, e.g. `C202501`), `_`, and the PIT tag;
  at most 22 characters. It needs a spawn round list (DMS `SPAWN_ROUND`, `NOTE_SPAWN_ROUND`), linked like species.
- Deaths: a Mortality record keeps its count. For tagged fish it also lists each fish's `INDIV`; each becomes one DMS
  death row (`INDIV`, `SPECIES`, `DATE_DEATH`, `CAUSE_DEATH`, `NOTE_DEATH`) with the record's date, cause and note.
- Sampling: each Fish measurement may carry an `INDIV`; its values stay `wt` and `len_st` (DMS traits).
- Species per Record: Bangladesh ponds hold several species (polyculture), so deaths and samples need their own
  `SPECIES`, as in the pond book; today the species is on the pond.
- To settle before building: where the app gets the list of tagged fish (the DMS, the pond book's per-PIT transfers),
  and how Operators read tags.

## Small things noticed in the sources

For Matt, in case they are worth fixing:

- Pond book: "DISOLVED OXYGEN" and "MORTAILITES COUNT" are misspelled; on pond sheets column BK reads "SPECIES 8 MEAN
  WEIGHT" after "SPECIES 7"; midday pH is checked against 0–50 instead of 0–14; `PONDS` lists TAL_38 twice; HAI_00's
  latitude has a trailing comma; TAL_01's first random sample uses common names ("Catla", "Grass carp") rather than
  list values.
- DMS v3: `DATE_DEATH` is defined as "date of spawn release/dissemination"; Table 27 is captioned 'trait' but shows
  `pond_treat`; in Table 3 `spawn_round` repeats `sample`'s description; `CAUSE_DEATH` is 22 characters, shorter than
  `Cull_post_harvest_measure`; the `sample` example has `SITE_SAMPLE` and `NOTE_SAMPLE`, which Table 29 doesn't list.
