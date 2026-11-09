ALTER TABLE camp_week ADD COLUMN IF NOT EXISTS early_bird_cents integer;
ALTER TABLE camp_week ADD COLUMN IF NOT EXISTS early_bird_ends_on date;

DO $$ BEGIN
  ALTER TABLE camp_week ADD CONSTRAINT camp_week_early_bird_price
    CHECK ((early_bird_cents IS NULL AND early_bird_ends_on IS NULL) OR
      (early_bird_cents IS NOT NULL AND early_bird_ends_on IS NOT NULL AND fee_cents IS NOT NULL
       AND early_bird_cents >= 0 AND early_bird_cents < fee_cents));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE registration ADD COLUMN IF NOT EXISTS fee_at_registration_cents integer CHECK (fee_at_registration_cents >= 0);
ALTER TABLE registration ADD COLUMN IF NOT EXISTS scholarship_reviewed_at timestamptz;
ALTER TABLE registration ADD COLUMN IF NOT EXISTS scholarship_reviewed_by text;
ALTER TABLE registration ADD COLUMN IF NOT EXISTS payment_reference text GENERATED ALWAYS AS
  ('PDV-' || upper(left(replace(id::text,'-',''),12))) STORED;
CREATE UNIQUE INDEX IF NOT EXISTS registration_payment_reference ON registration(payment_reference);
ALTER TABLE registration_payment ADD COLUMN IF NOT EXISTS paid_on date;
