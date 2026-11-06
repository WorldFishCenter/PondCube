import { and, eq, notExists, sql, type Column, type SQL } from "drizzle-orm";
import {
  alias,
  pgTable,
  pgView,
  text,
  integer,
  doublePrecision,
  timestamp,
  date,
  boolean,
  uuid,
  type AnyPgColumn,
  type PgSelectQueryBuilder,
} from "drizzle-orm/pg-core";
import { NOON } from "./options";

// ---- Sites (mirrors the Airtable sites table; WorldFish DMS v5 SITE) ----
// The DMS requires owner, contact and position too; empty here until they're known.
export const site = pgTable("site", {
  site: text("site").primaryKey(), // three uppercase letters, e.g. PEN
  nameSite: text("name_site").notNull(),
  ownerSite: text("owner_site"),
  phoneSite: text("phone_site"),
  emailSite: text("email_site"),
  latSite: doublePrecision("lat_site"),
  longSite: doublePrecision("long_site"),
  noteSite: text("note_site"),
  timezone: text("timezone").notNull(), // IANA, e.g. Asia/Kuala_Lumpur: the exports' local DATE and TIME. Not in the DMS
});

// ---- Species (mirrors the Airtable species table; WorldFish DMS v5 SPECIES) ----
export const species = pgTable("species", {
  species: text("species").primaryKey(), // two uppercase letters, e.g. ON
  speciesLatin: text("species_latin").notNull().unique(),
  speciesCommon: text("species_common"),
});

// ---- Feeds (mirrors the Airtable feeds table; WorldFish DMS v5 FEED) ----
export const feed = pgTable("feed", {
  feed: text("feed").primaryKey(), // three characters, e.g. SUP
  noteFeed: text("note_feed"),
  // ponytail: no FK on array items, as for operators.sites. Empty once removed from Airtable: offered nowhere.
  sites: text("sites").array().notNull(), // the sites that use it
});

