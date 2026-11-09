ALTER TABLE camp_week ADD COLUMN IF NOT EXISTS starts_on date;
ALTER TABLE camp_week ADD COLUMN IF NOT EXISTS ends_on date;
ALTER TABLE dorm ADD COLUMN IF NOT EXISTS room_kind text NOT NULL DEFAULT 'camper' CHECK (room_kind IN ('camper','hotel'));
ALTER TABLE dorm ADD COLUMN IF NOT EXISTS default_usable_beds integer CHECK (default_usable_beds BETWEEN 0 AND physical_beds);
ALTER TABLE dorm ADD COLUMN IF NOT EXISTS active boolean NOT NULL DEFAULT true;
ALTER TABLE dorm ADD COLUMN IF NOT EXISTS needs_cleaning boolean NOT NULL DEFAULT false;
ALTER TABLE dorm ADD COLUMN IF NOT EXISTS readiness_updated_at timestamptz;
ALTER TABLE weekly_dorm ALTER COLUMN usable_beds DROP NOT NULL;
