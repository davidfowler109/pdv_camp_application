ALTER TABLE scholarship_batch ADD COLUMN IF NOT EXISTS expires_on date;
ALTER TABLE scholarship_batch ADD COLUMN IF NOT EXISTS fee_snapshot jsonb;
