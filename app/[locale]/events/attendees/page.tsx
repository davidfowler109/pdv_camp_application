import { randomUUID } from "node:crypto";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { isLocale } from "../../../../lib/copy";
import { getDatabase } from "../../../../lib/database";
import { eventUuid } from "../../../../lib/event-registration";
import { eventRegistrationCopy } from "../../../../lib/event-registration-copy";
import { currentRole } from "../../../../lib/session";
import { ReviewFrame } from "../../intake/review-frame";
import { AttendeeForm } from "../attendee-form";
import { reviewAttendee } from "../registration-actions";
import { getEventHousing,eventHousingIssues } from "../../../../lib/event-housing";
import { eventHousingCopy } from "../../../../lib/event-housing-copy";

type Attendee = {
  id:string; first_name:string; last_name:string; contact:string; attendance:"day"|"overnight";
  place_status:"pending"|"confirmed"|"released"; paid:number; rooming:"none"|"church"|"group"|null;
  church:string|null; rooming_code:string|null; food:string|null; accessibility:string|null;
  food_answer:"none"|"yes"|"unknown"|null;diet_answer:"none"|"yes"|"unknown"|null;diet:string|null;
  authorization_date:string; authorization_source:string|null; recorder:string|null; source:"online"|"desk"|"paper";
};
const pageSize = 25;

