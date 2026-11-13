ALTER TABLE church_visitor ADD COLUMN IF NOT EXISTS arrived_at timestamptz;
ALTER TABLE church_visitor ADD COLUMN IF NOT EXISTS departed_at timestamptz;
ALTER TABLE church_visitor ADD COLUMN IF NOT EXISTS presence_revision integer NOT NULL DEFAULT 0;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='church_visitor_presence_order' AND conrelid='church_visitor'::regclass) THEN
    ALTER TABLE church_visitor ADD CONSTRAINT church_visitor_presence_order
      CHECK (departed_at IS NULL OR (arrived_at IS NOT NULL AND departed_at>=arrived_at));
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS visit_attendance_batch (
  id uuid PRIMARY KEY,
  visit_id uuid NOT NULL REFERENCES church_visit(id),
  operation text NOT NULL CHECK (operation IN ('arrive','depart','undoArrival','undoDeparture')),
  request_signature text NOT NULL,
  recorded_by text NOT NULL,
  notes text NOT NULL,
  visitor_count integer NOT NULL CHECK (visitor_count>0),
  recorded_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS visit_attendance_event (
  batch_id uuid NOT NULL REFERENCES visit_attendance_batch(id),
  visitor_id uuid NOT NULL REFERENCES church_visitor(id),
  previous_arrival timestamptz,
  previous_departure timestamptz,
  resulting_arrival timestamptz,
  resulting_departure timestamptz,
  PRIMARY KEY (batch_id,visitor_id)
);

CREATE TABLE IF NOT EXISTS visit_room_use (
  visit_id uuid NOT NULL,
  visitor_id uuid NOT NULL,
  dorm_id integer NOT NULL REFERENCES dorm(id),
  needs_turnover boolean NOT NULL DEFAULT true,
  PRIMARY KEY (visitor_id,dorm_id),
  FOREIGN KEY (visitor_id,visit_id) REFERENCES church_visitor(id,visit_id)
);
CREATE INDEX IF NOT EXISTS visit_room_use_turnover ON visit_room_use(dorm_id) WHERE needs_turnover;
