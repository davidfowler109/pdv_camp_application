CREATE TABLE IF NOT EXISTS return_bus (
  week_id integer NOT NULL REFERENCES camp_week(id),
  bus_key text NOT NULL,
  name text NOT NULL,
  departed_at timestamptz,
  departed_by text,
  PRIMARY KEY (week_id,bus_key)
);

CREATE TABLE IF NOT EXISTS camper_departure (
  registration_id uuid PRIMARY KEY REFERENCES camper_arrival(registration_id),
  week_id integer NOT NULL REFERENCES camp_week(id),
  method text NOT NULL CHECK (method IN ('bus','pickup','home','self')),
  bus_key text,
  pickup_name text,
  handoff_note text,
  handoff_required boolean NOT NULL DEFAULT false,
  handoff_at timestamptz,
  handoff_by text,
  recorded_by text NOT NULL,
  recorded_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (week_id,bus_key) REFERENCES return_bus(week_id,bus_key),
  CHECK ((method='bus') = (bus_key IS NOT NULL)),
  CHECK (method IN ('bus','self') OR NULLIF(trim(pickup_name),'') IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS camper_departure_bus ON camper_departure(week_id,bus_key);
