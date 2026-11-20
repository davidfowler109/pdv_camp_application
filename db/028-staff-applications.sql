CREATE TABLE IF NOT EXISTS staff_application_season (
  season integer PRIMARY KEY CHECK(season BETWEEN 2020 AND 2100),
  fee_cents integer NOT NULL DEFAULT 0 CHECK(fee_cents BETWEEN 0 AND 1000000),
  shirt_cents integer NOT NULL DEFAULT 0 CHECK(shirt_cents BETWEEN 0 AND 1000000),
  due_on date, training_start date, training_end date, celebration_on date,
  CHECK(training_start IS NULL AND training_end IS NULL OR training_start IS NOT NULL AND training_end>=training_start)
);
-- Fictional pilot assumptions from the supplied 2027 Counselor form, editable by Leadership.
INSERT INTO staff_application_season(season,fee_cents,shirt_cents,due_on,training_start,training_end,celebration_on)
VALUES(2027,5000,1000,'2027-01-07','2027-01-07','2027-01-11','2027-02-14') ON CONFLICT DO NOTHING;
CREATE TABLE IF NOT EXISTS staff_application (
  id uuid PRIMARY KEY,
  season integer NOT NULL CHECK(season BETWEEN 2020 AND 2100),
  requested_role text NOT NULL CHECK(requested_role IN ('guide','equipante','volunteer')),
  status text NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','submitted','review','information','approved','declined')),
  data jsonb NOT NULL DEFAULT '{}',
  public_note text NOT NULL DEFAULT '',
  preparation jsonb NOT NULL DEFAULT '{}',
  revision integer NOT NULL DEFAULT 1,
  resume_hash text NOT NULL,
  resume_expires timestamptz NOT NULL,
  reference_hash text,
  reference_expires timestamptz,
  reference jsonb,
  reference_received_at timestamptz,
  staff_id integer REFERENCES staff_member(id),
  ready boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  submitted_at timestamptz,
  CHECK(NOT ready OR (status='approved' AND staff_id IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS staff_application_queue ON staff_application(season,status,updated_at);
CREATE TABLE IF NOT EXISTS staff_application_event (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  application_id uuid NOT NULL REFERENCES staff_application(id),
  operation text NOT NULL, actor text NOT NULL, reason text NOT NULL DEFAULT '',
  detail jsonb NOT NULL DEFAULT '{}',recorded_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS staff_application_document (
  id uuid PRIMARY KEY,application_id uuid NOT NULL REFERENCES staff_application(id),
  category text NOT NULL CHECK(category IN ('reference','guardian','policy','background')),
  content_type text NOT NULL CHECK(content_type IN ('application/pdf','image/jpeg','image/png')),
  content bytea NOT NULL CHECK(octet_length(content) BETWEEN 1 AND 10485760),
  source text NOT NULL, recorded_by text NOT NULL,
  recorded_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
);
