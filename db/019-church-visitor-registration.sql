CREATE TABLE IF NOT EXISTS church_visitor (
  id uuid PRIMARY KEY,
  visit_id uuid NOT NULL REFERENCES church_visit(id),
  first_name text NOT NULL,
  last_name text NOT NULL,
  date_of_birth date NOT NULL,
  gender_group text NOT NULL CHECK (gender_group IN ('female','male')),
  visitor_role text NOT NULL CHECK (visitor_role IN ('student','adult','leader')),
  contact text NOT NULL,
  emergency_name text NOT NULL,
  emergency_phone text NOT NULL,
  details jsonb NOT NULL,
  source text NOT NULL CHECK (source IN ('online','desk')),
  registered_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  withdrawn_at timestamptz,
  revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
  UNIQUE (id,visit_id)
);
CREATE INDEX IF NOT EXISTS church_visitor_visit ON church_visitor(visit_id,last_name,first_name);

CREATE TABLE IF NOT EXISTS church_visit_acknowledgment (
  id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  visit_id uuid NOT NULL REFERENCES church_visit(id),
  visitor_id uuid NOT NULL,
  leader_name text NOT NULL,
  version text NOT NULL,
  wording text NOT NULL,
  language text NOT NULL CHECK (language IN ('en','es')),
  source text NOT NULL CHECK (source IN ('online','desk')),
  evidence_source text,
  recorded_by text,
  acknowledged_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (visitor_id,visit_id) REFERENCES church_visitor(id,visit_id),
  UNIQUE (visitor_id,leader_name,version)
);

CREATE TABLE IF NOT EXISTS church_visitor_history (
  id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  visitor_id uuid NOT NULL REFERENCES church_visitor(id),
  operation text NOT NULL CHECK (operation IN ('edit','withdraw','restore')),
  recorded_by text NOT NULL,
  reason text NOT NULL,
  previous_record jsonb NOT NULL,
  changed_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
);
