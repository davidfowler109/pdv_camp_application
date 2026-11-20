ALTER TABLE camp_transport_history ADD COLUMN IF NOT EXISTS registration_id uuid REFERENCES registration(id);
