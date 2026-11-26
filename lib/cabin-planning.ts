import type { Database } from "./database";
import { ageOn } from "./registration.ts";
import { camperBedCapacity } from "./housing.ts";

export type PlanningWeek = {id:number;name:string;minimum_age:number;maximum_age:number|null;cabin_age_group_size:number;start:string|null};
export type PlanningCamper = {id:string;name:string;birth:string;group:string;status:string;dorm_id:number|null};
export type PlanningCabin = {id:number;name:string;building:string;configured:boolean;open:boolean;usable:number;guests:number;leaders:number;occupants:number;min:number|null;max:number|null;group:string|null;needs_cleaning:boolean};

export function cabinDemand(week:PlanningWeek, campers:PlanningCamper[], cabins:PlanningCabin[], today:string) {
  const on = week.start ?? today;
  const size = week.cabin_age_group_size;
  // Reserve the required adult beds even while leadership is still recruiting.
  const rooms = cabins.map(room=>({...room,beds:camperBedCapacity(room.usable,room.guests,Math.max(2,room.leaders))}));
  const entries = campers.filter(camper=>camper.status!=="released").map(camper=>{
    const age = ageOn(camper.birth,on);
    const withinWeek = age!==null && age>=week.minimum_age && (week.maximum_age===null || age<=week.maximum_age);
    const eligible = rooms.filter(room=>room.configured && room.open && room.group===camper.group &&
      age!==null && room.min!==null && age>=room.min && (room.max===null || age<=room.max) &&
      (room.beds-room.occupants>0 || (room.id===camper.dorm_id && room.beds>=room.occupants)));
    return {...camper,age,withinWeek,eligible,needsReview:!withinWeek || eligible.length===0};
  });
  const maximum = week.maximum_age ?? Math.max(week.minimum_age,...entries.flatMap(item=>item.age===null?[]:[item.age]));
  const bands = [];
  for(let min=week.minimum_age;min<=maximum;min+=size) {
    const max = Math.min(maximum,min+size-1);
    for(const group of ["female","male"] as const) {
      const members = entries.filter(item=>item.group===group && item.withinWeek && item.age!==null && item.age>=min && item.age<=max);
      bands.push({min,max,group,members,confirmed:members.filter(item=>item.status==="confirmed").length});
    }
  }
  const totals = (["female","male"] as const).map(group=>{
    const registered = entries.filter(item=>item.group===group).length;
    const beds = rooms.filter(room=>room.configured&&room.open&&room.group===group).reduce((sum,room)=>sum+room.beds,0);
    return {group,registered,beds,shortfall:Math.max(0,registered-beds)};
  });
  return {entries,bands,rooms,totals,exceptions:entries.filter(item=>item.needsReview),provisional:!week.start};
}

export async function loadCabinPlanning(db:Database,weekId:number,today:string) {
  const week = (await db.query<PlanningWeek>("SELECT id,name,minimum_age,maximum_age,cabin_age_group_size,starts_on::text AS start FROM camp_week WHERE id=$1",[weekId])).rows[0];
  if(!week)return null;
  const [campers,cabins] = await Promise.all([
    db.query<PlanningCamper>(`SELECT r.id,r.first_name||' '||r.last_name AS name,r.date_of_birth::text AS birth,
      r.gender_group AS "group",r.place_status AS status,p.dorm_id FROM registration r
      LEFT JOIN camper_placement p ON p.registration_id=r.id AND p.week_id=r.week_id
      WHERE r.week_id=$1 AND r.place_status<>'released' ORDER BY r.last_name,r.first_name,r.id`,[weekId]),
    db.query<PlanningCabin>(`SELECT d.id,d.name,b.name AS building,wd.dorm_id IS NOT NULL AS configured,
      d.active AND COALESCE(wd.in_service,false) AS open,d.needs_cleaning,
      COALESCE(wd.usable_beds,d.default_usable_beds,d.physical_beds) AS usable,COALESCE(wd.guest_beds,0) AS guests,
      wd.minimum_age AS min,wd.maximum_age AS max,wd.gender_group AS "group",
      (SELECT count(*)::integer FROM weekly_dorm_staff x JOIN staff_member s ON s.id=x.staff_id
        WHERE x.week_id=$1 AND x.dorm_id=d.id AND s.adult AND COALESCE(x.assignment_role,s.team_role)='guide') AS leaders,
      (SELECT count(*)::integer FROM camper_placement p WHERE p.week_id=$1 AND p.dorm_id=d.id) AS occupants
      FROM dorm d JOIN building b ON b.id=d.building_id
      LEFT JOIN weekly_dorm wd ON wd.week_id=$1 AND wd.dorm_id=d.id WHERE d.room_kind='camper' ORDER BY b.name,d.name,d.id`,[weekId]),
  ]);
  return {week,...cabinDemand(week,campers.rows,cabins.rows,today)};
}
