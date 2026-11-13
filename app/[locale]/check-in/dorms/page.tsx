import Link from "next/link";
import { campWeekOptions, listCampWeeks } from "../../../../lib/camp-week";
import { getDatabase } from "../../../../lib/database";
import { camperBedCapacity } from "../../../../lib/housing";
import { copy } from "../../../../lib/copy";
import { checkInCopy } from "../../../../lib/check-in-copy";
import { requireReview, ReviewFrame } from "../../intake/review-frame";
import { WeekSelector } from "../../week-selector";

type Room = {id:number;name:string;building:string;usable:number;guests:number;guides:string[];counselors:string[]};
type Camper = {id:string;name:string;dorm_id:number|null;departure_recorded:boolean};

export default async function DormAssignments({ params, searchParams }: {
  params:Promise<{locale:string}>; searchParams:Promise<{week?:string}>;
}) {
  const { locale } = await requireReview((await params).locale);
  const { week:requested } = await searchParams;
  const t = checkInCopy[locale], c = copy[locale];
  const labels = locale === "en"
    ? {title:"Dorm assignments", back:"Back to check-in", occupied:"Campers assigned", empty:"No campers assigned", noArrivals:"No campers have checked in for this week.", view:"View week"}
    : {title:"Asignaciones de dormitorios", back:"Volver a Llegada", occupied:"Campistas asignados", empty:"Sin campistas asignados", noArrivals:"Aún no han llegado campistas para esta semana.", view:"Ver semana"};
  const db = await getDatabase();
  const weeks = await listCampWeeks(db);
  const week = weeks.find(item => String(item.id) === requested) ?? weeks[0];
  const [rooms,campers] = week ? await Promise.all([
    db.query<Room>(
      `SELECT d.id,d.name,b.name AS building,COALESCE(w.usable_beds,d.default_usable_beds,d.physical_beds) AS usable,w.guest_beds AS guests,
        ARRAY(SELECT s.name FROM weekly_dorm_staff x JOIN staff_member s ON s.id=x.staff_id
          WHERE x.week_id=w.week_id AND x.dorm_id=d.id AND COALESCE(x.assignment_role,s.team_role)='guide' AND s.adult ORDER BY s.name,s.id) AS guides,
        ARRAY(SELECT s.name FROM weekly_dorm_staff x JOIN staff_member s ON s.id=x.staff_id
          WHERE x.week_id=w.week_id AND x.dorm_id=d.id AND COALESCE(x.assignment_role,s.team_role)='equipante' ORDER BY s.name,s.id) AS counselors
        FROM weekly_dorm w JOIN dorm d ON d.id=w.dorm_id JOIN building b ON b.id=d.building_id
        WHERE w.week_id=$1 AND d.room_kind='camper'`,[week.id],
    ).then(result => result.rows),
    db.query<Camper>(
      `SELECT r.id,r.first_name || ' ' || r.last_name AS name,p.dorm_id,
         EXISTS(SELECT 1 FROM camper_departure d WHERE d.registration_id=r.id) AS departure_recorded
       FROM registration r JOIN camper_arrival a ON a.registration_id=r.id AND a.voided_at IS NULL
       LEFT JOIN camper_placement p ON p.registration_id=r.id AND p.week_id=r.week_id
       WHERE r.week_id=$1 ORDER BY lower(r.last_name),lower(r.first_name),r.id`,[week.id],
    ).then(result => result.rows),
  ]) : [[],[]];
  const groups = new Map<number|null,Camper[]>();
  for (const camper of campers) {
    const group = groups.get(camper.dorm_id) ?? [];
    group.push(camper);
    groups.set(camper.dorm_id,group);
  }
  const order = new Intl.Collator(locale,{numeric:true});
  rooms.sort((a,b) => order.compare(a.building,b.building) || order.compare(a.name,b.name) || a.id-b.id);
  const base = "/"+locale+"/check-in";
  const camperList = (list:Camper[], assigned:boolean) => <ul>{list.map(camper => <li key={camper.id}>
    {camper.name}{!camper.departure_recorded && week && <> · <Link href={base+"?week="+week.id+"&camper="+camper.id+"#camper-check-in"}>
      {assigned ? t.change : t.assign}
    </Link></>}
  </li>)}</ul>;

  return <ReviewFrame locale={locale} section="check-in/dorms" title={labels.title} week={week?.id}>
    {week && <>
      <p><Link href={base+"?week="+week.id}>{labels.back}</Link></p>
      {weeks.length > 1 && <WeekSelector key={week.id} weeks={campWeekOptions(weeks,locale)} selected={week.id} label={t.week} submitLabel={labels.view} />}
      <h2>{week.name}</h2>
      {!campers.length && <p>{labels.noArrivals}</p>}
      {(groups.get(null)?.length ?? 0) > 0 && <section className="card"><h2>{t.unassigned}</h2>{camperList(groups.get(null)!,false)}</section>}
      <div className="dorms">{rooms.map(room => {
        const assigned = groups.get(room.id) ?? [];
        const capacity = camperBedCapacity(room.usable,room.guests,room.guides.length);
        return <section className="card" key={room.id}>
          <h3>{room.building} · {room.name}</h3>
          <p>{labels.occupied}: {assigned.length} / {capacity}</p>
          <p>{c.guides}: {room.guides.join(", ") || "—"}<br />{c.helpers}: {room.counselors.join(", ") || "—"}</p>
          {assigned.length ? camperList(assigned,true) : <p className="muted">{labels.empty}</p>}
        </section>;
      })}</div>
    </>}
  </ReviewFrame>;
}
