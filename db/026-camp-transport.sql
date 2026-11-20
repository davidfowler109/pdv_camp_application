ALTER TABLE camp_week ADD COLUMN IF NOT EXISTS transport_revision integer NOT NULL DEFAULT 0;
CREATE TABLE IF NOT EXISTS camp_transport_route (
  id uuid PRIMARY KEY,week_id integer NOT NULL REFERENCES camp_week(id),
  name text NOT NULL,vehicle text NOT NULL,active boolean NOT NULL DEFAULT true,revision integer NOT NULL DEFAULT 1,
  UNIQUE(id,week_id)
);
CREATE TABLE IF NOT EXISTS camp_transport_stop (
  id uuid PRIMARY KEY,week_id integer NOT NULL,route_id uuid NOT NULL,
  leg text NOT NULL CHECK(leg IN ('arrival','departure')),location text NOT NULL,
  time_of_day time without time zone,notes text NOT NULL DEFAULT '',active boolean NOT NULL DEFAULT true,revision integer NOT NULL DEFAULT 1,
  FOREIGN KEY(route_id,week_id) REFERENCES camp_transport_route(id,week_id)
);
CREATE TABLE IF NOT EXISTS camp_transport_history (
  request_id uuid PRIMARY KEY,request_signature text NOT NULL,week_id integer NOT NULL REFERENCES camp_week(id),
  operation text NOT NULL,recorded_by text NOT NULL,reason text NOT NULL,
  previous_plan jsonb NOT NULL,resulting_plan jsonb NOT NULL,recorded_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
);
-- Preserve existing pickup choices for weeks already in the pilot. Return times remain unknown.
CREATE TABLE IF NOT EXISTS camp_transport_bootstrap (id boolean PRIMARY KEY CHECK(id));
DO $$ BEGIN
IF NOT EXISTS(SELECT 1 FROM camp_transport_bootstrap) THEN
INSERT INTO camp_transport_route(id,week_id,name,vehicle)
SELECT md5('initial-camp-route-'||id)::uuid,id,'Camp bus / Autobús del campamento','To be assigned / Por asignar' FROM camp_week ON CONFLICT DO NOTHING;
INSERT INTO camp_transport_stop(id,week_id,route_id,leg,location,time_of_day,notes)
SELECT md5('initial-camp-stop-'||w.id||s.leg||s.location)::uuid,w.id,md5('initial-camp-route-'||w.id)::uuid,s.leg,s.location,s.pickup::time,s.notes
FROM camp_week w CROSS JOIN (VALUES
 ('arrival','Albrook','07:30','Dinosaur parking area / Estacionamientos del Dinosaurio'),
 ('arrival','Westland','08:00','Bus stop / Parada de buses'),
 ('arrival','La Espiga','08:30','Bus stop / Parada de buses'),
 ('departure','Albrook',NULL,''),('departure','Westland',NULL,''),('departure','La Espiga',NULL,'')
) AS s(leg,location,pickup,notes) ON CONFLICT DO NOTHING;
INSERT INTO camp_transport_bootstrap(id) VALUES(true);
END IF;
END $$;
