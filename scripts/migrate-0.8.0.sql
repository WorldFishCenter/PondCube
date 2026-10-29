-- 0.8.0 on a database still at 0.7.0 (production): the WorldFish DMS v3 names, every Record value kept.
-- db:push can't do this: it can't tell a rename from a drop plus an add. Run once, when no one is recording
-- (0.7.0 stops working here), then sync and deploy 0.8.0:
--   psql "$DATABASE_URL_PROD" -f scripts/migrate-0.8.0.sql && npm run db:sync -- --prod
-- Ponds and operators are copies of Airtable: the sync sets their new fields (site names, species, sites).
BEGIN;

CREATE TABLE site (
  site text PRIMARY KEY NOT NULL,
  name_site text NOT NULL,
  owner_site text,
  phone_site text,
  email_site text,
  lat_site double precision,
  long_site double precision,
  note_site text
);
CREATE TABLE species (
  species text PRIMARY KEY NOT NULL,
  species_latin text NOT NULL CONSTRAINT species_species_latin_unique UNIQUE,
  species_common text
);
CREATE TABLE feed (
  feed text PRIMARY KEY NOT NULL,
  note_feed text,
  sites text[] NOT NULL
);

-- Ponds: the site's name moves to the site table.
ALTER TABLE assets RENAME TO pond;
ALTER TABLE pond RENAME CONSTRAINT assets_pkey TO pond_pkey;
INSERT INTO site (site, name_site) SELECT DISTINCT site_code, site FROM pond;
ALTER TABLE pond DROP COLUMN site;
ALTER TABLE pond RENAME COLUMN site_code TO site;
ALTER TABLE pond RENAME COLUMN latitude TO lat_pond;
ALTER TABLE pond RENAME COLUMN longitude TO long_pond;
ALTER TABLE pond RENAME COLUMN surface_area_m2 TO area_pond;
UPDATE pond SET area_pond = area_pond / 10000; -- m² → hectares
ALTER TABLE pond RENAME COLUMN notes TO note_pond;
ALTER TABLE pond DROP COLUMN species_strain;
ALTER TABLE pond ADD COLUMN species text;
ALTER TABLE pond ADD CONSTRAINT pond_site_site_site_fk FOREIGN KEY (site) REFERENCES site (site);
ALTER TABLE pond ADD CONSTRAINT pond_species_species_species_fk FOREIGN KEY (species) REFERENCES species (species);

-- Operators: no sites until the sync sets them.
ALTER TABLE operators ADD COLUMN sites text[] NOT NULL DEFAULT '{}';
ALTER TABLE operators ALTER COLUMN sites DROP DEFAULT;

-- Every Record.
ALTER TABLE wq_readings RENAME COLUMN enumerator TO person;
ALTER TABLE feeding_events RENAME COLUMN enumerator TO person;
ALTER TABLE mortality_events RENAME COLUMN enumerator TO person;
ALTER TABLE sampling_events RENAME COLUMN enumerator TO person;
ALTER TABLE wq_readings RENAME CONSTRAINT wq_readings_pond_code_assets_pond_code_fk TO wq_readings_pond_code_pond_pond_code_fk;
ALTER TABLE feeding_events RENAME CONSTRAINT feeding_events_pond_code_assets_pond_code_fk TO feeding_events_pond_code_pond_pond_code_fk;
ALTER TABLE mortality_events RENAME CONSTRAINT mortality_events_pond_code_assets_pond_code_fk TO mortality_events_pond_code_pond_pond_code_fk;
ALTER TABLE sampling_events RENAME CONSTRAINT sampling_events_pond_code_assets_pond_code_fk TO sampling_events_pond_code_pond_pond_code_fk;

-- Feeding events: an old feed type has no Feed to become, so it goes in the remarks (as the app does on devices).
UPDATE feeding_events
  SET remarks = concat_ws('; ', nullif(remarks, ''), 'Feed type: ' || coalesce(nullif(feed_type_other, ''), feed_type))
  WHERE feed_type IS NOT NULL;
ALTER TABLE feeding_events DROP COLUMN feed_type;
ALTER TABLE feeding_events DROP COLUMN feed_type_other;
ALTER TABLE feeding_events ADD COLUMN feed text;
ALTER TABLE feeding_events ADD CONSTRAINT feeding_events_feed_feed_feed_fk FOREIGN KEY (feed) REFERENCES feed (feed);

-- Mortality records: old causes as the DMS writes them; one with no DMS cause goes in the note.
ALTER TABLE mortality_events RENAME COLUMN suspected_cause TO cause_death;
ALTER TABLE mortality_events RENAME COLUMN remarks TO note_death;
UPDATE mortality_events
  SET note_death = concat_ws('; ', nullif(note_death, ''), 'Cause: ' || cause_death)
  WHERE cause_death IN ('predation', 'handling', 'other');
UPDATE mortality_events SET cause_death = CASE cause_death
  WHEN 'disease' THEN 'Disease_parasites'
  WHEN 'water_quality' THEN 'Water_quality'
  WHEN 'unknown' THEN 'Unknown'
END;

-- Fish measurements.
ALTER TABLE fish_measurements RENAME COLUMN weight_g TO wt;
ALTER TABLE fish_measurements RENAME COLUMN length_cm TO len_st;

COMMIT;
