import { randomUUID } from "node:crypto";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getDatabase } from "../../../../lib/database";
import { isLocale } from "../../../../lib/copy";
import { currentRole } from "../../../../lib/session";
import { ageOn, panamaDate } from "../../../../lib/registration";
import { visitIdPattern } from "../../../../lib/church-visits";
import type { ChurchVisitor } from "../../../../lib/church-visitors";
import { churchVisitorCopy } from "../../../../lib/church-visitor-copy";
import { ReviewFrame } from "../../intake/review-frame";
import { VisitorForm } from "../visitor-form";
import { VisitorStatusForm } from "../visitor-status-form";
import { RegistrationLink } from "../registration-link";
import { getVisitHousing, visitHousingIssues } from "../../../../lib/visit-housing";
import { visitHousingCopy } from "../../../../lib/visit-housing-copy";
import { attendanceState } from "../../../../lib/visit-attendance-state";
import { visitAttendanceCopy } from "../../../../lib/visit-attendance-copy";
import { VisitorRosterFilters } from "./roster-filters";

type Acknowledgment = {id:number; leader_name:string; wording:string; version:string; date:string; source:"online"|"desk"; evidence_source:string|null; recorded_by:string|null; current:boolean};
type History = {id:number;operation:"edit"|"withdraw"|"restore";recorded_by:string;reason:string;date:string};
const pageSize = 25;

