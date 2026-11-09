CREATE TABLE IF NOT EXISTS camper_arrival (
  registration_id uuid PRIMARY KEY REFERENCES registration(id),
  arrival_method text NOT NULL CHECK (arrival_method IN ('bus','own')),
  actual_bus text,
  recorded_by text NOT NULL,
  arrived_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK (arrival_method <> 'bus' OR NULLIF(trim(actual_bus),'') IS NOT NULL)
);

CREATE TABLE IF NOT EXISTS camper_placement (
  registration_id uuid PRIMARY KEY REFERENCES camper_arrival(registration_id),
  week_id integer NOT NULL,
  dorm_id integer NOT NULL,
  FOREIGN KEY (week_id,dorm_id) REFERENCES weekly_dorm(week_id,dorm_id)
);

CREATE INDEX IF NOT EXISTS camper_placement_dorm ON camper_placement(week_id,dorm_id);

CREATE TABLE IF NOT EXISTS camper_placement_event (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  registration_id uuid NOT NULL REFERENCES camper_arrival(registration_id),
  week_id integer NOT NULL,
  dorm_id integer NOT NULL,
  recorded_by text NOT NULL,
  reason text,
  recorded_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (week_id,dorm_id) REFERENCES weekly_dorm(week_id,dorm_id)
);
