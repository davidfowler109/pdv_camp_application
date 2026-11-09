CREATE TABLE IF NOT EXISTS registration (
  id uuid PRIMARY KEY,
  week_id integer NOT NULL REFERENCES camp_week(id),
  received_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  first_name text NOT NULL,
  last_name text NOT NULL,
  date_of_birth date NOT NULL,
  gender_group text NOT NULL CHECK (gender_group IN ('female', 'male')),
  intake_channel text NOT NULL CHECK (intake_channel IN ('online', 'paper')),
  participation text NOT NULL CHECK (participation IN ('pending', 'granted', 'declined')),
  photo_permission text CHECK (photo_permission IN ('granted', 'declined')),
  notice_version text NOT NULL,
  authorized_on date NOT NULL,
  signer_role text NOT NULL CHECK (signer_role IN ('guardian', 'self')),
  signer_name text NOT NULL,
  details jsonb NOT NULL
);

CREATE INDEX IF NOT EXISTS registration_week_received ON registration (week_id, received_at);
