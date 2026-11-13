import { randomUUID } from "node:crypto";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { isLocale } from "../../../../lib/copy";
import { currentRole } from "../../../../lib/session";
import { getDatabase } from "../../../../lib/database";
import { visitIdPattern } from "../../../../lib/church-visits";
import { attendanceState, type AttendanceOperation, type AttendancePerson } from "../../../../lib/visit-attendance-state";
import { visitAttendanceCopy } from "../../../../lib/visit-attendance-copy";
import { getVisitHousing, visitHousingIssues } from "../../../../lib/visit-housing";
import { ReviewFrame } from "../../intake/review-frame";
import { AttendanceForm } from "./attendance-form";

export default async function VisitAttendance({params,searchParams}: {
  params:Promise<{locale:string}>;searchParams:Promise<{visit?:string;state?:string;q?:string;saved?:string}>;
}) {
  const {locale} = await params;
  if (!isLocale(locale)) notFound();
  if (await currentRole() !== "leadership") redirect("/"+locale);
  const query = await searchParams;
  const id = query.visit;
  if (!id || !visitIdPattern.test(id)) redirect("/"+locale+"/church-visits");
  const db = await getDatabase();
  const housing = await getVisitHousing(db,id);
  if (!housing) notFound();
  const t = visitAttendanceCopy[locale];
  const [people,history] = await Promise.all([
    db.query<AttendancePerson>(`SELECT v.id,v.first_name,v.last_name,v.visitor_role,v.presence_revision,v.withdrawn_at::text AS withdrawn_at,
      to_char(v.arrived_at AT TIME ZONE 'America/Panama','YYYY-MM-DD HH24:MI') AS arrived_at,
      to_char(v.departed_at AT TIME ZONE 'America/Panama','YYYY-MM-DD HH24:MI') AS departed_at,
      b.name || ' · ' || d.name AS room FROM church_visitor v LEFT JOIN visit_placement p ON p.visitor_id=v.id
      LEFT JOIN dorm d ON d.id=p.dorm_id LEFT JOIN building b ON b.id=d.building_id
      WHERE v.visit_id=$1 ORDER BY lower(v.last_name),lower(v.first_name),v.id`,[id]).then(result => result.rows),
    db.query<{id:string;operation:AttendanceOperation;recorded_by:string;notes:string;visitor_count:number;date:string;names:string[]}>(
      `SELECT b.id,b.operation,b.recorded_by,b.notes,b.visitor_count,
        to_char(b.recorded_at AT TIME ZONE 'America/Panama','YYYY-MM-DD HH24:MI') AS date,
        ARRAY(SELECT v.first_name || ' ' || v.last_name FROM visit_attendance_event e JOIN church_visitor v ON v.id=e.visitor_id
          WHERE e.batch_id=b.id ORDER BY v.last_name,v.first_name,v.id) AS names
       FROM visit_attendance_batch b WHERE b.visit_id=$1 ORDER BY b.recorded_at DESC,b.id DESC LIMIT 50`,[id]).then(result => result.rows),
  ]);
  const counts = {expected:0,present:0,departed:0,withdrawn:0};
  for (const person of people) counts[attendanceState(person)]++;
  const state = ["all","expected","present","departed","withdrawn"].includes(query.state ?? "") ? query.state! : counts.present ? "present" : "expected";
  const search = (query.q ?? "").trim().slice(0,100);
  const filtered = people.filter(person => (state === "all" || attendanceState(person) === state) && (person.first_name+" "+person.last_name).toLocaleLowerCase().includes(search.toLocaleLowerCase()));
  const base = "/"+locale+"/church-visits";
  const warnings = visitHousingIssues(housing);
  const saved = /^\d{1,4}$/.test(query.saved ?? "") ? Math.min(1000,Number(query.saved)) : 0;
  const batch = randomUUID();
  return <ReviewFrame locale={locale} section="church-visits/attendance" title={t.title} visit={id}>
    <p><Link href={base+"?visit="+id}>{t.setup}</Link>{" · "}<Link href={base+"/visitors?visit="+id}>{t.roster}</Link>{" · "}<Link href={base+"/housing?visit="+id}>{t.housing}</Link></p>
    <h2>{housing.visit.name}</h2>
    <p className="muted">{t.when}</p>
    {housing.visit.cancelled_at && <p className="notice">{t.closed}</p>}
    {saved > 0 && <p className="notice" role="status">{t.saved} · {saved}</p>}
    <section className="card"><h2>{t.summary}</h2><div className="actions">
      {(["expected","present","departed","withdrawn"] as const).map(value => <Link key={value} href={base+"/attendance?"+new URLSearchParams({visit:id,state:value})}>{t[value]} {counts[value]}</Link>)}
    </div><p><strong>{t.stillHere} {counts.present}</strong></p>
      {counts.present > 0 && warnings.length > 0 && <p className="notice"><Link href={base+"/housing?visit="+id}>{t.roomReview}</Link></p>}
    </section>
    <section className="card"><form method="get"><input name="visit" type="hidden" value={id} /><div className="grid">
      <label><span>{t.search}</span><input name="q" maxLength={100} defaultValue={search} /></label>
      <label><span>{t.filter}</span><select name="state" defaultValue={state}>
        {(["all","expected","present","departed","withdrawn"] as const).map(value => <option key={value} value={value}>{t[value]}</option>)}
      </select></label>
    </div><button>{t.searchButton}</button></form></section>
    <AttendanceForm key={batch} locale={locale} visit={id} batch={batch} people={filtered} filter={state} search={search} closed={Boolean(housing.visit.cancelled_at)} />
    <section className="card"><details><summary>{t.history}</summary>{history.length ? <ul>{history.map(item => <li key={item.id}>
      <strong>{t[item.operation]}</strong> · {item.date} · {item.recorded_by} · {t.affected} {item.visitor_count}
      {item.notes && <p>{item.notes}</p>}<details><summary>{t.name}</summary><ul>{item.names.map((name,index) => <li key={index}>{name}</li>)}</ul></details>
    </li>)}</ul> : <p>{t.noHistory}</p>}</details></section>
  </ReviewFrame>;
}
