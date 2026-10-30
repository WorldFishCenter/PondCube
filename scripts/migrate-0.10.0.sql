BEGIN;
ALTER TABLE site ADD COLUMN timezone text;
UPDATE site SET timezone = 'Asia/Kuala_Lumpur' WHERE site = 'PEN';
ALTER TABLE site ALTER COLUMN timezone SET NOT NULL;
-- push skips a changed view: drop them so push recreates them (MEASURE_EVENT; PERIOD from the site's local hour,
-- blank REMARKS as empty)
DROP VIEW IF EXISTS export_sampling;
DROP VIEW IF EXISTS export_wq;
COMMIT;
