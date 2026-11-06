-- One-off, before db:push, after migrate-0.12.0.sql (0.11.0 → 0.12.0): a Feeding event is one Feed and its weight in
-- grams, as the pond book records it; no number of feedings. No branch had a Feeding event, so nothing is converted:
-- adding feed_weight NOT NULL fails on a table with rows, rather than reading kg as g.
BEGIN;
-- push skips changed views, and a column a view uses can't be dropped: push recreates it
DROP VIEW IF EXISTS export_feeding;
ALTER TABLE feeding_events DROP COLUMN feed_amount_kg;
ALTER TABLE feeding_events DROP COLUMN feedings_count;
ALTER TABLE feeding_events ADD COLUMN feed_weight double precision NOT NULL;
ALTER TABLE feeding_events ALTER COLUMN feed SET NOT NULL;
COMMIT;