// ---- Ponds (mirrors the Airtable ponds table; WorldFish DMS v5 names where it has one) ----
export const pond = pgTable("pond", {
  pondCode: text("pond_code").primaryKey(), // DMS SITE_POND, e.g. TAL_01; Penang still PEN-FT3-091
  displayName: text("display_name").notNull(),
  site: text("site")
    .notNull()
    .references(() => site.site),
  area: text("area").notNull(),
  areaCode: text("area_code"), // Penang only
  zone: text("zone"), // Penang only
  unitType: text("unit_type").notNull(),
  legacyLocation: text("legacy_location"),
  legacyTankId: integer("legacy_tank_id"),
  latPond: doublePrecision("lat_pond"),
  longPond: doublePrecision("long_pond"),
  volumeM3: doublePrecision("volume_m3"),
  areaPond: doublePrecision("area_pond"), // hectares
  depthM: doublePrecision("depth_m"),
  waterSource: text("water_source"),
  // Several in polyculture (DMS pond_treat SPECIES_1..5). No FK on items, as for operators.sites.
  species: text("species").array().notNull().default([]),
  status: text("status").notNull().default("active"),
  commissionedDate: date("commissioned_date"),
  notePond: text("note_pond"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// ---- Operators (each signs in with the account whose email matches theirs) ----
export const operators = pgTable("operators", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull().unique(),
  email: text("email").unique(), // lowercase; no email = can't sign in
  active: boolean("active").notNull().default(true),
  // ponytail: no FK on array items; the sync only writes codes of existing sites. Join table if other writers appear.
  sites: text("sites").array().notNull(), // site codes: sees and records only these sites' ponds
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// ---- Event: water quality ----
export const wqReadings = pgTable("wq_readings", {
  id: uuid("id").primaryKey().defaultRandom(),
  pondCode: text("pond_code")
    .notNull()
    .references(() => pond.pondCode),
  recordedAt: timestamp("recorded_at", { withTimezone: true }).notNull(),
  period: text("period").notNull(), // morning | afternoon
  dissolvedOxygen: doublePrecision("dissolved_oxygen"),
  temperature: doublePrecision("temperature"),
  ph: doublePrecision("ph"),
  ammonia: doublePrecision("ammonia"),
  nitrite: doublePrecision("nitrite"),
  nitrate: doublePrecision("nitrate"),
  remarks: text("remarks"),
  replaces: uuid("replaces"), // a correction: the reading of its pond it replaces (no FK: that may arrive later)
  person: text("person").notNull(),
  appVersion: text("app_version").notNull(), // app version that saved it; "legacy" = imported log
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
const correction = alias(wqReadings, "correction");

// ---- Event: feeding ----
export const feedingEvents = pgTable("feeding_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  pondCode: text("pond_code")
    .notNull()
    .references(() => pond.pondCode),
  recordedAt: timestamp("recorded_at", { withTimezone: true }).notNull(),
  // One Feed given that day, as the pond book records it (up to 3 a day, each its own Record)
  feed: text("feed")
    .notNull()
    .references(() => feed.feed),
  feedWeight: doublePrecision("feed_weight").notNull(), // g
  remarks: text("remarks"),
  person: text("person").notNull(),
  appVersion: text("app_version").notNull(), // app version that saved it; "legacy" = imported log
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// ---- Event: mortality ----
export const mortalityEvents = pgTable("mortality_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  pondCode: text("pond_code")
    .notNull()
    .references(() => pond.pondCode),
  recordedAt: timestamp("recorded_at", { withTimezone: true }).notNull(),
  mortalityCount: integer("mortality_count").notNull(),
  causeDeath: text("cause_death"),
  noteDeath: text("note_death"),
  person: text("person").notNull(),
  appVersion: text("app_version").notNull(), // app version that saved it; "legacy" = imported log
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// ---- Event: sampling (header) + fish measurements (repeat) ----
export const samplingEvents = pgTable("sampling_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  pondCode: text("pond_code")
    .notNull()
    .references(() => pond.pondCode),
  recordedAt: timestamp("recorded_at", { withTimezone: true }).notNull(),
  notes: text("notes"),
  person: text("person").notNull(),
  appVersion: text("app_version").notNull(), // app version that saved it; "legacy" = imported log
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const fishMeasurements = pgTable("fish_measurements", {
  id: uuid("id").primaryKey().defaultRandom(),
  samplingEventId: uuid("sampling_event_id")
    .notNull()
    .references(() => samplingEvents.id, { onDelete: "cascade" }),
  wt: doublePrecision("wt"), // total weight, g (DMS trait WT)
  lenSt: doublePrecision("len_st"), // standard length, cm (DMS trait LEN_ST)
});

// ---- Data links: one secret key per sign-in account, for CSVs in Excel (Power Query) or Google Sheets ----
export const dataLinks = pgTable("data_links", {
  account: text("account").primaryKey(), // Clerk user id; a new key replaces (so revokes) the old one
  keyHash: text("key_hash").notNull().unique(), // SHA-256 of the key: the key itself is shown once, never stored
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// ---- Views for seeing the data, columns named as the exports' headers; push skips a changed one: DROP VIEW first ----

/** Export names the DMS v5 hasn't settled (docs/naming-alignment.md): a rename breaks people's Excel queries. */
export const PROVISIONAL = {
  pond_code: "pond",
  tank: "tank", // the pond code's number
  source: "source", // app, or legacy (the old Excel log)
  area: "area",
  period: "period",
  dissolved_oxygen: "dissolved_oxygen",
  temperature: "temperature",
  ph: "ph",
  ammonia: "ammonia",
  nitrite: "nitrite",
  nitrate: "nitrate",
  remarks: "remarks",
  feed_weight: "feed_weight", // g; the pond book's FEED n WEIGHT
  mortality_count: "mortality_count",
  sampling_event: "sampling_event", // the Sampling event's id, shared by its Fish measurements
  notes: "notes",
  display_name: "display_name",
  area_code: "area_code",
  zone: "zone",
  unit_type: "unit_type",
  status: "status",
  legacy_location: "legacy_location",
  legacy_tank_id: "legacy_tank_id",
  volume_m3: "volume_m3",
  depth_m: "depth_m",
  water_source: "water_source",
  commissioned_date: "commissioned_date",
} as const;
const P = PROVISIONAL;

type Named<T> = {
  [K in keyof T]: SQL.Aliased<
    T[K] extends SQL<infer U>
      ? U
      : T[K] extends Column
        ? T[K]["_"]["data"] | (T[K]["_"]["notNull"] extends true ? never : null)
        : never
  >;
};
// Each field becomes a view column named by its key, so rows come back keyed by column name.
const named = <T extends Record<string, SQL | Column>>(fields: T) =>
  Object.fromEntries(Object.entries(fields).map(([name, field]) => [name, sql`${field}`.as(name)])) as Named<T>;

// DMS dates are YYYYMMDD text; DATE and TIME are the site's local date and time.
const local = (at: AnyPgColumn, format: string) =>
  sql<string>`to_char(${at} at time zone ${site.timezone}, ${sql.raw(`'${format}'`)})`;
// The fields every Record view starts with.
const recordFields = (t: { recordedAt: AnyPgColumn }) => ({
  site: pond.site,
  date: local(t.recordedAt, "YYYYMMDD"),
  time: local(t.recordedAt, "HH24:MI"),
});
const pondFields = {
  [P.area]: pond.area,
  [P.tank]: sql<number>`substring(${pond.pondCode} from '[0-9]+$')::int`, // trailing digits: PEN-FT3-091, TAL_07
  [P.pond_code]: pond.pondCode,
};
// The fields every Record view ends with (sampling's then adds its fish).
const madeBy = <C extends AnyPgColumn>(t: { person: C; appVersion: AnyPgColumn }) => ({
  person: t.person,
  [P.source]: sql<string>`case when ${t.appVersion} = 'legacy' then 'legacy' else 'app' end`,
});
// Every Record view reads its Record's pond and that pond's site.
const atPond = <Q extends PgSelectQueryBuilder>(q: Q, pondCode: AnyPgColumn) =>
  q.innerJoin(pond, eq(pond.pondCode, pondCode)).innerJoin(site, eq(site.site, pond.site));

export const wqView = pgView("export_wq").as((qb) =>
  atPond(
    qb
      .select(
        named({
          ...recordFields(wqReadings),
          // From the site's local hour, as DATE and TIME are, wherever the device was.
          [P.period]: sql<string>`case when ${local(wqReadings.recordedAt, "HH24")} < ${sql.raw(`'${NOON}'`)} then 'morning' else 'afternoon' end`,
          ...pondFields,
          [P.dissolved_oxygen]: wqReadings.dissolvedOxygen,
          [P.temperature]: wqReadings.temperature,
          [P.ph]: wqReadings.ph,
          [P.ammonia]: wqReadings.ammonia,
          [P.nitrite]: wqReadings.nitrite,
          [P.nitrate]: wqReadings.nitrate,
          [P.remarks]: wqReadings.remarks,
          ...madeBy(wqReadings),
        }),
      )
      .from(wqReadings)
      .$dynamic(),
    wqReadings.pondCode,
  ).where(
    // A corrected reading isn't shown, its correction is. Only within its pond, so never another site's.
    // ponytail: no index on replaces, so each read scans the table twice; add a partial one past ~100k rows.
    notExists(
      qb
        .select({ id: correction.id })
        .from(correction)
        .where(and(eq(correction.replaces, wqReadings.id), eq(correction.pondCode, wqReadings.pondCode))),
    ),
  ),
);

export const feedingView = pgView("export_feeding").as((qb) =>
  atPond(
    qb
      .select(
        named({
          ...recordFields(feedingEvents),
          ...pondFields,
          feed: feedingEvents.feed,
          [P.feed_weight]: feedingEvents.feedWeight,
          [P.remarks]: feedingEvents.remarks,
          ...madeBy(feedingEvents),
        }),
      )
      .from(feedingEvents)
      .$dynamic(),
    feedingEvents.pondCode,
  ),
);

export const mortalityView = pgView("export_mortality").as((qb) =>
  atPond(
    qb
      .select(
        named({
          ...recordFields(mortalityEvents),
          ...pondFields,
          [P.mortality_count]: mortalityEvents.mortalityCount,
          cause_death: mortalityEvents.causeDeath,
          note_death: mortalityEvents.noteDeath,
          ...madeBy(mortalityEvents),
        }),
      )
      .from(mortalityEvents)
      .$dynamic(),
    mortalityEvents.pondCode,
  ),
);

// One row per Fish measurement, its Sampling event's fields repeated.
export const samplingView = pgView("export_sampling").as((qb) =>
  atPond(
    qb
      .select(
        named({
          ...recordFields(samplingEvents),
          ...pondFields,
          [P.sampling_event]: samplingEvents.id,
          [P.notes]: samplingEvents.notes,
          ...madeBy(samplingEvents),
          measure_event: sql<string>`'MONITOR'`, // DMS v5: routine monitoring of ponds
          wt: fishMeasurements.wt,
          len_st: fishMeasurements.lenSt,
        }),
      )
      .from(fishMeasurements)
      .innerJoin(samplingEvents, eq(samplingEvents.id, fishMeasurements.samplingEventId))
      .$dynamic(),
    samplingEvents.pondCode,
  ),
);

export const pondView = pgView("export_pond").as((qb) =>
  qb
    .select(
      named({
        site: pond.site,
        name_site: site.nameSite,
        timezone: site.timezone,
        ...pondFields,
        [P.display_name]: pond.displayName,
        [P.area_code]: pond.areaCode,
        [P.zone]: pond.zone,
        [P.unit_type]: pond.unitType,
        species: pond.species,
        [P.status]: pond.status,
        [P.legacy_location]: pond.legacyLocation,
        [P.legacy_tank_id]: pond.legacyTankId,
        lat_pond: pond.latPond,
        long_pond: pond.longPond,
        area_pond: pond.areaPond,
        [P.volume_m3]: pond.volumeM3,
        [P.depth_m]: pond.depthM,
        [P.water_source]: pond.waterSource,
        [P.commissioned_date]: sql<string | null>`to_char(${pond.commissionedDate}, 'YYYYMMDD')`,
        note_pond: pond.notePond,
      }),
    )
    .from(pond)
    .innerJoin(site, eq(site.site, pond.site)),
);
