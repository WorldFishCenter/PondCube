# Naming alignment with the WorldFish GIP data standard

Draft for review with Matt Hamilton, 2026-10-29; updated to DMS Version 5 on 2026-10-30. What has already changed is
under Status.

At the 2026-10-29 demo Matt asked that every genetic improvement program (GIP) site (Penang, Bangladesh, Egypt,
Zambia) use one set of names and identifiers, including the names Operators see in the app. This document maps PondCube
Collect's names onto that standard, lists the renames, lists what the standard records that we don't, and ends with the
questions only Matt can answer. Renames should land before Penang go-live: after that, a pond rename strands Drafts
and Outbox Records on devices. Data links are already open, so a column rename breaks the Excel queries built on it;
those get reshaped when it happens.

**Sources read**

- **DMS**: Hamilton MG. 2025. _WorldFish Genetic Improvement Program Data Management Systems (Version 5): Data
  input._ All 55 pages, including the database schema in Annex 1. It covers carp, GIFT tilapia, Abbassa (GIANT)
  tilapia and other tilapia species. It replaces Version 3 (Hamilton 2021, carp only, 49 pages), which this document
  first used; what changed is under Status.
- **Pond book**: `2025 CGIP pond book.xlsm`, the Bangladesh workbook in current use (Talbaria site, 51 sheets). Read
  cell by cell with openpyxl; macros were not run. Dropdown lists and Excel validation bounds were read from the sheet
  XML.
- Not read: the public 2020 pond book guide (Hamilton et al. 2020, doi:10.7910/DVN/DBN1UD).

**Our side**: `docs/glossary.md`, `lib/schema.ts`, `lib/options.ts`, `lib/validation.ts`, the form labels in
`components/collection/`, and the 296 Penang ponds in the dev database.

## Status

**Answered on 2026-10-29**

- Q1: where the DMS and the pond book disagree, the DMS wins. From the table in 1.6, that settles: a pond is `SITE`
  plus `POND_NEST` (a whole number below 1000, unique within the site); species are written `CC`; causes of death are
  the DMS's (eleven in v5); export headers look like `CAUSE_DEATH`; export dates are `YYYYMMDD` text.
- Q3 (in part): Penang's `NAME_SITE` is "Batu Maung". Whether `PEN` is its `SITE` code is still open.
- Q6: pond area is in hectares.

**Changed on 2026-10-30: DMS Version 5.** Every name the app already uses is the same in v5 (`SITE`, `POND_NEST`,
`NAME_SITE`, `SPECIES`, `FEED`, `PERSON`, `CAUSE_DEATH`, `NOTE_DEATH`, `WT`, `LEN_ST`, `YYYYMMDD` dates). Two things
changed in the app (version 0.10.0):

- Causes of death: v5 has eleven, and the app offers exactly those, as written: `Cull_post_harvest_measure`,
  `Cull_post_mating`, `Cull_final`, `Cull_other`, `Disease_parasites`, `Handling_mortality`, `Measurement_mortality`,
  `Missing`, `Tagging_mortality`, `Unknown`, `Water_quality`. v3's plain `Cull` is gone. No Record used it (testing
  phase), so nothing was converted. A pre-0.8.0 Draft's `handling` now reads as `Handling_mortality`.
- Sampling export: every row carries `MEASURE_EVENT` = `MONITOR`, v5's measurement event for "Routine monitoring of
  ponds". This answers Q11's event code.

v5 also adds what the app doesn't record yet: fish transfers per tagged fish (`fish_trans`, with a cohort,
`COHORT_DESC`), the total length trait `LEN_TOT`, and `PRIMARY_TR` on traits (see 1.4, 1.5, 4 and 8). Unlike v3, it no
longer says that pond environment and management data live in a separate system, but it still has no tables for them
(no water chemistry, no daily feed).

**Changed on 2026-10-29**: the pond fields the DMS names.

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

