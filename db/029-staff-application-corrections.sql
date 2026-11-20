ALTER TABLE staff_application DROP CONSTRAINT IF EXISTS staff_application_status_check;
ALTER TABLE staff_application ADD CONSTRAINT staff_application_status_check
  CHECK(status IN ('draft','submitted','review','information','approved','declined','withdrawn'));
ALTER TABLE staff_application ADD COLUMN IF NOT EXISTS staff_review_required boolean NOT NULL DEFAULT false;

ALTER TABLE staff_application_document ADD COLUMN IF NOT EXISTS removed_at timestamptz;
ALTER TABLE staff_application_document ADD COLUMN IF NOT EXISTS removed_by text;
ALTER TABLE staff_application_document ADD COLUMN IF NOT EXISTS removal_reason text;
ALTER TABLE staff_application_document ADD COLUMN IF NOT EXISTS filename text NOT NULL DEFAULT '';
ALTER TABLE staff_application_document ALTER COLUMN content DROP NOT NULL;
DO $$ BEGIN
  ALTER TABLE staff_application_document ADD CONSTRAINT staff_document_content_state
    CHECK((removed_at IS NULL AND content IS NOT NULL) OR (removed_at IS NOT NULL AND content IS NULL));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Minimal deletion receipt: no application answers, references or file contents.
CREATE TABLE IF NOT EXISTS staff_application_deletion (
  application_id uuid PRIMARY KEY,season integer NOT NULL,requested_role text NOT NULL,
  actor text NOT NULL,recorded_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
);
