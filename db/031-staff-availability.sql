CREATE TABLE IF NOT EXISTS staff_availability_plan (
  staff_id integer NOT NULL REFERENCES staff_member(id),
  season integer NOT NULL CHECK(season BETWEEN 2020 AND 2100),
  week_ids integer[] NOT NULL DEFAULT '{}',
  revision integer NOT NULL DEFAULT 1 CHECK(revision>0),
  updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(staff_id,season)
);
CREATE TABLE IF NOT EXISTS staff_availability_event (
  id bigserial PRIMARY KEY,
  staff_id integer NOT NULL REFERENCES staff_member(id),
  season integer,
  week_id integer REFERENCES camp_week(id),
  dorm_id integer REFERENCES dorm(id),
  assignment_role text,
  operation text NOT NULL CHECK(operation IN ('availabilitySaved','assignmentOverride')),
  actor text NOT NULL,
  reason text NOT NULL CHECK(length(reason)>0 AND length(reason)<=2000),
  detail jsonb NOT NULL DEFAULT '{}',
  recorded_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS staff_availability_event_staff ON staff_availability_event(staff_id,id DESC);
