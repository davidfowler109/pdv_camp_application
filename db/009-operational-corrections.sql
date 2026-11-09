ALTER TABLE camper_arrival ADD COLUMN IF NOT EXISTS voided_at timestamptz;
ALTER TABLE camper_arrival ADD COLUMN IF NOT EXISTS revision integer NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS camper_operation_correction (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  registration_id uuid NOT NULL REFERENCES registration(id),
  operation text NOT NULL CHECK (operation IN ('correctArrival','undoArrival','undoBoarding','correctDeparture')),
  reason text NOT NULL CHECK (length(trim(reason))>0),
  recorded_by text NOT NULL,
  previous_record jsonb NOT NULL,
  recorded_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS camper_operation_correction_registration ON camper_operation_correction(registration_id,id);
