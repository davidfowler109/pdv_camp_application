import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getDatabase } from "../../../../lib/database";
import { isLocale, type Locale } from "../../../../lib/copy";
import { currentRole } from "../../../../lib/session";
import { ageOn } from "../../../../lib/registration";
import { visitIdPattern } from "../../../../lib/church-visits";
import { canUseVisitRoom, getVisitHousing, visitHousingIssues } from "../../../../lib/visit-housing";
import { visitHousingCopy } from "../../../../lib/visit-housing-copy";
import { ReviewFrame } from "../../intake/review-frame";
import { HousingForm } from "./housing-form";
import { visitAttendanceCopy } from "../../../../lib/visit-attendance-copy";

function RecorderFields({locale}: {locale:Locale}) {
  const t = visitHousingCopy[locale];
  return <div className="grid">
    <label><span>{t.actor} *</span><input name="actor" maxLength={160} required /></label>
    <label><span>{t.reason} *</span><input name="reason" maxLength={1000} required /></label>
  </div>;
}

export default async function VisitHousing({params,searchParams}: {
  params:Promise<{locale:string}>;searchParams:Promise<{visit?:string;status?:string}>;
}) {
  const {locale} = await params;
  if (!isLocale(locale)) notFound();
  if (await currentRole() !== "leadership") redirect("/"+locale);
  const query = await searchParams;
  if (!query.visit || !visitIdPattern.test(query.visit)) redirect("/"+locale+"/church-visits");
  const db = await getDatabase();
  const snapshot = await getVisitHousing(db,query.visit);
  if (!snapshot) notFound();
  const {visit,people,rooms,placements} = snapshot;
  const t = visitHousingCopy[locale];
  const order = new Intl.Collator(locale,{numeric:true});
  rooms.sort((a,b) => order.compare(a.building,b.building) || order.compare(a.name,b.name) || a.id-b.id);
  const issues = visitHousingIssues(snapshot);
  const published = Boolean(visit.housing_published_at) && !issues.length;
  const roomLabel = (id:number) => { const room = rooms.find(room => room.id === id); return room ? room.building+" · "+room.name : t.roomUnavailable; };
  const history = (await db.query<{id:number;operation:string;recorded_by:string;reason:string;date:string}>(
    `SELECT id,operation,recorded_by,reason,to_char(changed_at AT TIME ZONE 'America/Panama','YYYY-MM-DD HH24:MI') AS date
     FROM church_housing_history WHERE visit_id=$1 ORDER BY changed_at DESC,id DESC LIMIT 50`,[visit.id],
  )).rows;
  const fields = (operation:string) => <>
    <input name="locale" type="hidden" value={locale} /><input name="visit" type="hidden" value={visit.id} />
    <input name="revision" type="hidden" value={visit.housing_revision} /><input name="operation" type="hidden" value={operation} />
  </>;
  return <ReviewFrame locale={locale} section="church-visits/housing" title={t.title} visit={visit.id}>
    <p><Link href={"/"+locale+"/church-visits?visit="+visit.id}>{t.setup}</Link>{" · "}
      <Link href={"/"+locale+"/church-visits/visitors?visit="+visit.id}>{t.roster}</Link>{" · "}
      <Link href={"/"+locale+"/church-visits/attendance?visit="+visit.id}>{visitAttendanceCopy[locale].title}</Link></p>
    <h2>{visit.name}</h2>
    {query.status === "saved" && <p className="notice" role="status">{t.saved}</p>}
    {visit.cancelled_at && <p className="notice">{t.closed}</p>}
    <section className="card"><h2>{published ? t.published : visit.housing_published_at ? t.needsReview : t.draft}</h2>
      <p>{t.assigned} {placements.length} / {people.length} · {t.unassigned} {people.filter(person => !placements.some(item => item.visitor_id === person.id)).length}</p>
      <p>{t.publishedHelp}</p><p>{t.preferences}</p>
      {issues.length > 0 && <details open><summary>{t.issues} · {issues.length}</summary><ul>{issues.map((issue,index) => {
        const person = people.find(person => person.id === issue.visitor);
        return <li key={index}>{issue.room && <>{roomLabel(issue.room)} · </>}{person && <>{person.first_name} {person.last_name} · </>}
          {issue.status === "unassigned" ? t.unassignedIssue : t[issue.status]}</li>;
      })}</ul></details>}
      {!visit.cancelled_at && rooms.length > 0 && people.length > 0 && <div className="grid">
        <details><summary>{t.generate}</summary><p>{t.generateHelp}</p><HousingForm locale={locale} label={t.generate}>{fields("generate")}<RecorderFields locale={locale} /></HousingForm></details>
        <details><summary>{t.publish}</summary><HousingForm locale={locale} label={t.publish}>{fields("publish")}<RecorderFields locale={locale} /></HousingForm></details>
      </div>}
    </section>
    {!rooms.length && <p>{t.noRooms}</p>}{!people.length && <p>{t.noVisitors}</p>}
    <h2>{t.rooms}</h2><p>{t.help}</p>
    <div className="dorms">{rooms.map(room => {
      const occupants = placements.filter(item => item.dorm_id === room.id);
      return <section className="card" key={room.id}><h3>{roomLabel(room.id)}</h3>
        <p>{t.occupants} {occupants.length} / {room.beds} · {t.available} {Math.max(0,room.beds-occupants.length)}</p>
        {room.needs_cleaning && <p className="notice">{t.cleaning}</p>}{!room.active && <p className="notice">{t.roomUnavailable}</p>}
        {occupants.length ? <ul>{occupants.map(placement => {
          const person = people.find(person => person.id === placement.visitor_id);
          return person && <li key={person.id}><a href={"#visitor-"+person.id}>{person.first_name} {person.last_name}</a>{placement.supervisor && " · "+t.supervisorLabel}{placement.locked && " · "+t.lockedLabel}</li>;
        })}</ul> : <p>{t.noAssignments}</p>}
        {!visit.cancelled_at && <details open={!room.gender_group}><summary>{t.configure}</summary>
          <HousingForm locale={locale} label={t.configure}>{fields("configure")}<input name="room" type="hidden" value={room.id} />
            <label><span>{t.group} *</span><select name="gender" required defaultValue={room.gender_group ?? ""}>
              <option value="">—</option><option value="female">{t.female}</option><option value="male">{t.male}</option><option value="mixed">{t.mixed}</option>
            </select></label>
            <label><span>{t.minimum} *</span><input name="minimumAdults" type="number" min={0} max={room.beds} required defaultValue={room.minimum_adults ?? ""} /></label>
            <label className="check"><input name="allowMinors" type="checkbox" defaultChecked={room.allow_minors ?? room.room_kind === "camper"} />{t.allowMinors}</label>
            <label><span>{t.notes}</span><textarea name="notes" maxLength={2000} defaultValue={room.supervision_notes ?? ""} /></label>
            <RecorderFields locale={locale} />
          </HousingForm>
        </details>}
      </section>;
    })}</div>
    <h2>{t.move}</h2>
    {people.map(person => {
      const placement = placements.find(item => item.visitor_id === person.id);
      const age = ageOn(person.date_of_birth,visit.start_day) ?? -1;
      return <section className="card" key={person.id} id={"visitor-"+person.id}>
        <h3>{person.first_name} {person.last_name}</h3><p>{t[person.visitor_role]} · {t.age} {age} · {person.gender_group === "female" ? t.female : t.male}</p>
        <p>{visitAttendanceCopy[locale][person.departed_at ? "departed" : person.arrived_at ? "present" : "expected"]}</p>
        <p>{placement ? roomLabel(placement.dorm_id) : t.unassignedIssue}{placement?.supervisor && " · "+t.supervisorLabel}{placement?.locked && " · "+t.lockedLabel}</p>
        {person.rooming && <p>{t.rooming} · {person.rooming}</p>}{person.accommodation && <p>{t.accommodation} · {person.accommodation}</p>}
        {!visit.cancelled_at && !person.departed_at && <details><summary>{t.review}</summary><HousingForm locale={locale} label={t.save}>
          {fields("place")}<input name="visitor" type="hidden" value={person.id} />
          <label><span>{t.room}</span><select name="room" defaultValue={placement?.dorm_id ?? ""}>
            <option value="">{t.clear}</option>{rooms.filter(room => canUseVisitRoom(person,room,visit.start_day) || room.id === placement?.dorm_id).map(room =>
              <option key={room.id} value={room.id}>{roomLabel(room.id)} · {t.beds} {room.beds}</option>)}
          </select></label>
          {age >= 18 && <label className="check"><input name="supervisor" type="checkbox" defaultChecked={placement?.supervisor ?? false} />{t.supervisor}</label>}
          <label className="check"><input name="locked" type="checkbox" defaultChecked={placement?.locked ?? true} />{t.locked}</label>
          <RecorderFields locale={locale} />
        </HousingForm></details>}
      </section>;
    })}
    {history.length > 0 && <section className="card"><details><summary>{t.history}</summary><ul>{history.map(item => <li key={item.id}>
      {item.date} · {t[(item.operation+"Operation") as "configureOperation"|"generateOperation"|"placeOperation"|"publishOperation"|"withdrawOperation"] ?? item.operation} · {item.recorded_by} · {item.reason}
    </li>)}</ul></details></section>}
  </ReviewFrame>;
}
