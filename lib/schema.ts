import { pgTable, text, integer, doublePrecision, timestamp, date, boolean, uuid } from "drizzle-orm/pg-core";

// ---- Sites (mirrors the Airtable sites table; WorldFish DMS v3 SITE) ----
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
});

// ---- Species (mirrors the Airtable species table; WorldFish DMS v3 SPECIES) ----
export const species = pgTable("species", {
  species: text("species").primaryKey(), // two uppercase letters, e.g. ON
  speciesLatin: text("species_latin").notNull().unique(),
  speciesCommon: text("species_common"),
});

// ---- Feeds (mirrors the Airtable feeds table; WorldFish DMS v3 FEED) ----
export const feed = pgTable("feed", {
  feed: text("feed").primaryKey(), // three characters, e.g. SUP
  noteFeed: text("note_feed"),
  // ponytail: no FK on array items, as for operators.sites. Empty once removed from Airtable: offered nowhere.
  sites: text("sites").array().notNull(), // the sites that use it
});

// ---- Ponds (mirrors the Airtable ponds table; WorldFish DMS v3 names where it has one) ----
export const pond = pgTable("pond", {
  pondCode: text("pond_code").primaryKey(), // e.g. PEN-FT3-091
  displayName: text("display_name").notNull(),
  site: text("site")
    .notNull()
    .references(() => site.site),
  area: text("area").notNull(),
  areaCode: text("area_code").notNull(),
  zone: text("zone").notNull(),
  unitType: text("unit_type").notNull(),
  legacyLocation: text("legacy_location"),
  legacyTankId: integer("legacy_tank_id"),
  latPond: doublePrecision("lat_pond"),
  longPond: doublePrecision("long_pond"),
  volumeM3: doublePrecision("volume_m3"),
  areaPond: doublePrecision("area_pond"), // hectares
  depthM: doublePrecision("depth_m"),
  waterSource: text("water_source"),
  species: text("species").references(() => species.species),
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
  person: text("person").notNull(),
  appVersion: text("app_version").notNull(), // app version that saved it; "legacy" = imported log
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// ---- Event: feeding ----
export const feedingEvents = pgTable("feeding_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  pondCode: text("pond_code")
    .notNull()
    .references(() => pond.pondCode),
  recordedAt: timestamp("recorded_at", { withTimezone: true }).notNull(),
  feed: text("feed").references(() => feed.feed),
  feedAmountKg: doublePrecision("feed_amount_kg"),
  feedingsCount: integer("feedings_count"),
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
