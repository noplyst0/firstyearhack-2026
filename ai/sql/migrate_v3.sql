-- v3 migration (plan/V3.md): run once on the live account with `node run_sql.js sql/migrate_v3.sql`. Safe to re-run.
ALTER TABLE ATTEMPTS ADD COLUMN IF NOT EXISTS player_name STRING;
ALTER TABLE ATTEMPTS ADD COLUMN IF NOT EXISTS is_practice BOOLEAN DEFAULT FALSE;
DELETE FROM CONFIG WHERE k = 'FOV';
INSERT INTO CONFIG VALUES ('FOV', 60);   -- keep equal to backend/constants.js
