CREATE TABLE IF NOT EXISTS event_attendee (
  id uuid PRIMARY KEY,
  event_id uuid NOT NULL REFERENCES special_event(id),
  first_name text NOT NULL,
  last_name text NOT NULL,
  contact text NOT NULL,
  attendance text NOT NULL CHECK (attendance IN ('day','overnight')),
  rooming text CHECK (rooming IN ('none','church','group')),
  church text,
  rooming_code text,
  food text,
  accessibility text,
  source text NOT NULL CHECK (source IN ('online','desk','paper')),
  authorization_date date NOT NULL,
  notice_version text NOT NULL,
  authorization_source text,
  recorder text,
  place_status text NOT NULL DEFAULT 'pending' CHECK (place_status IN ('pending','confirmed','released')),
  received_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK ((attendance='overnight') = (rooming IS NOT NULL)),
  CHECK (rooming<>'church' OR church IS NOT NULL),
  CHECK (rooming<>'group' OR rooming_code IS NOT NULL),
  CHECK (source<>'paper' OR authorization_source IS NOT NULL),
  CHECK (source='online' OR recorder IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS event_attendee_event ON event_attendee(event_id,place_status);
CREATE TABLE IF NOT EXISTS event_attendee_payment (
  attendee_id uuid NOT NULL REFERENCES event_attendee(id),
  reference text NOT NULL,
  amount_cents integer NOT NULL CHECK (amount_cents>0),
  recorded_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  recorded_by text NOT NULL,
  PRIMARY KEY (attendee_id,reference)
);
