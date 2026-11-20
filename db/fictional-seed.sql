INSERT INTO camp_week (name, minimum_age, maximum_age, capacity)
VALUES ('Semana 3 / Week 3', 11, 12, 250);
INSERT INTO camp_transport_route(id,week_id,name,vehicle)
SELECT md5('fictional-route-'||id)::uuid,id,'Sample route / Ruta de ejemplo','Sample bus / Autobús de ejemplo' FROM camp_week;
INSERT INTO camp_transport_stop(id,week_id,route_id,leg,location,time_of_day,notes)
SELECT md5('fictional-stop-'||w.id||s.leg||s.location)::uuid,w.id,md5('fictional-route-'||w.id)::uuid,s.leg,s.location,s.time::time,''
FROM camp_week w CROSS JOIN (VALUES ('arrival','Albrook','07:30'),('arrival','Westland','08:00'),('arrival','La Espiga','08:30'),
 ('departure','Albrook','16:30'),('departure','Westland','16:00'),('departure','La Espiga','15:30')) AS s(leg,location,time);
INSERT INTO building (name) VALUES ('Bosque'), ('Mirador');
INSERT INTO dorm (building_id, name, physical_beds)
SELECT id, 'Cedro', 12 FROM building WHERE name = 'Bosque'
UNION ALL SELECT id, 'Pino', 8 FROM building WHERE name = 'Mirador';
INSERT INTO staff_member (name, team_role, adult) VALUES
  ('Lucía', 'guide', true), ('Elena', 'guide', true),
  ('Ana', 'equipante', false), ('Sofía', 'equipante', true), ('María', 'equipante', false);
INSERT INTO weekly_dorm (week_id, dorm_id, minimum_age, maximum_age, usable_beds, guest_beds, gender_group, in_service)
SELECT w.id, d.id, 11, 12, d.physical_beds, 0, 'female', true FROM camp_week w CROSS JOIN dorm d;
INSERT INTO weekly_dorm_staff (week_id, dorm_id, staff_id)
SELECT wd.week_id, wd.dorm_id, s.id
FROM weekly_dorm wd JOIN dorm d ON d.id = wd.dorm_id CROSS JOIN staff_member s
WHERE (d.name = 'Cedro' AND s.name IN ('Lucía', 'Elena', 'Ana', 'Sofía'))
   OR (d.name = 'Pino' AND s.name = 'María');
