ALTER TABLE camp_week ALTER COLUMN maximum_age DROP NOT NULL;
ALTER TABLE weekly_dorm ALTER COLUMN maximum_age DROP NOT NULL;
DO $migration$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='camp_week_open_age' AND conrelid='camp_week'::regclass) THEN
    ALTER TABLE camp_week ADD CONSTRAINT camp_week_open_age CHECK (maximum_age IS NOT NULL OR minimum_age=18);
    ALTER TABLE weekly_dorm ADD CONSTRAINT weekly_dorm_open_age CHECK (maximum_age IS NOT NULL OR minimum_age=18);
  END IF;
END
$migration$;
