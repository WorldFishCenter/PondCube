-- One-off, after migrate-0.12.0-feeding.sql: a Mortality record gets its species (DMS SPECIES) and the pond book's PIT.
-- Additive only, so an app older than this keeps storing Mortality records (without either). Both columns are nullable:
-- lib/validation.ts requires species, as it does Ranges. Run in one transaction with export_mortality recreated as push
-- makes it (drizzle-kit's generateMigration), so the view is never missing.
BEGIN;
-- push skips a changed view: it gains SPECIES and PIT, every other column kept
DROP VIEW IF EXISTS export_mortality;
ALTER TABLE "mortality_events" ADD COLUMN "species" text;
ALTER TABLE "mortality_events" ADD COLUMN "pit" text;
ALTER TABLE "mortality_events" ADD CONSTRAINT "mortality_events_species_species_species_fk" FOREIGN KEY ("species") REFERENCES "public"."species"("species") ON DELETE no action ON UPDATE no action;
COMMIT;
