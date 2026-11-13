import { randomUUID } from "node:crypto";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getDatabase } from "../../../lib/database";
import { currentRole } from "../../../lib/session";
import { isLocale } from "../../../lib/copy";
import { churchVisitsCopy } from "../../../lib/church-visits-copy";
import { facilitiesCopy } from "../../../lib/facilities-copy";
import { ReviewFrame } from "../intake/review-frame";
import { DateRangeFields } from "../date-range-fields";
import { VisitEditor } from "./visit-editor";
import { churchVisitorCopy } from "../../../lib/church-visitor-copy";
import { visitHousingCopy } from "../../../lib/visit-housing-copy";
import { visitAttendanceCopy } from "../../../lib/visit-attendance-copy";
import { visitItineraryCopy } from "../../../lib/visit-itinerary-copy";

type Visit = {
  id:string; name:string; church_name:string; purpose:string; leader_name:string; leader_email:string; leader_phone:string;
  start:string; end:string; turnover_minutes:number; expected_students:number; expected_adults:number; expected_leaders:number;
  cancelled:boolean; rooms:number[];
};
type Room = {id:number; name:string; building:string; active:boolean; needs_cleaning:boolean; beds:number};

export default async function ChurchVisits({params, searchParams}: {
  params:Promise<{locale:string}>; searchParams:Promise<{visit?:string; status?:string}>;
}) {
  const {locale} = await params;
  if (!isLocale(locale)) notFound();
  if (await currentRole() !== "leadership") redirect("/"+locale);
  const query = await searchParams;
  const t = churchVisitsCopy[locale], f = facilitiesCopy[locale];
  const db = await getDatabase();
  const [visits, rooms] = await Promise.all([
    db.query<Visit>(`SELECT v.*,to_char(v.starts_at,'YYYY-MM-DD"T"HH24:MI') AS start,
      to_char(v.ends_at,'YYYY-MM-DD"T"HH24:MI') AS end,v.cancelled_at IS NOT NULL AS cancelled,
      ARRAY(SELECT dorm_id FROM visit_room_reservation WHERE visit_id=v.id ORDER BY dorm_id) AS rooms
      FROM church_visit v ORDER BY v.starts_at,v.name,v.id`).then(result => result.rows),
    db.query<Room>(`SELECT d.id,d.name,b.name AS building,d.active,d.needs_cleaning,
      COALESCE(d.default_usable_beds,d.physical_beds) AS beds FROM dorm d JOIN building b ON b.id=d.building_id`).then(result => result.rows),
  ]);
  const selected = visits.find(visit => visit.id === query.visit);
  if (query.visit && query.visit !== "new" && !selected) notFound();
  const creating = query.visit === "new";
  const base = "/"+locale+"/church-visits";
  const order = new Intl.Collator(locale,{numeric:true});
  rooms.sort((a,b) => order.compare(a.building,b.building) || order.compare(a.name,b.name) || a.id-b.id);
  const display = (value:string) => value.replace("T"," ");
  const total = (visit:Visit) => visit.expected_students+visit.expected_adults+visit.expected_leaders;
  return <ReviewFrame locale={locale} section="church-visits" title={t.title} visit={selected?.id ?? (creating ? "new" : undefined)}>
    <p><Link className="action-link" href={base+"?visit=new"}>{t.add}</Link>{" "}
      <Link href={"/"+locale+"/facilities"+(selected ? "?month="+selected.start.slice(0,7) : "")}>{f.calendar}</Link></p>
    <p className="muted">{f.inPanama}</p>
    {query.status === "saved" && <p className="notice" role="status">{t.saved}</p>}
    {visits.length ? <section className="card roster-scroll"><table className="roster-table">
      <thead><tr><th scope="col">{t.name}</th><th scope="col">{t.church}</th><th scope="col">{f.start}</th><th scope="col">{f.end}</th><th scope="col">{t.total}</th><th scope="col">{t.rooms}</th></tr></thead>
      <tbody>{visits.map(visit => <tr key={visit.id}>
        <th scope="row"><Link href={base+"?visit="+visit.id}>{visit.name}</Link>{visit.cancelled && <> · {t.cancelled}</>}</th>
        <td>{visit.church_name}</td><td>{display(visit.start)}</td><td>{display(visit.end)}</td><td>{total(visit)}</td>
        <td>{visit.cancelled ? "—" : visit.rooms.length}</td>
      </tr>)}</tbody>
    </table></section> : <p>{t.empty}</p>}
    {selected && <p><Link className="action-link" href={base+"/visitors?visit="+selected.id}>{churchVisitorCopy[locale].roster}</Link>{" "}
      <Link href={base+"/housing?visit="+selected.id}>{visitHousingCopy[locale].title}</Link>{" · "}
      <Link href={base+"/itinerary?visit="+selected.id}>{visitItineraryCopy[locale].title}</Link>{" · "}
      <Link href={base+"/attendance?visit="+selected.id}>{visitAttendanceCopy[locale].title}</Link>{" · "}
      {!selected.cancelled && process.env.PDV_LOCAL_DEMO === "1" && <Link href={base+"/register/"+selected.id}>{churchVisitorCopy[locale].publicLink}</Link>}
    </p>}
    {selected?.cancelled && <section className="card"><h2>{selected.name}</h2>
      <p>{t.cancelled} · {selected.church_name} · {t.total} {total(selected)}</p><p>{selected.purpose}</p>
      <p>{display(selected.start)} – {display(selected.end)}</p>
    </section>}
    {(creating || selected && !selected.cancelled) && <section className="card"><h2>{creating ? t.add : t.edit}</h2>
      <p className="muted">{t.required}</p>
      <VisitEditor locale={locale} key={JSON.stringify(selected ?? "new")}>
        <input name="locale" type="hidden" value={locale} /><input name="id" type="hidden" value={selected?.id ?? randomUUID()} />
        <input name="operation" type="hidden" value={creating ? "create" : "edit"} />
        <div className="grid">
          <label>{t.name} *<input name="name" maxLength={120} required defaultValue={selected?.name} /></label>
          <label>{t.church} *<input name="church" maxLength={160} required defaultValue={selected?.church_name} /></label>
          <DateRangeFields startLabel={f.start+" *"} endLabel={f.end+" *"} type="datetime-local" start={selected?.start} end={selected?.end} />
          <label>{f.turnover} *<input name="turnover" type="number" min={0} max={10080} required defaultValue={selected?.turnover_minutes ?? 0} /></label>
          <label>{t.leader} *<input name="leader" maxLength={160} required defaultValue={selected?.leader_name} /></label>
          <label>{t.email} *<input name="email" type="email" maxLength={254} required defaultValue={selected?.leader_email} /></label>
          <label>{t.phone} *<input name="phone" type="tel" maxLength={80} required defaultValue={selected?.leader_phone} /></label>
          <label>{t.students} *<input name="students" type="number" min={0} max={1000} required defaultValue={selected?.expected_students} /></label>
          <label>{t.adults} *<input name="adults" type="number" min={0} max={1000} required defaultValue={selected?.expected_adults} /></label>
          <label>{t.leaders} *<input name="leaders" type="number" min={0} max={1000} required defaultValue={selected?.expected_leaders} /></label>
        </div>
        <p className="muted">{t.countsHelp}</p>
        <label>{t.purpose} *<textarea name="purpose" maxLength={2000} required defaultValue={selected?.purpose} /></label>
        <fieldset><legend>{f.rooms}</legend><p className="muted">{t.choose}</p>
          <div className="dorms">{[...new Set(rooms.map(room => room.building))].map(building => <fieldset key={building}><legend>{building}</legend>
            {rooms.filter(room => room.building === building && (room.active || selected?.rooms.includes(room.id))).map(room => <label className="check" key={room.id}>
              <input name="room" type="checkbox" value={room.id} defaultChecked={selected?.rooms.includes(room.id)} />
              {room.name} · {t.beds} {room.beds}{room.needs_cleaning && " · "+f.cleaning}{!room.active && " · "+t.roomUnavailable}
            </label>)}
          </fieldset>)}</div>
        </fieldset>
      </VisitEditor>
      {selected && <details><summary>{t.cancel}</summary><p>{t.cancelHelp}</p>
        <VisitEditor locale={locale} cancel>
          <input name="locale" type="hidden" value={locale} /><input name="id" type="hidden" value={selected.id} />
          <input name="operation" type="hidden" value="cancel" />
        </VisitEditor>
      </details>}
    </section>}
  </ReviewFrame>;
}