Also changed (app version 0.8.0): the causes of death an Operator can pick became v3's four, stored and shown as the
DMS writes them: `Cull`, `Unknown`, `Disease_parasites`, `Water_quality` (v5's eleven since 0.10.0, see above). The
app's earlier six (disease, predation, handling, water_quality, unknown, other) came with its first version, not from
Penang, and no Record used them.

Also changed: the Record fields the DMS names. Done in the code and the Neon dev database; production follows with
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
- Ranges for fish measurements follow the DMS trait list: `wt` 0–20,000 g (v3's example; v5's example doesn't list
  `WT`), `len_st` 0–100 cm (both versions).
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

**Changed on 2026-11-06 (version 0.12.0)**: a Feeding event follows the pond book at every site: one Feed (now
required) and its weight in grams, `feed_weight` (was `feed_amount_kg`, kg), over 0 and up to 15 000 g; the number of
feedings is gone (see 2.5). No Feeding event was stored on dev or production, so nothing was converted. Drafts and
Outbox Records saved before it are read in grams, with their number of feedings in the remarks.

**Also in 0.12.0 (2026-11-06)**: a Mortality record names its species (`species`, `SPECIES`, now required) and may
name one tagged fish by its `pit` (the pond book's `PIT`; the count is then 1), at every site (see 2.6 and 8). Both are
new columns, so nothing stored changes; no Mortality record existed on dev or production. One saved on a device before
it gets its pond's species when the pond lists exactly one, else none.

**Also in 0.12.0 (2026-11-10)**: two new Record kinds shaped like the Feeding event, Fertiliser events and Treatment
events: one item of the site's list and its weight in grams (`fert_weight`, `treatment_weight`), over 0 and up to
100 000 g, the pond book's bound per type per day, with `remarks` (see 2.5). Each site has its own lists in Airtable
(`fertilisers`, `treatments`), synced like feeds. Fertilisers follow the DMS `fert` load file (`fert`, up to four
characters, and `note_fert`). Treatments have no DMS list, and the DMS's `treatment` is a progeny-test design, so the
app keeps the pond book's word, identifies each by the pond book's name, and marks the export headers provisional (Q15).
Talbaria's lists come from the 2025 pond book (1.5); Penang has neither, so its Operators see no Fertiliser or
Treatment tab (Matt: lime and fertiliser aren't used there). Data links get two files, `fertiliser.csv` and
`treatment.csv`, laid out like the feeding file.

**Waiting for Matt**: the rest of this document. First the site code and the pond numbers (Q3, Q4). Then the Record
fields and their values. Each further rename also needs Records still waiting on devices read under the new names, as
was done for this one.

## Summary

- The standard has two layers. The DMS is the genetics database: individual fish, families, spawning, deaths,
  transfers, measurements. v3 said pond environment and management data live in a separate system, the pond book,
  which records water chemistry, feed, fertiliser, treatments, fish and water transfers, deaths and random samples per
  pond per day; v5 drops that sentence but still has no tables for them. Our six Record kinds belong to the pond
  book's layer. The DMS supplies the naming grammar and identifier formats.
- Most of our terms have a standard equivalent with the same meaning and a different name. The units mostly agree:
  mg/l, °C, g, cm.
- **Pond codes are the hardest change.** We use `PEN-FT3-091` (site, area, number). The standard identifies a pond
  by site plus a number unique within the site, written `TAL_01`. Penang's 296 ponds use only 210 distinct numbers:
  Fish Tanks 1–3 share one run (1–210), but Hatchery, Block L, Aqua, Water Storage and Pond each restart at 1. So 86
  ponds need new numbers (Q4).
- Only Mortality records carry a **species** (since 0.12.0). In the standard, every death, transfer and sample row
  does.
- Values that differ: Period (morning/afternoon vs morning/midday/afternoon). Feed matches the pond book since 0.12.0:
  grams per feed. Mortality causes now match the DMS's eleven.
- The two sources disagree with each other on a few points: pond area unit, species value, one death cause, pond
  category, header spelling. The DMS wins (Q1).
- The standard records things we don't yet: fish transfers, water transfers, Secchi disc and water depth, per-species random samples, pond category (the DMS's cohort).

## 1. The standard

### 1.1 Naming grammar

| Rule                                                                                       | Examples                                                                  | Source    |
| ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------- | --------- |
| Field names are UPPER_SNAKE, attribute first, entity last                                  | `DATE_DEATH`, `CAUSE_DEATH`, `LAT_POND`, `AREA_POND`, `NAME_SITE`         | DMS       |
| Free text is `NOTE_<ENTITY>`                                                               | `NOTE_POND`, `NOTE_DEATH`, `NOTE_MEASURE`                                 | DMS       |
| `_NEST` marks an identifier that is unique only inside its parent                          | `POND_NEST` within `SITE`; `FAM_NEST` within `SPAWN_ROUND` + `SPECIES`    | DMS       |
| A pond in a role takes the role as suffix                                                  | `SITE_GROWOUT` + `POND_NEST_GROWOUT`; `SITE_NURSE` + `POND_NEST_NURSE`    | DMS       |
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
| Measurement event        | Short code                                                                | `TAG`, `HARV`, `POST_HARV`, `MONITOR`                   |
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

| Load file                   | Fields                                                                                                                                                                                                                                            |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `site`                      | `SITE`, `NAME_SITE` (closest town or village on Google Maps), `OWNER_SITE`, `PHONE_SITE`, `EMAIL_SITE`, `LAT_SITE`, `LONG_SITE`, `NOTE_SITE`                                                                                                      |
| `pond_desc`                 | `SITE`, `POND_NEST`, `AREA_POND` (ha), `LAT_POND`, `LONG_POND`, `NOTE_POND`                                                                                                                                                                       |
| `species`                   | `SPECIES`, `SPECIES_LATIN`                                                                                                                                                                                                                        |
| `death`                     | `INDIV`, `SPECIES`, `DATE_DEATH`, `CAUSE_DEATH` (eleven values, see Status), `NOTE_DEATH`                                                                                                                                                         |
| `fish_trans` (new in v5)    | `INDIV`, `COHORT_DESC`, `DATE_FISH_TRANS`, `SITE_FISH_TRANS`, `POND_NEST_FISH_TRANS`, `SPECIES`: one row per tagged fish moved                                                                                                                    |
| `indiv_stock`               | `INDIV`, `DATE_FISH_TRANS`, `COHORT_DESC`, `SITE_FISH_TRANS`, `HAPA_NEST`, `POND_NEST_FISH_TRANS`, `SELECTION_TAG`: tagged fish into a grow-out pond                                                                                              |
| `measure_data`              | `INDIV`, `MEASURE_EVENT`, one column per trait (`WT`, `LEN_ST`, `WIDTH`, `DEPTH`, …), `PERSON`, `NOTE_MEASURE`, `DATE_MEASURE`                                                                                                                    |
| `measure_event`             | `MEASURE_EVENT`, `ALLOW_REPEAT`, `NOTE_MEASURE_EVENT`. Examples: `TAG`, `HARV`, `POST_HARV`, `MONITOR` ("Routine monitoring of ponds", repeatable)                                                                                                |
| `trait`                     | `TRAIT`, `NAME_TRAIT`, `UNITS`, `MIN`, `MAX`, `TYPE`, `CATEGORY`, `BODY_PART`, `PRIMARY_TR` (new in v5), `NOTE_TRAIT`. Examples: `WT` total weight, g, 0–20 000 (v3); `LEN_ST` standard length, cm, 0–100; `LEN_TOT` total length, cm, 0–100 (v5) |
| `feed`, `fert`, `treatment` | Treatment codes for progeny tests (`CULTURE` M/P, `FEED`, `FERT`, `NEST_TREAT`), not daily applications. Our feed and fertiliser lists borrow `FEED` and `FERT`; `treatment` clashes (Q15)                                                        |

The rest of the DMS (spawning, tagging, families, hapas, founders, EBVs, tissue samples, dissemination) is genetics work
outside PondCube Collect.

### 1.5 Controlled lists (pond book)

- **Species**: `CC` Catla (_Catla catla_), `HM` Silver carp (_Hypophthalmichthys molitrix_), `LR` Rohu (_Labeo
  rohita_), `CI` Grass carp (_Ctenopharyngodon idella_), `MP` Black carp (_Mylopharyngodon piceus_), `CH` Chital
  (_Chitala chitala_), `BG` Raj puti (_Barbonymus gonionotus_), `MR` Mrigal (_Cirrhinus cirrhosus_). Shown in cells as
  `CC (catla)`.
- **Cause of death**: `Cull_post_harvest_measure`, `Cull_post_mating`, `Cull_final`, `Cull_backup`, `Cull_other`,
  `Handling_mortality`, `Tagging_mortality`, `Measurement_mortality`, `Unknown`, `Disease_parasites`, `Water_quality`,
  `Missing` (not found when the pond was drained or netted, assumed dead). The DMS v5 has the same list without
  `Cull_backup`.
- **Pond category**: `NURSERY`, `GROW_OUT`, `BROOD`, `PARENTS`, `BACKUP`, `OTHER`, `PREGROWOUT`. It describes what a
  pond is used for and is recorded on each transfer, not on the pond. The DMS v5 records a cohort on each transfer
  instead, `COHORT_DESC`: `PREGROWOUT`, `GROWOUT`, `TRIAL`, `BACKUP`, `BROOD`, `PARENTS`, `OTHER`.
- **Feed type**: product names with composition (protein, carbohydrate, fat, ash, moisture %): Mega Nursery Powder,
  Mega Pre Starter, Mega Carp Grower, Nutri-egg, Tiger nursery feed.
- **Fertiliser type**: Urea, TSP (Triple Super Phosphate), MOC (Mixed Oilseed Cake), Yeast (_Saccharomyces
  cerevisiae_ with vegetable oil, sorbitan monostearate, ascorbic acid, arabic gum), Molasses, Rice_Polish (rice
  polish). Used in 2025: MOC 106, Urea 102, TSP 99 pond-days. In the app (Talbaria's list) as `UREA`, `TSP`, `MOC`,
  `YEAS`, `MOLA`, `RICE`; the last three are made up ("Code provisional" in `note_fert`).
- **Treatment type**: Lime (calcium carbonate), Timsen (n-alkyl dimethyl benzyl ammonium chloride), Acimec (ivermectin
  BP), Salt (sodium chloride), TSC (tea seed cake), Paratics (deltamethrin). Used in 2025: Paratics 170, Lime 86, Salt
  72, TSC 10 pond-days. In the app (Talbaria's list) by these names.
- **Period**: MORNING, MIDDAY, AFTERNOON (column groups, each with its own time).
- **Measurement event** (DMS): `TAG`, `HARV`, `POST_HARV`, and in v5 `MONITOR`.

### 1.6 Where the two sources disagree

| Topic             | DMS v5                                                                                 | Pond book                                                         |
| ----------------- | -------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| Pond identifier   | Two fields, `SITE` + `POND_NEST`                                                       | One value, `TAL_01`                                               |
| Pond area unit    | Hectares (but the example values, 35, 36, 42, look like decimals)                      | Decimals                                                          |
| Species value     | `CC`                                                                                   | `CC (catla)`                                                      |
| Causes of death   | 11: the pond book's list without `Cull_backup` (v3 had 4: `Cull`, `Unknown`, …)        | 12 (above)                                                        |
| Transfer category | `COHORT_DESC`: `PREGROWOUT`, `GROWOUT`, `TRIAL`, `BACKUP`, `BROOD`, `PARENTS`, `OTHER` | `TO POND CATEGORY`: adds `NURSERY`, spells `GROW_OUT`, no `TRIAL` |
| Header style      | `CAUSE_DEATH`, `DATE_DEATH`                                                            | `CAUSE OF DEATH`, `DATE`, `COUNT_DEAD`                            |
| Date              | Text `YYYYMMDD`                                                                        | Excel date                                                        |

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
| Feeding event                 | Feed                                               | rename | One feed per Record, as in the pond book, 2.5                |
| Fertiliser, Fertiliser event  | `FERT`; Fertiliser (pond book)                     | rename | One fertiliser per Record, 2.5                               |
| Treatment, Treatment event    | Treatment (pond book); DMS `treatment` differs     | none   | One treatment per Record, 2.5; the name clashes, Q15         |
| Mortality record              | Fish death (summary row)                           | rename |                                                              |
| Sampling event                | Random sample (pond book); measurement event (DMS) | rename | Exported as `MEASURE_EVENT` `MONITOR` (v5); Q11              |
| Fish measurement              | Trait values `WT`, `LEN_ST`                        | rename |                                                              |
| Recorded-at                   | `DATE` (+ `TIME` for water chemistry)              | rename | We keep the exact instant; the standard keeps a date. Q13    |
| Range                         | Trait `MIN` / `MAX`; workbook validation bounds    | same   | 2.8                                                          |
| Draft, Outbox, Record intake  | —                                                  | none   | App concepts                                                 |
| Site, Species                 | `SITE`, `SPECIES`                                  | done   | Added to our glossary                                        |
| —                             | Spawn round, PIT, cohort (pond category)           | —      | Missing from our glossary                                    |

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
| `species` on Mortality records | `SPECIES`                                | part   | Deaths done (0.12.0); transfers and samples, Q7                   |
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

### 2.5 Feeding, Fertiliser and Treatment events → feed, fertiliser, treatment

The DMS has no daily feed table. The pond book records, per pond per day, up to three feeds, each a type and its weight
in grams; feed is Talbaria's daily routine (6,287 pond-days in 2025). Since 0.12.0 (decided 2026-11-06, every site) a
Feeding event is one of those feeds: its Pond, its Feed (required) and its weight in grams. Three feeds on a day are
three Feeding events. Each sets its own Recorded-at above the form, as before.

| Ours                                 | Standard               | Match | Note                                                                         |
| ------------------------------------ | ---------------------- | ----- | ---------------------------------------------------------------------------- |
| `feed` (was `feed_type`)             | `FEED` / `FEED n TYPE` | done  | Required; each site's list, in Airtable; product lists? Q9                   |
| (was `feed_type_other`)              | —                      | done  | Removed; old values kept in `remarks`                                        |
| `feed_weight` (was `feed_amount_kg`) | `FEED n WEIGHT` (g)    | done  | Grams, over 0 up to 15,000 (the pond book's bound); `FEED_WEIGHT` in exports |
| (was `feedings_count`)               | —                      | done  | Removed; on devices, an old number goes in `remarks`                         |
| `remarks`                            | `REMARKS`              | same  |                                                                              |

Fertiliser events (`fertiliser_events`) and Treatment events (`treatment_events`), since 0.12.0, have the same shape:
the pond book's `FERTILISER n TYPE` / `WEIGHT` and `TREATMENT n TYPE` / `WEIGHT` (g), up to three a day, each its own
Record. They are recorded only at sites with that list (Talbaria; not Penang).

| Ours                                      | Standard                                      | Match  | Note                                                          |
| ----------------------------------------- | --------------------------------------------- | ------ | ------------------------------------------------------------- |
| `fert` (list `fert`: `fert`, `note_fert`) | `FERT`, `NOTE_FERT` / `FERTILISER n TYPE`     | same   | Up to four characters; each site's list, in Airtable          |
| `fert_weight`                             | `FERTILISER n WEIGHT` (g)                     | rename | Over 0 up to 100,000 g; `FERT_WEIGHT` in exports, provisional |
| `treatment` (list `treatment`)            | `TREATMENT n TYPE`; not the DMS's `treatment` | none   | The pond book's name, e.g. Lime; `TREATMENT` provisional, Q15 |
| `treatment_weight`                        | `TREATMENT n WEIGHT` (g)                      | rename | Over 0 up to 100,000 g; `TREATMENT_WEIGHT`, provisional       |
| `remarks`                                 | `REMARKS`                                     | same   |                                                               |

### 2.6 Mortality record (`mortality_events`) → fish death

Since 0.12.0 our Mortality record is either of the pond book's two fish death rows, at every site: the summary row
(`COUNT_DEAD` of one species) or, with a PIT, the per-fish row (one tagged fish, count 1). Penang fish are PIT-tagged
once big enough, as Bangladesh's are. The DMS `death` row names the fish by `INDIV` (spawn round + PIT), which the app
doesn't work out yet (see 8).

| Ours                                  | Standard                              | Match  | Note                                                                        |
| ------------------------------------- | ------------------------------------- | ------ | --------------------------------------------------------------------------- |
| `species`                             | `SPECIES`                             | done   | Required; the pond's species, or any when it lists none; shown "CC (Catla)" |
| `pit`                                 | `PIT` (pond book); DMS `INDIV` (part) | done   | Optional: 10 characters, 0–9 and A–F, stored uppercase; then the count is 1 |
| `mortality_count`                     | `COUNT_DEAD`                          | rename |                                                                             |
| `cause_death` (was `suspected_cause`) | `CAUSE_DEATH`                         | done   | Values done, see below                                                      |
| `note_death` (was `remarks`)          | `NOTE_DEATH`                          | done   |                                                                             |

The export headers are `SPECIES` and `PIT` (`PIT` is a provisional name: the DMS has only `INDIV`), after `POND`. A
Mortality record saved on a device before 0.12.0 has no species: it takes its pond's when the pond lists exactly one,
else none. PIT format: 99.9% of the 2025 pond book's 94 000 PITs are 10 hexadecimal characters; the rest are typos
(`7D1`, `7973855`, `0007AF382`).

Causes: done on 2026-10-29, moved to v5 on 2026-10-30. The app offers exactly the DMS v5's eleven (see Status), per
Q1. The pond book's `Cull_backup`, not in v5, is not offered.

### 2.7 Sampling event + Fish measurement → random sample / measurement

We weigh and measure individual untagged fish. The pond book keeps only count and mean weight per species; the DMS
keeps individual values per tagged fish.

| Ours                                         | Standard                                         | Match  | Note                                                    |
| -------------------------------------------- | ------------------------------------------------ | ------ | ------------------------------------------------------- |
| `sampling_events` (header)                   | Random sample (pond book); `MEASURE_EVENT` (DMS) | done   | Exported with `MEASURE_EVENT` `MONITOR` (v5)            |
| `notes`                                      | `REMARKS` / `NOTE_MEASURE`                       | rename |                                                         |
| `fish_measurements.wt` (was `weight_g`)      | `WT` total weight (g)                            | done   | Same unit                                               |
| `fish_measurements.len_st` (was `length_cm`) | `LEN_ST` standard length (cm)                    | done   | Decided 2026-10-29                                      |
| — (derivable)                                | `SPECIES n COUNT`, `SPECIES n MEAN WEIGHT` (g)   | none   | Count and mean of our weights, once we know the species |
| —                                            | `SPECIES`                                        | none   | Q7                                                      |

### 2.8 Ranges

| Measurement      | Ours (`RANGES` and form schemas) | Pond book bounds               | DMS trait            |
| ---------------- | -------------------------------- | ------------------------------ | -------------------- |
| Dissolved oxygen | 0–20 mg/l                        | 0–50                           | —                    |
| Temperature      | 0–45 °C                          | 0–50                           | —                    |
| pH               | 0–14                             | 0–14                           | —                    |
| Ammonia          | 0–100 mg/l                       | 0–50                           | —                    |
| Nitrite, nitrate | 0–100, 0–500 mg/l                | —                              | —                    |
| Feed             | over 0, up to 15 000 g per feed  | 0–15 000 g per product per day | —                    |
| Fertiliser       | over 0, up to 100 000 g          | 0–100 000 g per type per day   | —                    |
| Treatment        | over 0, up to 100 000 g          | 0–100 000 g per type per day   | —                    |
| Fish weight      | over 0, up to 20 000 g           | mean 0–15 000 g                | `WT` 0–20 000 g (v3) |
| Fish length      | over 0, up to 100 cm (standard)  | —                              | `LEN_ST` 0–100 cm    |
| Dead fish count  | 0–1 000 000                      | —                              | —                    |

The bounds differ but nothing conflicts by name. Q8 asks whether program-wide Ranges exist.

### 2.9 What Operators see

| Where       | App label now                                                  | Pond book label                                   |
| ----------- | -------------------------------------------------------------- | ------------------------------------------------- |
| Pond picker | Pond; `Fish Tank 3 - #91`                                      | POND; `TAL_01`                                    |
| Period      | Time of day: Morning (AM), Afternoon (PM)                      | MORNING, MIDDAY, AFTERNOON                        |
| Tab         | Water quality                                                  | WATER CHEMISTRY                                   |
| Readings    | Oxygen (mg/L), Temperature, pH, Ammonia (mg/L)                 | DISOLVED OXYGEN, TEMPERATURE, pH, AMMONIA (mg/l)  |
| Tab         | Feeding                                                        | FEED                                              |
| Feed        | Feed; Feed weight (g)                                          | FEED TYPE; FEED WEIGHT (g)                        |
| Tab         | Fertiliser (only at a site with a list)                        | FERTILISER                                        |
| Fertiliser  | Fertiliser; Fertiliser weight (g)                              | FERTILISER TYPE; FERTILISER WEIGHT (g)            |
| Tab         | Treatment (only at a site with a list)                         | TREATMENT                                         |
| Treatment   | Treatment; Treatment weight (g)                                | TREATMENT TYPE; TREATMENT WEIGHT (g)              |
| Tab         | Mortality                                                      | FISH DEATH                                        |
| Deaths      | Species; PIT tag; Number of dead fish; Cause of death; Remarks | SPECIES; PIT; COUNT_DEAD; CAUSE OF DEATH; REMARKS |
| Tab         | Sampling                                                       | RANDOM SAMPLE                                     |
| Sample      | Remarks; Total weight (g); Standard length (cm)                | REMARKS; MEAN WEIGHT (g); (DMS: standard length)  |
| Free text   | Remarks                                                        | REMARKS                                           |

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
5. **Feed** (Q9): `feed_type` → `feed` from each site's list, `feed_type_other` removed, and `feed_amount_kg` →
   `feed_weight` in g: done (see Status and 2.5). The table stays `feeding_events`.
6. **Fish death** (Q10): `cause_death`, its values and `note_death` done (see Status). Open: table
   `mortality_events` → `fish_death`; `mortality_count` → `count_dead`. `species` and `pit` added (0.12.0).
7. **Sampling** (Q11): `wt`, `len_st` and the `MONITOR` event done (see Status). Open: add `species`.
8. **Labels Operators see** (Q2): the pond book words in sentence case, e.g. "Water chemistry", "Cause of death",
   "Feed weight (g)", "Remarks", "Pond"; and the pond code in the picker.
9. **Glossary**: rename the terms above (Site and Species added); add Spawn round, PIT, cohort; add Fish
   transfer, Water transfer, Fertiliser, Treatment, Secchi disc when they are built.

## 4. What the standard has that we don't record yet

| What                      | Standard fields                                                                                                   | Note for Penang                                  |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------- | ------------------------------------------------ |
| Species on fish records   | `SPECIES` (2-letter code)                                                                                         | Deaths done (0.12.0); samples and transfers next |
| Fish transfers            | Date, species, from pond, to pond, to-pond category, count (or PIT per fish); DMS v5 `fish_trans` per tagged fish | Also stocking at year start and from the nursery |
| Water transfers           | Date, from pond, to pond, pump time (hours)                                                                       | `BORE` as source                                 |
| Secchi disc, water depth  | Time, Secchi disc (cm), water depth (cm)                                                                          |                                                  |
| Midday water chemistry    | Third period with its own time                                                                                    |                                                  |
| Random sample per species | Count and mean weight per species                                                                                 | Derivable from our fish measurements             |
| Feeding regimes           | Per pond: feed rate (% of body weight / day), frequency; fertiliser and treatment rate (g / decimal / day)        | Drives "next application" in the pond book       |
| Cohort (pond category)    | DMS `COHORT_DESC`: `PREGROWOUT`, `GROWOUT`, `BROOD`, …                                                            | On each transfer; the DMS list wins (1.6)        |
| Feed composition          | Protein, carbohydrate, fat, ash, moisture (%)                                                                     | On the feed list                                 |
| Pond area and position    | `AREA_POND`, `LAT_POND`, `LONG_POND`                                                                              | We have the columns; all empty                   |
| Site details              | Owner, phone, email, position, notes                                                                              | One row for Penang                               |
| Tagged fish               | `PIT`, `INDIV`, spawn round, family                                                                               | Penang tags too; `PIT` on deaths done (0.12.0)   |

## 5. What we record that the standard doesn't

Nitrite and nitrate; area, zone, unit type, volume, depth, water
source, status and commissioning date of a pond; the legacy location and tank ID; the exact instant of a Record with its
time zone; who saved it (sign-in account) and with which app version. Q14 asks which of these stay and under what names.

## 6. Questions for Matt

Each question has our proposal so a yes is enough.

**Which source**

1. Where the DMS and the 2025 pond book disagree (1.6), which one is the standard? Is there a DMS version newer than
   v3, or a written pond book field list newer than the 2020 guide? **Answered: the DMS wins** (see Status), and the
   current DMS is Version 5 (2025).

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
   it go? It is how Penang Operators find a tank among 296, and since app version 0.11.0 how they walk a Round on the
   Water tab, so a "no" needs another way to walk the ponds.
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
   **Decided on our side (2026-11-06): grams per feed, as the pond book** (2.5). The lists stay open: Penang's has
   only `NAT` / `SUP`, the DMS's examples.

**Deaths**

10. Are count-only rows (no PIT) acceptable as the standard record for untagged fish? (The cause list is settled: the
    app now offers the DMS v5's eleven.)

**Sampling**

11. Keep individual weights and lengths (and derive count and mean weight per species), or record only count and mean
    weight? (Length is decided: standard length, `len_st`. The event code is answered by v5: `MONITOR`, routine
    monitoring of ponds.)

**People and notes**

12. `PERSON` now names who recorded a Record and holds the full name (decided). Free text follows `NOTE_<ENTITY>`
    where the DMS has the entity; Water-quality readings, Feeding, Fertiliser and Treatment events and Sampling events keep `remarks` / `notes`
    (decided: the DMS doesn't cover them).

**Dates**

13. Export dates are `YYYYMMDD` text, per Q1. We store the exact instant with its time zone; is a separate `TIME`
    column, in site local time, right?

**Extras**

14. Which of our extras (section 5) may stay, and under what names?

**Fertiliser and treatment**

15. The DMS's `treatment` (and `pond_treat`) is a progeny-test design; the pond book's TREATMENT is something given to a
    pond (lime, salt, an antiparasitic). The app keeps the pond book's word: Treatment events, a `treatment` list by
    the pond book's names, and export headers `TREATMENT` and `TREATMENT_WEIGHT`, marked provisional. Which name should
    these have in the standard? And are fertiliser codes of up to four characters right (`UREA`, `TSP`, `MOC`; `YEAS`,
    `MOLA`, `RICE` made up), with `FERT_WEIGHT` for the grams? _Proposal: keep "Treatment" in the app and rename only
    the export headers, once, to whatever you choose; confirm or replace the made-up fertiliser codes._

## 7. Scaling to more sites

- Done: one `site` table that ponds and operators point to, and Operators limited to their own sites' ponds.
- Pond codes start with the site code, in our format and in the standard's, so they stay unique across sites.
- Done: each site's time zone (`timezone`, an IANA name, in the Airtable `sites` table), which the exports use to
  turn our exact instants into the DMS's local dates (`YYYYMMDD`). The DMS has no field for it.
- Done: each site's own feed, fertiliser and treatment lists, edited in Airtable. A site without a fertiliser or
  treatment list shows no such tab: the first screen that differs by site.

## 8. Tagged fish

Both sites tag: every Penang fish is PIT-tagged once big enough (Matt, 2026-11-06), and Bangladesh's are. The model
takes them by adding to it, without changing what's there or the Records already stored:

- Identity: the DMS's `INDIV` is the spawn round (`SPAWN_ROUND`, 7 characters, e.g. `C202501`), `_`, and the PIT tag;
  at most 22 characters. It needs a spawn round list (DMS `SPAWN_ROUND`, `NOTE_SPAWN_ROUND`), linked like species.
- Deaths: done in part (0.12.0). A Mortality record has its `species` and, for a tagged fish, its `pit`; it is then
  that one fish (count 1), like a row of the pond book's FISH DEATH log and of the DMS `death` table. Talbaria logged
  18 025 such rows in 2025, about 1 400 of them not culls. Not yet: the fish's `INDIV` (spawn round + PIT, since tags
  are reused), which makes the record a DMS death row (`INDIV`, `SPECIES`, `DATE_DEATH`, `CAUSE_DEATH`,
  `NOTE_DEATH`); importing a tag reader's files in bulk; photos.
- Sampling: each Fish measurement may carry an `INDIV`; its values stay `wt` and `len_st` (DMS traits), under the
  `MONITOR` event, which may repeat on the same fish.
- Transfers, when built: one DMS v5 `fish_trans` row per tagged fish (`INDIV`, `COHORT_DESC`, `DATE_FISH_TRANS`,
  `SITE_FISH_TRANS`, `POND_NEST_FISH_TRANS`, `SPECIES`); stocking into a grow-out pond is `indiv_stock`.
- Species per Record: Bangladesh ponds hold several species (polyculture), so deaths and samples need their own
  `SPECIES`, as in the pond book. Deaths have it since 0.12.0; samples still take the pond's.
- To settle before building `INDIV`: where the app gets the list of tagged fish (the DMS, the pond book's per-PIT
  transfers). How Operators read tags is still open: the PIT is a plain text field, so a reader that types into the
  phone works with no extra code.

## Small things noticed in the sources

For Matt, in case they are worth fixing:

- Pond book: "DISOLVED OXYGEN" and "MORTAILITES COUNT" are misspelled; on pond sheets column BK reads "SPECIES 8 MEAN
  WEIGHT" after "SPECIES 7"; midday pH is checked against 0–50 instead of 0–14; `PONDS` lists TAL_38 twice; HAI_00's
  latitude has a trailing comma; TAL_01's first random sample uses common names ("Catla", "Grass carp") rather than
  list values.
- DMS v5 (still there): `CAUSE_DEATH` is `VARCHAR(22)`, shorter than its own `Cull_post_harvest_measure` (25
  characters); the `pond_desc` example areas (35, 36, 42) look like decimals, not hectares; `ALLOW_REPEAT` is a
  boolean (`TRUE`/`FALSE`) but its definition says a `TAG` event "would be 0"; `indiv_stock` allows five `COHORT_DESC`
  values, `fish_trans` seven (adds `BROOD`, `PARENTS`).
- DMS v3 (fixed in v5): `DATE_DEATH` was defined as "date of spawn release/dissemination"; a table captioned 'trait'
  showed `pond_treat`; in Table 3 `spawn_round` repeated `sample`'s description; the `sample` example had `SITE_SAMPLE`
  and `NOTE_SAMPLE`, which its table didn't list.
