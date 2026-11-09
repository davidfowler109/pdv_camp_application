CREATE TABLE IF NOT EXISTS scholarship_season (
  year integer PRIMARY KEY CHECK (year BETWEEN 1 AND 9999),
  award_limit integer NOT NULL DEFAULT 0 CHECK (award_limit BETWEEN 0 AND 10000)
);

ALTER TABLE scholarship_batch ALTER COLUMN week_id DROP NOT NULL;
ALTER TABLE scholarship_batch ADD COLUMN IF NOT EXISTS season_year integer REFERENCES scholarship_season(year);
ALTER TABLE scholarship_batch ADD COLUMN IF NOT EXISTS distributor_email text;
ALTER TABLE scholarship_batch ADD COLUMN IF NOT EXISTS instructions text;

DO $$ BEGIN
  ALTER TABLE scholarship_batch ADD CONSTRAINT scholarship_batch_scope
    CHECK ((week_id IS NULL) <> (season_year IS NULL));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS scholarship_batch_season ON scholarship_batch(season_year);
