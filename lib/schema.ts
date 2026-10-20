import { pgTable, text, integer, doublePrecision, timestamp, date, boolean, uuid } from "drizzle-orm/pg-core";

// ---- Static asset dimension (mirrors the Airtable asset table) ----
export const assets = pgTable("assets", {
  pondCode: text("pond_code").primaryKey(), // e.g. PEN-FT3-091
  displayName: text("display_name").notNull(),
  site: text("site").notNull(),
  siteCode: text("site_code").notNull(),
  area: text("area").notNull(),
  areaCode: text("area_code").notNull(),
  zone: text("zone").notNull(),
  unitType: text("unit_type").notNull(),
  legacyLocation: text("legacy_location"),
  legacyTankId: integer("legacy_tank_id"),
  latitude: doublePrecision("latitude"),
  longitude: doublePrecision("longitude"),
  volumeM3: doublePrecision("volume_m3"),
  surfaceAreaM2: doublePrecision("surface_area_m2"),
  depthM: doublePrecision("depth_m"),
  waterSource: text("water_source"),
  speciesStrain: text("species_strain"),
  status: text("status").notNull().default("active"),
  commissionedDate: date("commissioned_date"),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// ---- Operators (each signs in with the account whose email matches theirs) ----
export const operators = pgTable("operators", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull().unique(),
  email: text("email").unique(), // lowercase; no email = can't sign in
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// ---- Event: water quality ----
export const wqReadings = pgTable("wq_readings", {
  id: uuid("id").primaryKey().defaultRandom(),
  pondCode: text("pond_code")
    .notNull()
    .references(() => assets.pondCode),
  recordedAt: timestamp("recorded_at", { withTimezone: true }).notNull(),
  period: text("period").notNull(), // morning | afternoon
  dissolvedOxygen: doublePrecision("dissolved_oxygen"),
  temperature: doublePrecision("temperature"),
  ph: doublePrecision("ph"),
  ammonia: doublePrecision("ammonia"),
  nitrite: doublePrecision("nitrite"),
  nitrate: doublePrecision("nitrate"),
  remarks: text("remarks"),
  enumerator: text("enumerator").notNull(),
  appVersion: text("app_version").notNull(), // app version that saved it; "legacy" = imported log
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// ---- Event: feeding ----
export const feedingEvents = pgTable("feeding_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  pondCode: text("pond_code")
    .notNull()
    .references(() => assets.pondCode),
  recordedAt: timestamp("recorded_at", { withTimezone: true }).notNull(),
  feedType: text("feed_type"),
  feedTypeOther: text("feed_type_other"),
  feedAmountKg: doublePrecision("feed_amount_kg"),
  feedingsCount: integer("feedings_count"),
  remarks: text("remarks"),
  enumerator: text("enumerator").notNull(),
  appVersion: text("app_version").notNull(), // app version that saved it; "legacy" = imported log
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// ---- Event: mortality ----
export const mortalityEvents = pgTable("mortality_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  pondCode: text("pond_code")
    .notNull()
    .references(() => assets.pondCode),
  recordedAt: timestamp("recorded_at", { withTimezone: true }).notNull(),
  mortalityCount: integer("mortality_count").notNull(),
  suspectedCause: text("suspected_cause"),
  remarks: text("remarks"),
  enumerator: text("enumerator").notNull(),
  appVersion: text("app_version").notNull(), // app version that saved it; "legacy" = imported log
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// ---- Event: sampling (header) + fish measurements (repeat) ----
export const samplingEvents = pgTable("sampling_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  pondCode: text("pond_code")
    .notNull()
    .references(() => assets.pondCode),
  recordedAt: timestamp("recorded_at", { withTimezone: true }).notNull(),
  notes: text("notes"),
  enumerator: text("enumerator").notNull(),
  appVersion: text("app_version").notNull(), // app version that saved it; "legacy" = imported log
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const fishMeasurements = pgTable("fish_measurements", {
  id: uuid("id").primaryKey().defaultRandom(),
  samplingEventId: uuid("sampling_event_id")
    .notNull()
    .references(() => samplingEvents.id, { onDelete: "cascade" }),
  weightG: doublePrecision("weight_g"),
  lengthCm: doublePrecision("length_cm"),
});
