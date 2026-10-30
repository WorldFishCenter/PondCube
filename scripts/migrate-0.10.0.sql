BEGIN;
ALTER TABLE site ADD COLUMN timezone text;
-- PEN is the only site on dev, branched from production: another site without a zone stops this, changing nothing
UPDATE site SET timezone = 'Asia/Kuala_Lumpur' WHERE site = 'PEN';
ALTER TABLE site ALTER COLUMN timezone SET NOT NULL;
-- Notes left blank were stored as '': null, as the app saves them from 0.10.0
UPDATE wq_readings SET remarks = NULL WHERE trim(remarks) = '';
UPDATE feeding_events SET remarks = NULL WHERE trim(remarks) = '';
UPDATE mortality_events SET note_death = NULL WHERE trim(note_death) = '';
UPDATE sampling_events SET notes = NULL WHERE trim(notes) = '';
-- push skips a changed view: drop them so push recreates them (MEASURE_EVENT; PERIOD from the site's local hour)
DROP VIEW IF EXISTS export_sampling;
DROP VIEW IF EXISTS export_wq;
COMMIT;