export default async function Visitors({params,searchParams}: {
  params:Promise<{locale:string}>;
  searchParams:Promise<{visit?:string;visitor?:string;entry?:string;q?:string;role?:string;status?:string;page?:string}>;
}) {
  const {locale} = await params;
  if (!isLocale(locale)) notFound();
  if (await currentRole() !== "leadership") redirect("/"+locale);
  const query = await searchParams;
  const id = query.visit;
  if (!id || !visitIdPattern.test(id)) redirect("/"+locale+"/church-visits");
  const db = await getDatabase();
  const visit = (await db.query<{name:string;start:string;cancelled_at:string|null;expected_students:number;expected_adults:number;expected_leaders:number}>(
    "SELECT name,starts_at::date::text AS start,cancelled_at,expected_students,expected_adults,expected_leaders FROM church_visit WHERE id=$1",[id],
  )).rows[0];
  if (!visit) notFound();
  const t = churchVisitorCopy[locale];
  const base = "/"+locale+"/church-visits/visitors";
  const setup = "/"+locale+"/church-visits?visit="+id;
  const publicUrl = "/"+locale+"/church-visits/register/"+id;
  const enabled = !visit.cancelled_at && process.env.PDV_LOCAL_DEMO === "1";
  const search = (query.q ?? "").trim().slice(0,100);
  const role = ["student","adult","leader"].includes(query.role ?? "") ? query.role! : "";
  const status = ["active","withdrawn","all"].includes(query.status ?? "") ? query.status! : "active";
  const link = (extra:Record<string,string> = {}) => base+"?"+new URLSearchParams({visit:id,q:search,role,status,...extra});

  if (enabled && query.entry === "desk") return <ReviewFrame locale={locale} section="church-visits/visitors" title={t.add} visit={id}>
    <p><Link href={link()}>{t.back}</Link> · <Link href={setup}>{t.setup}</Link></p><h2>{visit.name}</h2>
    <VisitorForm locale={locale} visit={id} id={randomUUID()} mode="desk" today={panamaDate()} />
  </ReviewFrame>;

  const filter = `visit_id=$1 AND strpos(lower(first_name || ' ' || last_name),lower($2))>0
    AND ($3='' OR visitor_role=$3) AND ($4='all' OR (withdrawn_at IS NULL)=($4='active'))`;
  const [counts,matching,acknowledgments,housing] = await Promise.all([
    db.query<{students:number;adults:number;leaders:number}>(`SELECT
      count(*) FILTER (WHERE visitor_role='student')::integer AS students,
      count(*) FILTER (WHERE visitor_role='adult')::integer AS adults,
      count(*) FILTER (WHERE visitor_role='leader')::integer AS leaders
      FROM church_visitor WHERE visit_id=$1 AND withdrawn_at IS NULL`,[id]).then(result => result.rows[0]),
    db.query<{count:number}>("SELECT count(*)::integer AS count FROM church_visitor WHERE "+filter,[id,search,role,status]).then(result => result.rows[0].count),
    db.query<Acknowledgment>(`SELECT a.id,a.leader_name,a.wording,a.version,a.source,a.evidence_source,a.recorded_by,
      to_char(a.acknowledged_at AT TIME ZONE 'America/Panama','YYYY-MM-DD HH24:MI') AS date,
      (v.withdrawn_at IS NULL AND v.visitor_role='leader' AND a.leader_name=v.first_name || ' ' || v.last_name
        AND v.date_of_birth+interval '18 years' <= a.acknowledged_at AT TIME ZONE 'America/Panama') AS current
      FROM church_visit_acknowledgment a JOIN church_visitor v ON v.id=a.visitor_id
      WHERE a.visit_id=$1 ORDER BY a.acknowledged_at,a.id`,[id]).then(result => result.rows),
    getVisitHousing(db,id),
  ]);
  const pages = Math.max(1,Math.ceil(matching/pageSize));
  const page = /^\d{1,6}$/.test(query.page ?? "") ? Math.min(pages,Math.max(1,Number(query.page))) : 1;
  const fields = "*,date_of_birth::text AS date_of_birth,withdrawn_at::text AS withdrawn_at";
  const [visitors,selected,history] = await Promise.all([
    db.query<ChurchVisitor>(`SELECT id,first_name,last_name,date_of_birth::text AS date_of_birth,visitor_role,withdrawn_at,
      arrived_at::text AS arrived_at,departed_at::text AS departed_at
      FROM church_visitor WHERE ${filter} ORDER BY lower(last_name),lower(first_name),id LIMIT $5 OFFSET $6`,
      [id,search,role,status,pageSize,(page-1)*pageSize]).then(result => result.rows),
    query.visitor && visitIdPattern.test(query.visitor)
      ? db.query<ChurchVisitor>("SELECT "+fields+" FROM church_visitor WHERE visit_id=$1 AND id=$2",[id,query.visitor]).then(result => result.rows[0])
      : undefined,
    query.visitor && visitIdPattern.test(query.visitor)
      ? db.query<History>(`SELECT h.id,h.operation,h.recorded_by,h.reason,
        to_char(h.changed_at AT TIME ZONE 'America/Panama','YYYY-MM-DD HH24:MI') AS date
        FROM church_visitor_history h JOIN church_visitor v ON v.id=h.visitor_id
        WHERE v.visit_id=$1 AND v.id=$2 ORDER BY h.changed_at DESC,h.id DESC`,[id,query.visitor]).then(result => result.rows)
      : [],
  ]);
  if (query.visitor && !selected) notFound();
  const total = counts.students+counts.adults+counts.leaders;
  const expected = visit.expected_students+visit.expected_adults+visit.expected_leaders;
  const acknowledged = acknowledgments.some(item => item.current);
  const housingUrl = "/"+locale+"/church-visits/housing?visit="+id;
  const published = Boolean(housing?.visit.housing_published_at) && housing !== null && !visitHousingIssues(housing).length;
  const housingLabel = (visitorId:string) => {
    const placement = housing?.placements.find(item => item.visitor_id === visitorId);
    const room = housing?.rooms.find(item => item.id === placement?.dorm_id);
    return room ? room.building+" · "+room.name+" · "+(published ? visitHousingCopy[locale].published : visitHousingCopy[locale].draft) : t.unassigned;
  };
  return <ReviewFrame locale={locale} section="church-visits/visitors" title={t.roster} visit={id}>
    <p><Link href={setup}>{t.setup}</Link>{" · "}<Link href={housingUrl}>{visitHousingCopy[locale].title}</Link>{" · "}
      <Link href={"/"+locale+"/church-visits/attendance?visit="+id}>{visitAttendanceCopy[locale].title}</Link></p><h2>{visit.name}</h2>
    {visit.cancelled_at && <p className="notice">{t.closed}</p>}
    {enabled && <><p><Link className="action-link" href={link({entry:"desk"})}>{t.add}</Link>{" "}<Link href={publicUrl}>{t.publicLink}</Link></p>
      <RegistrationLink locale={locale} path={publicUrl} />
    </>}
    <section className="card"><p><strong>{t.registered} {total}</strong> · {t.expected} {expected}</p>
      <p>{t.student} {counts.students} / {visit.expected_students} · {t.adult} {counts.adults} / {visit.expected_adults} · {t.leader} {counts.leaders} / {visit.expected_leaders}</p>
      <p className={acknowledged ? undefined : "notice"}>{acknowledged ? t.ackRecorded : t.ackPending}</p>
      {!acknowledged && acknowledgments.length > 0 && <p>{t.ackHistorical}</p>}
      {acknowledgments.length > 0 && <details><summary>{t.ackHistory}</summary>{acknowledgments.map(item => <div key={item.id}>
        <p><strong>{item.leader_name}</strong> · {item.date} · {t[item.source]} · {item.version}</p><p>{item.wording}</p>
        {item.evidence_source && <p>{t.ackSource} · {item.evidence_source}</p>}{item.recorded_by && <p>{t.recorder} · {item.recorded_by}</p>}
      </div>)}</details>}
    </section>
    {selected && <section className="card"><h2>{selected.first_name} {selected.last_name}</h2>
      <p>{selected.withdrawn_at ? t.withdrawn : t.active} · {t[selected.visitor_role]} · {t.age} {ageOn(selected.date_of_birth,visit.start)}</p>
      {!selected.withdrawn_at && <p><Link href={housingUrl+"#visitor-"+selected.id}>{housingLabel(selected.id)}</Link></p>}
      <details><summary>{t.privacyRecord}</summary><p>{selected.details.signer} · {t[selected.details.relationship]} · {selected.details.permissionDate} · {selected.details.noticeVersion}</p>
        <p>{t.source} · {t[selected.source]}</p>{selected.details.intakeSource && <p>{selected.details.intakeSource}</p>}
        {selected.details.recorder && <p>{t.recorder} · {selected.details.recorder}</p>}
      </details>
      {enabled && !selected.withdrawn_at && <details open><summary>{t.edit}</summary>
        <VisitorForm key={selected.id+"-"+selected.revision} locale={locale} visit={id} id={selected.id} mode="edit" today={panamaDate()} initial={selected} />
      </details>}
      {(!enabled || selected.withdrawn_at) && <dl>
        <dt>{t.contact}</dt><dd>{selected.contact}</dd><dt>{t.emergencyName}</dt><dd>{selected.emergency_name} · {selected.emergency_phone}</dd>
        {(["food","diet","access"] as const).map(field => {
          const answer = selected.details[(field+"Answer") as "foodAnswer"|"dietAnswer"|"accessAnswer"];
          return <div key={field}><dt>{t[field]}</dt><dd>{answer === "none" ? t.none : answer === "unknown" ? t.unknown : selected.details[field] || "—"}</dd></div>;
        })}
        {selected.details.rooming && <div><dt>{t.rooming}</dt><dd>{selected.details.rooming}</dd></div>}
      </dl>}
      {enabled && <details><summary>{selected.withdrawn_at ? t.restore : t.withdraw}</summary>
        <VisitorStatusForm key={selected.id+"-"+selected.revision} locale={locale} visit={id} id={selected.id} revision={selected.revision} withdrawn={Boolean(selected.withdrawn_at)} />
      </details>}
      <details><summary>{t.history}</summary>{history.length ? <ul>{history.map(item => <li key={item.id}>
        {item.date} · {t[(item.operation+"Operation") as "editOperation"|"withdrawOperation"|"restoreOperation"]} · {item.recorded_by} · {item.reason}
      </li>)}</ul> : <p>{t.noHistory}</p>}</details>
    </section>}
    <section className="card"><VisitorRosterFilters locale={locale} visit={id} search={search} role={role} status={status} /></section>
    <section className="card roster-scroll">{visitors.length ? <table className="roster-table">
      <thead><tr><th scope="col">{t.last}</th><th scope="col">{t.first}</th><th scope="col">{t.role}</th><th scope="col">{t.age}</th><th scope="col">{t.housing}</th><th scope="col">{t.arrival}</th></tr></thead>
      <tbody>{visitors.map(visitor => {
        const age = ageOn(visitor.date_of_birth,visit.start);
        const recordLink = link({page:String(page),visitor:visitor.id});
        return <tr key={visitor.id}><th scope="row"><Link href={recordLink}>{visitor.last_name}</Link></th><td><Link href={recordLink}>{visitor.first_name}</Link></td><td>{t[visitor.visitor_role]}</td>
          <td>{age}{age !== null && age < 18 && " · "+t.minor}</td><td>{visitor.withdrawn_at ? "—" : <Link href={housingUrl+"#visitor-"+visitor.id}>{housingLabel(visitor.id)}</Link>}</td>
          <td>{visitAttendanceCopy[locale][attendanceState(visitor)]}</td>
        </tr>;
      })}</tbody>
    </table> : <p>{t.empty}</p>}
      <p>{t.page} {page} / {pages} · {matching}</p><div className="actions">
        {page > 1 && <Link href={link({page:String(page-1)})}>{t.previous}</Link>}{page < pages && <Link href={link({page:String(page+1)})}>{t.next}</Link>}
      </div>
    </section>
  </ReviewFrame>;
}
