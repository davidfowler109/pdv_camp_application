DO $migration$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='registration'::regclass AND conname='registration_channel_valid') THEN
    ALTER TABLE registration DROP CONSTRAINT IF EXISTS registration_intake_channel_check;
    ALTER TABLE registration ADD CONSTRAINT registration_channel_valid CHECK (intake_channel IN ('online','paper','desk'));
  END IF;
END
$migration$;
