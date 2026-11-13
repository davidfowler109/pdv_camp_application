import type { Database } from "./database";
import { dateParts } from "./registration.ts";

export function validFacilityTime(value:string) {
  return /^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d$/.test(value) && Boolean(dateParts(value.slice(0,10)));
}

export function endOfCampBlock(date:string) {
  return new Date(Date.parse(date)+86400000).toISOString().slice(0,10);
}

export async function lockFacilityRooms(db:Database, rooms:number[]) {
  return (await db.query<{id:number;active:boolean}>(
    "SELECT id,active FROM dorm WHERE id=ANY($1::integer[]) ORDER BY id FOR UPDATE",[rooms],
  )).rows;
}

export async function roomConflict(db:Database, rooms:number[], start:string, end:string, turnover:number, eventId:string|null, includeCamp:boolean, visitId:string|null = null) {
  if (!rooms.length) return undefined;
  const { rows } = await db.query<{room:string;booking:string}>(
    `SELECT room,booking FROM (
      SELECT b.name || ' · ' || d.name AS room,e.name AS booking
      FROM event_room_reservation er JOIN special_event e ON e.id=er.event_id
      JOIN dorm d ON d.id=er.dorm_id JOIN building b ON b.id=d.building_id
      WHERE er.dorm_id=ANY($1::integer[]) AND e.cancelled_at IS NULL AND ($5::uuid IS NULL OR e.id<>$5)
        AND e.starts_at < $3::timestamp + $4::integer * interval '1 minute'
        AND e.ends_at + e.turnover_minutes * interval '1 minute' > $2::timestamp
      UNION ALL
      SELECT b.name || ' · ' || d.name,v.name
      FROM visit_room_reservation vr JOIN church_visit v ON v.id=vr.visit_id
      JOIN dorm d ON d.id=vr.dorm_id JOIN building b ON b.id=d.building_id
      WHERE vr.dorm_id=ANY($1::integer[]) AND v.cancelled_at IS NULL AND ($7::uuid IS NULL OR v.id<>$7)
        AND v.starts_at < $3::timestamp + $4::integer * interval '1 minute'
        AND v.ends_at + v.turnover_minutes * interval '1 minute' > $2::timestamp
      UNION ALL
      SELECT b.name || ' · ' || d.name,w.name
      FROM weekly_dorm wd JOIN camp_week w ON w.id=wd.week_id
      JOIN dorm d ON d.id=wd.dorm_id JOIN building b ON b.id=d.building_id
      WHERE $6::boolean AND wd.dorm_id=ANY($1::integer[]) AND wd.in_service AND d.active
        AND w.starts_on::timestamp < $3::timestamp + $4::integer * interval '1 minute'
        AND (w.ends_on+1)::timestamp > $2::timestamp
    ) conflicts ORDER BY room,booking LIMIT 1`,[rooms,start,end,turnover,eventId,includeCamp,visitId],
  );
  return rows[0];
}
