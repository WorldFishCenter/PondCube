-- One-off, before db:push (0.11.0 → 0.12.0): a pond holds several species; DMS pond codes (TAL_01) have no area code
-- or zone, and their number is their trailing digits, which changes every export view
BEGIN;
-- push skips changed views, and a column type can't change under one: push recreates them
DROP VIEW IF EXISTS export_pond;
DROP VIEW IF EXISTS export_wq;
DROP VIEW IF EXISTS export_feeding;
DROP VIEW IF EXISTS export_mortality;
DROP VIEW IF EXISTS export_sampling;
ALTER TABLE pond DROP CONSTRAINT IF EXISTS pond_species_species_species_fk;
ALTER TABLE pond ALTER COLUMN species TYPE text[] USING CASE WHEN species IS NULL THEN '{}' ELSE ARRAY[species] END;
ALTER TABLE pond ALTER COLUMN species SET DEFAULT '{}';
ALTER TABLE pond ALTER COLUMN species SET NOT NULL;
ALTER TABLE pond ALTER COLUMN area_code DROP NOT NULL;
ALTER TABLE pond ALTER COLUMN zone DROP NOT NULL;
COMMIT;
