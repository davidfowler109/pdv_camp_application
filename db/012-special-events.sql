CREATE TABLE IF NOT EXISTS special_event (
  id uuid PRIMARY KEY,
  name text NOT NULL CHECK (length(trim(name))>0),
  starts_at timestamp NOT NULL,
  ends_at timestamp NOT NULL CHECK (ends_at>starts_at),
  turnover_minutes integer NOT NULL DEFAULT 0 CHECK (turnover_minutes BETWEEN 0 AND 10080),
  capacity integer NOT NULL CHECK (capacity BETWEEN 1 AND 1000),
  fee_cents integer CHECK (fee_cents>=0),
  day_attendance boolean NOT NULL,
  overnight_attendance boolean NOT NULL,
  supervisor_required boolean NOT NULL DEFAULT false,
  cancelled_at timestamptz,
  CHECK (day_attendance OR overnight_attendance)
);
CREATE TABLE IF NOT EXISTS event_room_reservation (
  event_id uuid NOT NULL REFERENCES special_event(id),
  dorm_id integer NOT NULL REFERENCES dorm(id),
  PRIMARY KEY (event_id,dorm_id)
);
CREATE INDEX IF NOT EXISTS event_room_reservation_dorm ON event_room_reservation(dorm_id);
