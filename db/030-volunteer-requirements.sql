ALTER TABLE staff_application ADD COLUMN IF NOT EXISTS volunteer_acknowledgment jsonb NOT NULL DEFAULT '{}';
