ALTER TABLE special_event ADD COLUMN IF NOT EXISTS housing_revision integer NOT NULL DEFAULT 0;
ALTER TABLE special_event ADD COLUMN IF NOT EXISTS housing_published_at timestamptz;
CREATE UNIQUE INDEX IF NOT EXISTS event_attendee_id_event ON event_attendee(id,event_id);
CREATE TABLE IF NOT EXISTS event_room_plan (
  event_id uuid NOT NULL,
  dorm_id integer NOT NULL,
  eligible boolean NOT NULL DEFAULT true,
  notes text NOT NULL DEFAULT '',
  PRIMARY KEY(event_id,dorm_id),
  FOREIGN KEY(event_id,dorm_id) REFERENCES event_room_reservation(event_id,dorm_id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS event_placement (
  attendee_id uuid PRIMARY KEY,
  event_id uuid NOT NULL,
  dorm_id integer NOT NULL,
  supervisor boolean NOT NULL DEFAULT false,
  locked boolean NOT NULL DEFAULT false,
  requests_reviewed boolean NOT NULL DEFAULT false,
  FOREIGN KEY(attendee_id,event_id) REFERENCES event_attendee(id,event_id),
  FOREIGN KEY(event_id,dorm_id) REFERENCES event_room_reservation(event_id,dorm_id)
);
CREATE TABLE IF NOT EXISTS event_housing_history (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  event_id uuid NOT NULL REFERENCES special_event(id),
  operation text NOT NULL,
  recorded_by text NOT NULL,
  reason text NOT NULL,
  previous_plan jsonb NOT NULL,
  resulting_plan jsonb NOT NULL,
  recorded_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE OR REPLACE FUNCTION event_housing_attendee_changed() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP='UPDATE' THEN
    IF OLD.accessibility IS DISTINCT FROM NEW.accessibility OR OLD.rooming IS DISTINCT FROM NEW.rooming
      OR OLD.church IS DISTINCT FROM NEW.church OR OLD.rooming_code IS DISTINCT FROM NEW.rooming_code THEN
      UPDATE event_placement SET requests_reviewed=false WHERE attendee_id=NEW.id;
    END IF;
  END IF;
  UPDATE special_event SET housing_revision=housing_revision+1,housing_published_at=NULL WHERE id=NEW.event_id;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS event_housing_attendee_change ON event_attendee;
CREATE TRIGGER event_housing_attendee_change AFTER INSERT OR UPDATE OF first_name,last_name,attendance,place_status,rooming,church,rooming_code,accessibility
  ON event_attendee FOR EACH ROW EXECUTE FUNCTION event_housing_attendee_changed();
CREATE OR REPLACE FUNCTION event_housing_event_changed() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.housing_revision=OLD.housing_revision+1;
  NEW.housing_published_at=NULL;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS event_housing_event_change ON special_event;
CREATE TRIGGER event_housing_event_change BEFORE UPDATE OF name,starts_at,ends_at,turnover_minutes,supervisor_required,cancelled_at,overnight_attendance
  ON special_event FOR EACH ROW EXECUTE FUNCTION event_housing_event_changed();
