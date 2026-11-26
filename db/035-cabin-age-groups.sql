ALTER TABLE camp_week ADD COLUMN IF NOT EXISTS cabin_age_group_size integer NOT NULL DEFAULT 2
  CHECK (cabin_age_group_size BETWEEN 1 AND 3);
