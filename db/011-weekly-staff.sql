ALTER TABLE staff_member ALTER COLUMN team_role DROP NOT NULL;
ALTER TABLE staff_member ADD COLUMN IF NOT EXISTS skills text[] CHECK (skills <@ ARRAY['guide','equipante','health','kitchen','program']::text[]);
ALTER TABLE staff_member ADD COLUMN IF NOT EXISTS qualifications text;
ALTER TABLE staff_member ADD COLUMN IF NOT EXISTS active boolean NOT NULL DEFAULT true;
ALTER TABLE weekly_dorm_staff ADD COLUMN IF NOT EXISTS assignment_role text CHECK (assignment_role IN ('guide','equipante'));

CREATE TABLE IF NOT EXISTS weekly_staff_assignment (
  week_id integer NOT NULL REFERENCES camp_week(id),
  staff_id integer NOT NULL REFERENCES staff_member(id),
  assignment_role text NOT NULL CHECK (assignment_role IN ('health','kitchen','program')),
  PRIMARY KEY (week_id,staff_id,assignment_role)
);
