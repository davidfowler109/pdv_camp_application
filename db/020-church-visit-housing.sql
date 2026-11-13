ALTER TABLE church_visit ADD COLUMN IF NOT EXISTS housing_revision integer NOT NULL DEFAULT 0;
ALTER TABLE church_visit ADD COLUMN IF NOT EXISTS housing_published_at timestamptz;

CREATE TABLE IF NOT EXISTS visit_room_plan (
  visit_id uuid NOT NULL,
  dorm_id integer NOT NULL,
  gender_group text NOT NULL CHECK (gender_group IN ('female','male','mixed')),
  minimum_adults integer NOT NULL CHECK (minimum_adults BETWEEN 0 AND 1000),
  allow_minors boolean NOT NULL,
  supervision_notes text NOT NULL DEFAULT '',
  PRIMARY KEY (visit_id,dorm_id),
  FOREIGN KEY (visit_id,dorm_id) REFERENCES visit_room_reservation(visit_id,dorm_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS visit_placement (
  visitor_id uuid PRIMARY KEY,
  visit_id uuid NOT NULL,
  dorm_id integer NOT NULL,
  supervisor boolean NOT NULL DEFAULT false,
  locked boolean NOT NULL DEFAULT false,
  FOREIGN KEY (visitor_id,visit_id) REFERENCES church_visitor(id,visit_id),
  FOREIGN KEY (visit_id,dorm_id) REFERENCES visit_room_reservation(visit_id,dorm_id)
);
CREATE INDEX IF NOT EXISTS visit_placement_room ON visit_placement(visit_id,dorm_id);

CREATE TABLE IF NOT EXISTS church_housing_history (
  id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  visit_id uuid NOT NULL REFERENCES church_visit(id),
  visitor_id uuid REFERENCES church_visitor(id),
  operation text NOT NULL,
  recorded_by text NOT NULL,
  reason text NOT NULL,
  previous_plan jsonb NOT NULL,
  resulting_plan jsonb NOT NULL,
  changed_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
);
