-- One-off, after migrate-0.12.0-mortality.sql: Fertiliser and Treatment events, each with its site list (Airtable
-- fertilisers and treatments, copied by db:sync). New tables and views only, so an app older than this works unchanged.
-- Run in one transaction with the two new views created as push makes them (drizzle-kit's generateMigration): the
-- DROPs below are no-ops that name them for the runner. Then db:sync fills the lists.
BEGIN;
DROP VIEW IF EXISTS export_fertiliser;
DROP VIEW IF EXISTS export_treatment;
CREATE TABLE "fert" (
	"fert" text PRIMARY KEY NOT NULL,
	"note_fert" text,
	"sites" text[] NOT NULL
);
CREATE TABLE "treatment" (
	"treatment" text PRIMARY KEY NOT NULL,
	"note_treatment" text,
	"sites" text[] NOT NULL
);
CREATE TABLE "fertiliser_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"pond_code" text NOT NULL,
	"recorded_at" timestamp with time zone NOT NULL,
	"fert" text NOT NULL,
	"fert_weight" double precision NOT NULL,
	"remarks" text,
	"person" text NOT NULL,
	"app_version" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE "treatment_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"pond_code" text NOT NULL,
	"recorded_at" timestamp with time zone NOT NULL,
	"treatment" text NOT NULL,
	"treatment_weight" double precision NOT NULL,
	"remarks" text,
	"person" text NOT NULL,
	"app_version" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE "fertiliser_events" ADD CONSTRAINT "fertiliser_events_pond_code_pond_pond_code_fk" FOREIGN KEY ("pond_code") REFERENCES "public"."pond"("pond_code") ON DELETE no action ON UPDATE no action;
ALTER TABLE "fertiliser_events" ADD CONSTRAINT "fertiliser_events_fert_fert_fert_fk" FOREIGN KEY ("fert") REFERENCES "public"."fert"("fert") ON DELETE no action ON UPDATE no action;
ALTER TABLE "treatment_events" ADD CONSTRAINT "treatment_events_pond_code_pond_pond_code_fk" FOREIGN KEY ("pond_code") REFERENCES "public"."pond"("pond_code") ON DELETE no action ON UPDATE no action;
ALTER TABLE "treatment_events" ADD CONSTRAINT "treatment_events_treatment_treatment_treatment_fk" FOREIGN KEY ("treatment") REFERENCES "public"."treatment"("treatment") ON DELETE no action ON UPDATE no action;
COMMIT;
