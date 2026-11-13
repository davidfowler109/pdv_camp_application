CREATE TABLE IF NOT EXISTS church_visit (
  id uuid PRIMARY KEY,
  name text NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 120),
  church_name text NOT NULL CHECK (length(trim(church_name)) BETWEEN 1 AND 160),
  purpose text NOT NULL CHECK (length(trim(purpose)) BETWEEN 1 AND 2000),
  leader_name text NOT NULL CHECK (length(trim(leader_name)) BETWEEN 1 AND 160),
  leader_email text NOT NULL CHECK (length(trim(leader_email)) BETWEEN 1 AND 254),
  leader_phone text NOT NULL CHECK (length(trim(leader_phone)) BETWEEN 1 AND 80),
  starts_at timestamp NOT NULL,
  ends_at timestamp NOT NULL CHECK (ends_at > starts_at),
  turnover_minutes integer NOT NULL DEFAULT 0 CHECK (turnover_minutes BETWEEN 0 AND 10080),
  expected_students integer NOT NULL CHECK (expected_students BETWEEN 0 AND 1000),
  expected_adults integer NOT NULL CHECK (expected_adults BETWEEN 0 AND 1000),
  expected_leaders integer NOT NULL CHECK (expected_leaders BETWEEN 0 AND 1000),
  cancelled_at timestamptz,
  CHECK (expected_students + expected_adults + expected_leaders BETWEEN 1 AND 1000)
);

CREATE TABLE IF NOT EXISTS visit_room_reservation (
  visit_id uuid NOT NULL REFERENCES church_visit(id),
  dorm_id integer NOT NULL REFERENCES dorm(id),
  PRIMARY KEY (visit_id, dorm_id)
);
CREATE INDEX IF NOT EXISTS visit_room_reservation_dorm ON visit_room_reservation(dorm_id);
