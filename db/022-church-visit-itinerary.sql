ALTER TABLE church_visit ADD COLUMN IF NOT EXISTS itinerary_revision integer NOT NULL DEFAULT 0;
CREATE TABLE IF NOT EXISTS visit_budget_settings (
  visit_id uuid PRIMARY KEY REFERENCES church_visit(id),
  count_basis text NOT NULL DEFAULT 'expected' CHECK (count_basis IN ('expected','registered')),
  share_group_costs boolean NOT NULL DEFAULT true,
  personal_extra_cents integer NOT NULL DEFAULT 0 CHECK (personal_extra_cents>=0)
);
CREATE TABLE IF NOT EXISTS visit_activity (
  id uuid PRIMARY KEY,
  visit_id uuid NOT NULL REFERENCES church_visit(id),
  day date NOT NULL,
  title text NOT NULL,
  time_of_day time,
  location text NOT NULL DEFAULT '',
  notes text NOT NULL DEFAULT '',
  archived_at timestamptz,
  UNIQUE(id,visit_id)
);
CREATE TABLE IF NOT EXISTS visit_cost (
  id uuid PRIMARY KEY,
  visit_id uuid NOT NULL REFERENCES church_visit(id),
  activity_id uuid,
  description text NOT NULL,
  payer text NOT NULL CHECK (payer IN ('camp','church','personal')),
  basis text NOT NULL CHECK (basis IN ('person','group')),
  applies_to text NOT NULL CHECK (applies_to IN ('all','student','adult','leader')),
  quantity_override integer CHECK (quantity_override BETWEEN 0 AND 1000),
  unit_cents integer CHECK (unit_cents>=0),
  meal text CHECK (meal IN ('breakfast','lunch','dinner')),
  meal_source text CHECK (meal_source IN ('camp','packed','outside')),
  archived_at timestamptz,
  FOREIGN KEY(activity_id,visit_id) REFERENCES visit_activity(id,visit_id),
  CHECK ((meal IS NULL)=(meal_source IS NULL)),
  CHECK (meal IS NULL OR activity_id IS NOT NULL)
);
CREATE TABLE IF NOT EXISTS visit_plan_change (
  request_id uuid PRIMARY KEY,
  visit_id uuid NOT NULL REFERENCES church_visit(id),
  operation text NOT NULL,
  request_signature text NOT NULL,
  recorded_by text NOT NULL,
  notes text NOT NULL,
  previous_plan jsonb NOT NULL,
  resulting_plan jsonb NOT NULL,
  recorded_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS visit_budget_publication (
  id uuid PRIMARY KEY,
  visit_id uuid NOT NULL REFERENCES church_visit(id),
  revision integer NOT NULL,
  version integer NOT NULL,
  payload jsonb NOT NULL,
  published_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(visit_id,version)
);
