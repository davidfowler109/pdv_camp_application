ALTER TABLE camp_week ADD COLUMN IF NOT EXISTS fee_cents integer CHECK (fee_cents >= 0);
ALTER TABLE camp_week ADD COLUMN IF NOT EXISTS award_limit integer NOT NULL DEFAULT 0 CHECK (award_limit >= 0);
ALTER TABLE registration ADD COLUMN IF NOT EXISTS follow_up date;
ALTER TABLE registration ADD COLUMN IF NOT EXISTS place_status text NOT NULL DEFAULT 'pending'
  CHECK (place_status IN ('pending','confirmed','released'));

CREATE INDEX IF NOT EXISTS registration_week_place ON registration(week_id,place_status);

CREATE TABLE IF NOT EXISTS scholarship_batch (
  id uuid PRIMARY KEY,
  week_id integer NOT NULL REFERENCES camp_week(id),
  distributor text NOT NULL,
  distributor_role text NOT NULL CHECK (distributor_role IN ('pastor','staff')),
  issued_by text NOT NULL,
  issued_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS scholarship_code (
  code text PRIMARY KEY,
  batch_id uuid NOT NULL REFERENCES scholarship_batch(id),
  value_cents integer NOT NULL CHECK (value_cents > 0),
  registration_id uuid UNIQUE REFERENCES registration(id),
  redeemed_at timestamptz,
  CHECK ((registration_id IS NULL) = (redeemed_at IS NULL))
);

CREATE TABLE IF NOT EXISTS registration_payment (
  id uuid PRIMARY KEY,
  registration_id uuid NOT NULL REFERENCES registration(id),
  amount_cents integer NOT NULL CHECK (amount_cents > 0),
  reference text NOT NULL,
  recorded_by text NOT NULL,
  recorded_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (registration_id,reference)
);

CREATE TABLE IF NOT EXISTS registration_review_event (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  registration_id uuid NOT NULL REFERENCES registration(id),
  event_type text NOT NULL CHECK (event_type IN ('permission','confirmed','released')),
  recorded_by text NOT NULL,
  detail text NOT NULL,
  recorded_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
);
