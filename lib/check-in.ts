import type { Database } from "./database";
import { availability, camperBedCapacity } from "./housing";

type Dorm = {
  id:number; name:string; building:string; usable:number; guests:number; occupants:number;
  min_age:number; max_age:number|null; group:string; open:boolean; needs_cleaning:boolean;
  guides:string[]; counselors:string[]; counselors_required:boolean;
};

export async function placementOptions(db:Database, week:number, age:number|null, group:string, currentDorm:number|null) {
  if (age === null) return [];
  const { rows } = await db.query<Dorm>(
    `SELECT d.id,d.name,b.name AS building,COALESCE(wd.usable_beds,d.default_usable_beds,d.physical_beds) AS usable,
      wd.guest_beds AS guests,wd.minimum_age AS min_age,wd.maximum_age AS max_age,wd.gender_group AS "group",
      d.active AND wd.in_service AS open,d.needs_cleaning,w.minimum_age < 18 AS counselors_required,
      ARRAY(SELECT s.name FROM weekly_dorm_staff x JOIN staff_member s ON s.id=x.staff_id
        WHERE x.week_id=wd.week_id AND x.dorm_id=d.id AND COALESCE(x.assignment_role,s.team_role)='guide' AND s.adult ORDER BY s.name,s.id) AS guides,
      ARRAY(SELECT s.name FROM weekly_dorm_staff x JOIN staff_member s ON s.id=x.staff_id
        WHERE x.week_id=wd.week_id AND x.dorm_id=d.id AND COALESCE(x.assignment_role,s.team_role)='equipante' ORDER BY s.name,s.id) AS counselors,
      (SELECT count(*)::integer FROM camper_placement p WHERE p.week_id=wd.week_id AND p.dorm_id=d.id) AS occupants
     FROM weekly_dorm wd JOIN camp_week w ON w.id=wd.week_id JOIN dorm d ON d.id=wd.dorm_id JOIN building b ON b.id=d.building_id
     WHERE wd.week_id=$1 AND d.room_kind='camper' AND wd.gender_group=$2 AND $3 >= wd.minimum_age AND (wd.maximum_age IS NULL OR $3 <= wd.maximum_age)
     ORDER BY b.name,d.name,d.id`, [week,group,age],
  );
  return rows.map(room => ({
    ...room, beds:camperBedCapacity(room.usable,room.guests,room.guides.length)
      - room.occupants + Number(room.id === currentDorm),
  })).filter(room => availability(room.open && !room.needs_cleaning,room.beds,room.guides.length,room.counselors.length,room.counselors_required) === "ready");
}