export default async function Attendees({params,searchParams}:{
  params:Promise<{locale:string}>;
  searchParams:Promise<{event?:string;attendee?:string;entry?:string;q?:string;page?:string;status?:string}>;
}) {
  const {locale} = await params;
  if (!isLocale(locale)) notFound();
  if (await currentRole() !== "leadership") redirect("/"+locale);
  const query = await searchParams;
  const base = "/"+locale+"/events";
  const eventId = query.event;
  if (!eventId || !eventUuid.test(eventId)) redirect(base);
  const db = await getDatabase();
  const event = (await db.query<{
    name:string;capacity:number;fee_cents:number|null;day_attendance:boolean;overnight_attendance:boolean;cancelled:boolean;
  }>(`SELECT name,capacity,fee_cents,day_attendance,overnight_attendance,cancelled_at IS NOT NULL AS cancelled
      FROM special_event WHERE id=$1`,[eventId])).rows[0];
  if (!event) redirect(base);

  const t = eventRegistrationCopy[locale];
  const entry = query.entry;
  const roster = base+"/attendees";
  const search = typeof query.q === "string" ? query.q.trim().slice(0,100) : "";
  const makeLink = (extra:Record<string,string>={}) => roster+"?"+new URLSearchParams({event:eventId,...(search ? {q:search} : {}),...extra});
  const currency = new Intl.NumberFormat(locale,{style:"currency",currency:"USD"});
  const money = (cents:number) => currency.format(cents/100);
  const fee = event.fee_cents ?? 0;
  const balance = (paid:number) => money(Math.max(0,fee-paid));
  const formEnabled = !event.cancelled && process.env.PDV_LOCAL_DEMO === "1";
  const publicUrl = base+"/register/"+eventId;

  if (formEnabled && (entry === "desk" || entry === "paper")) {
    return <ReviewFrame locale={locale} section="events/attendees" title={t.add} event={eventId}>
      <p><Link href={makeLink()}>{t.back}</Link></p><h2>{event.name}</h2><p>{t[entry]}</p>
      <AttendeeForm key={entry} locale={locale} event={eventId} id={randomUUID()} source={entry}
        day={event.day_attendance} overnight={event.overnight_attendance} />
    </ReviewFrame>;
  }

  const filter = "strpos(lower(a.first_name || ' ' || a.last_name),lower($2))>0";
  const fields = `a.*,a.authorization_date::text AS authorization_date,
    COALESCE((SELECT sum(amount_cents) FROM event_attendee_payment WHERE attendee_id=a.id),0)::float8 AS paid`;
  const counts = (await db.query<{matching:number;confirmed:number;overnight:number}>(
    `SELECT count(*) FILTER (WHERE ${filter})::integer AS matching,
       count(*) FILTER (WHERE place_status='confirmed')::integer AS confirmed,
       count(*) FILTER (WHERE place_status='confirmed' AND attendance='overnight')::integer AS overnight
     FROM event_attendee a WHERE event_id=$1`,[eventId,search],
  )).rows[0];
  const pageCount = Math.max(1,Math.ceil(counts.matching/pageSize));
  const page = typeof query.page === "string" && /^\d{1,6}$/.test(query.page) ? Math.min(pageCount,Math.max(1,Number(query.page))) : 1;
  const [result,detail] = await Promise.all([
    db.query<Attendee>(`SELECT ${fields} FROM event_attendee a WHERE a.event_id=$1 AND ${filter}
      ORDER BY lower(a.last_name),lower(a.first_name),a.id LIMIT $3 OFFSET $4`,[eventId,search,pageSize,(page-1)*pageSize]),
    query.attendee && eventUuid.test(query.attendee)
      ? db.query<Attendee>(`SELECT ${fields} FROM event_attendee a WHERE a.event_id=$1 AND a.id=$2`,[eventId,query.attendee])
      : null,
  ]);
  const selected = detail?.rows[0];
  const housing=await getEventHousing(db,eventId),h=eventHousingCopy[locale];
  const housingLink="/"+locale+"/events/housing?event="+eventId;
  const housingPublished=Boolean(housing?.event.housing_published_at)&&!event.cancelled&&housing!==null&&!eventHousingIssues(housing).length;
  const roomLabel=(a:Attendee)=>{
    const placement=housing?.placements.find(p=>p.attendee_id===a.id),room=housing?.rooms.find(r=>r.id===placement?.dorm_id);
    return room ? room.building+" · "+room.name+" · "+(housingPublished?h.published:h.draft) : a.attendance==="overnight"&&a.place_status!=="released" ? h.unassigned : "—";
  };
  const messages = {saved:t.saved,invalid:t.invalid,closed:t.closed,full:t.full,unavailable:t.unavailable};
  const status = query.status as keyof typeof messages | undefined;
  const preference = (a:Attendee) => a.rooming === "church" ? t.sameChurch+" · "+a.church
    : a.rooming === "group" ? t.group+" · "+a.rooming_code : a.rooming === "none" ? t.noPreference : "—";
  const actionFields = (operation:string) => <>
    <input type="hidden" name="locale" value={locale} /><input type="hidden" name="event" value={eventId} />
    <input type="hidden" name="attendee" value={selected?.id} /><input type="hidden" name="operation" value={operation} />
    <input type="hidden" name="q" value={search} /><input type="hidden" name="page" value={page} />
  </>;

  return <ReviewFrame locale={locale} section="events/attendees" title={t.roster} event={eventId}>
    <p><Link href={base+"?event="+eventId}>{event.name}</Link> · <Link href={housingLink}>{h.title}</Link></p>
    {event.cancelled && <p className="notice">{t.cancelled}</p>}
    {formEnabled && <p>
      <Link className="action-link" href={makeLink({entry:"desk"})}>{t.desk}</Link>{" "}
      <Link href={makeLink({entry:"paper"})}>{t.paper}</Link>{" · "}
      <Link href={publicUrl}>{t.publicLink}</Link>
    </p>}
    <p>{t.places} <strong>{counts.confirmed} / {event.capacity}</strong> · {t.beds} <strong>{counts.overnight}</strong> · {t.fee} <strong>{fee ? money(fee) : t.noFee}</strong></p>
    {status && Object.hasOwn(messages,status) && <p className="notice" role={status === "saved" ? "status" : "alert"}>{messages[status]}</p>}
    {selected && <section className="card">
      <h2>{selected.first_name} {selected.last_name}</h2>
      <dl>
        <dt>{t.contact}</dt><dd>{selected.contact}</dd>
        <dt>{t.attendance}</dt><dd>{t[selected.attendance]}</dd>
        <dt>{t.place}</dt><dd>{t[selected.place_status]}</dd>
        <dt>{h.title}</dt><dd><Link href={housingLink+"#attendee-"+selected.id}>{roomLabel(selected)}</Link></dd>
        {selected.rooming && <><dt>{t.preference}</dt><dd>{preference(selected)}</dd></>}
        {selected.food_answer ? <><dt>{t.food}</dt><dd>{selected.food_answer==="yes" ? selected.food : t[selected.food_answer]}</dd></> :
          selected.food && <><dt>{t.legacyFood}</dt><dd>{selected.food}</dd></>}
        {selected.diet_answer && <><dt>{t.diet}</dt><dd>{selected.diet_answer==="yes" ? selected.diet : t[selected.diet_answer]}</dd></>}
        {selected.accessibility && <><dt>{t.accessibility}</dt><dd>{selected.accessibility}</dd></>}
        <dt>{t.authorization}</dt><dd>{selected.authorization_date} · {selected.source === "online" ? t.publicLink : t[selected.source]}</dd>
        {selected.authorization_source && <><dt>{t.source}</dt><dd>{selected.authorization_source}</dd></>}
        {selected.recorder && <><dt>{t.recorder}</dt><dd>{selected.recorder}</dd></>}
        <dt>{t.paid}</dt><dd>{money(selected.paid)}</dd>
        <dt>{t.balance}</dt><dd>{balance(selected.paid)}</dd>
      </dl>
      {!event.cancelled && <>
        {selected.place_status !== "confirmed" && (selected.attendance === "day" ? event.day_attendance : event.overnight_attendance) &&
          <form action={reviewAttendee}>{actionFields("confirm")}<button>{t.confirm}</button></form>}
        {selected.place_status !== "released" && <details><summary>{t.release}</summary><form action={reviewAttendee}>{actionFields("release")}
          <div className="grid"><label><span>{h.actor} *</span><input name="actor" maxLength={160} required /></label>
            <label><span>{h.reason} *</span><input name="reason" maxLength={1000} required /></label></div>
          <button>{t.release}</button></form></details>}
        <details><summary>{t.payment}</summary>
          <form action={reviewAttendee}>{actionFields("payment")}
            <div className="grid">
              <label>{t.amount}<input name="amount" inputMode="decimal" required /></label>
              <label>{t.reference}<input name="reference" maxLength={150} required /></label>
              <label>{t.actor}<input name="actor" maxLength={100} required /></label>
            </div><button>{t.payment}</button>
          </form>
        </details>
      </>}
    </section>}
    <form action={roster}>
      <input type="hidden" name="event" value={eventId} />
      <label>{t.search}<input type="search" name="q" maxLength={100} defaultValue={search} /></label>
      <button>{t.apply}</button>
    </form>
    {result.rows.length ? <section className="card roster-scroll">
      <table className="roster-table">
        <thead><tr><th scope="col">{t.attendee}</th><th scope="col">{t.attendance}</th><th scope="col">{t.place}</th>
          <th scope="col">{t.preference}</th><th scope="col">{h.title}</th><th scope="col">{t.balance}</th></tr></thead>
        <tbody>{result.rows.map(a=><tr key={a.id}>
          <th scope="row"><Link href={makeLink({attendee:a.id,page:String(page)})}>{a.last_name}, {a.first_name}</Link></th>
          <td>{t[a.attendance]}</td><td>{t[a.place_status]}</td><td>{preference(a)}</td><td>{a.attendance==="overnight"&&a.place_status!=="released"?<Link href={housingLink+"#attendee-"+a.id}>{roomLabel(a)}</Link>:"—"}</td><td>{balance(a.paid)}</td>
        </tr>)}</tbody>
      </table>
      {pageCount > 1 && <p>
        {page > 1 && <Link href={makeLink({page:String(page-1)})}>{t.previous}</Link>}{" "}
        {page} {t.of} {pageCount}{" "}
        {page < pageCount && <Link href={makeLink({page:String(page+1)})}>{t.next}</Link>}
      </p>}
    </section> : <p>{t.empty}</p>}
  </ReviewFrame>;
}
