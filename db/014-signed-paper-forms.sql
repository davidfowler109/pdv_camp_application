CREATE TABLE IF NOT EXISTS registration_signed_form (
  id uuid PRIMARY KEY,
  registration_id uuid NOT NULL REFERENCES registration(id) ON DELETE CASCADE,
  content_type text NOT NULL CHECK (content_type IN ('image/jpeg','image/png','application/pdf')),
  content bytea NOT NULL CHECK (octet_length(content) BETWEEN 1 AND 10485760),
  uploaded_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS registration_signed_form_registration ON registration_signed_form(registration_id);

CREATE OR REPLACE FUNCTION signed_form_expires_on(week_end date, received timestamptz)
RETURNS date LANGUAGE sql IMMUTABLE AS $$
  SELECT (COALESCE(week_end,(received AT TIME ZONE 'America/Panama')::date) + interval '15 months')::date
$$;

CREATE OR REPLACE FUNCTION purge_expired_signed_forms()
RETURNS void LANGUAGE sql AS $$
  DELETE FROM registration_signed_form f
  USING registration r, camp_week w
  WHERE f.registration_id=r.id AND w.id=r.week_id
    AND signed_form_expires_on(w.ends_on,r.received_at) <= (CURRENT_TIMESTAMP AT TIME ZONE 'America/Panama')::date
$$;

SELECT purge_expired_signed_forms();
