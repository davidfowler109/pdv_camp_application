CREATE SEQUENCE IF NOT EXISTS camp_review_revision;
CREATE TABLE IF NOT EXISTS camp_after_action_review (
  scope text PRIMARY KEY,
  week_id integer UNIQUE REFERENCES camp_week(id),
  season integer UNIQUE CHECK (season BETWEEN 2020 AND 2100),
  revision integer NOT NULL DEFAULT nextval('camp_review_revision') CHECK (revision > 0),
  state text NOT NULL CHECK (state IN ('draft','reviewed')),
  body jsonb NOT NULL DEFAULT '{}',
  metrics jsonb,
  updated_by text NOT NULL CHECK (length(trim(updated_by)) BETWEEN 1 AND 100),
  updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  reviewed_by text,
  reviewed_at timestamptz,
  CHECK ((week_id IS NOT NULL) <> (season IS NOT NULL)),
  CHECK (scope = CASE WHEN week_id IS NOT NULL THEN 'week:' || week_id::text ELSE 'season:' || season::text END),
  CHECK ((state='reviewed') = (reviewed_at IS NOT NULL AND reviewed_by IS NOT NULL))
);
