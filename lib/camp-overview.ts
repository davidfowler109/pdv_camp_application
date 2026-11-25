import type {Database} from './database';

// Boarding is preparation for departure. The bus must actually leave camp.
export const departedFromCampSql = "(departure.registration_id IS NOT NULL AND (departure.method<>'bus' OR bus.departed_at IS NOT NULL))";
export const attendanceViews = ['arrived','atCamp','departed','expected'] as const;
export type AttendanceView = typeof attendanceViews[number];
export function attendanceView(value:unknown):AttendanceView|'' {
 return attendanceViews.find(view=>view===value)??'';
}
export function attendanceFilterSql(view:AttendanceView|'') {
 if(view==='arrived')return 'a.registration_id IS NOT NULL';
 if(view==='atCamp')return `a.registration_id IS NOT NULL AND NOT ${departedFromCampSql}`;
 if(view==='departed')return `a.registration_id IS NOT NULL AND ${departedFromCampSql}`;
 if(view==='expected')return "r.place_status='confirmed' AND a.registration_id IS NULL";
 return 'true';
}

export type OverviewWeek = {
 id:number;name:string;start:string|null;end:string|null;capacity:number;
 registered:number;confirmed:number;released:number;arrived:number;atCamp:number;departed:number;expected:number;remaining:number;
};
export async function campOverview(db:Database):Promise<OverviewWeek[]> {
 const {rows}=await db.query<OverviewWeek>(`SELECT w.id,w.name,w.starts_on::text AS start,w.ends_on::text AS end,w.capacity,
  count(r.id) FILTER(WHERE r.place_status<>'released')::integer AS registered,
  count(r.id) FILTER(WHERE r.place_status='confirmed')::integer AS confirmed,
  count(r.id) FILTER(WHERE r.place_status='released')::integer AS released,
  count(a.registration_id)::integer AS arrived,
  count(a.registration_id) FILTER(WHERE NOT ${departedFromCampSql})::integer AS "atCamp",
  count(a.registration_id) FILTER(WHERE ${departedFromCampSql})::integer AS departed,
  count(r.id) FILTER(WHERE r.place_status='confirmed' AND a.registration_id IS NULL)::integer AS expected,
  GREATEST(0,w.capacity-count(r.id) FILTER(WHERE r.place_status='confirmed'))::integer AS remaining
 FROM camp_week w LEFT JOIN registration r ON r.week_id=w.id
 LEFT JOIN camper_arrival a ON a.registration_id=r.id AND a.voided_at IS NULL
 LEFT JOIN camper_departure departure ON departure.registration_id=a.registration_id
 LEFT JOIN return_bus bus ON bus.week_id=departure.week_id AND bus.bus_key=departure.bus_key
 GROUP BY w.id ORDER BY w.starts_on NULLS LAST,w.id`);
 return rows;
}
export function overviewSeasons(weeks:OverviewWeek[]) {
 return [...new Set(weeks.map(w=>w.start?.slice(0,4)??'undated'))].sort();
}
export function defaultOverviewSeason(seasons:string[],today:string) {
 const year=today.slice(0,4),dated=seasons.filter(s=>s!=='undated');
 return dated.find(s=>s>=year)??dated.at(-1)??seasons[0]??year;
}
