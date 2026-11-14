import Link from "next/link";
import { notFound,redirect } from "next/navigation";
import { getDatabase } from "../../../../lib/database";
import { isLocale } from "../../../../lib/copy";
import { currentRole } from "../../../../lib/session";
import { eventUuid } from "../../../../lib/event-registration";
import { getEventHousing,eventHousingIssues } from "../../../../lib/event-housing";
import { eventHousingCopy } from "../../../../lib/event-housing-copy";
import { roomConflict } from "../../../../lib/facilities";
import { ReviewFrame } from "../../intake/review-frame";
import { EventHousingForm } from "./housing-form";

export default async function EventHousingPage({params,searchParams}:{params:Promise<{locale:string}>;searchParams:Promise<{event?:string;status?:string}>}){
  const {locale}=await params;if(!isLocale(locale))notFound();
  if(await currentRole()!=="leadership")redirect("/"+locale);
  const query=await searchParams;if(!query.event||!eventUuid.test(query.event))redirect("/"+locale+"/events");
  const db=await getDatabase(),plan=await getEventHousing(db,query.event);if(!plan)notFound();
  const {event,rooms,people,placements}=plan,t=eventHousingCopy[locale];
  const order=new Intl.Collator(locale,{numeric:true});rooms.sort((a,b)=>order.compare(a.building,b.building)||order.compare(a.name,b.name)||a.id-b.id);
  const issues=eventHousingIssues(plan),conflict=await roomConflict(db,rooms.map(r=>r.id),event.start,event.end,event.turnover_minutes,event.id,true);
  const published=Boolean(event.housing_published_at)&&!event.cancelled_at&&!issues.length&&!conflict;
  const assigned=people.filter(person=>placements.some(p=>p.attendee_id===person.id)).length;
  const roomLabel=(id:number)=>{const room=rooms.find(r=>r.id===id);return room ? room.building+" · "+room.name : t.roomUnavailable;};
  const fields=(operation:string)=><><input type="hidden" name="locale" value={locale}/><input type="hidden" name="event" value={event.id}/>
    <input type="hidden" name="revision" value={event.housing_revision}/><input type="hidden" name="operation" value={operation}/></>;
  const history=(await db.query<{id:number;operation:string;recorded_by:string;reason:string;date:string}>(`SELECT id,operation,recorded_by,reason,to_char(recorded_at AT TIME ZONE 'America/Panama','YYYY-MM-DD HH24:MI') AS date FROM event_housing_history WHERE event_id=$1 ORDER BY recorded_at DESC,id DESC LIMIT 50`,[event.id])).rows;
  return <ReviewFrame locale={locale} section="events/housing" title={t.title} event={event.id}>
    <p><Link href={"/"+locale+"/events?event="+event.id}>{t.setup}</Link> · <Link href={"/"+locale+"/events/attendees?event="+event.id}>{t.roster}</Link></p>
    <section className="card"><h2>{event.name}</h2><p>{t.help}</p><p>{t.preferences}</p>
      <p><strong>{published ? t.published : t.draft}</strong> · {t.assigned} {assigned} / {people.length} · {t.unassignedCount} {people.length-assigned}</p>
      <p>{event.supervisor_required ? t.supervisionOn : t.supervisionOff}</p><p className="muted">{t.publishedHelp}</p>
      {event.cancelled_at && <p className="notice">{t.closed}</p>}{query.status==="saved"&&<p role="status">{t.saved}</p>}
      {!rooms.length&&<p>{t.noRooms}</p>}{!people.length&&<p>{t.noPeople}</p>}
      {conflict&&<p className="notice">{t.conflict} · {conflict.room} · {conflict.booking}</p>}
      {issues.length>0&&<details open><summary>{t.issues} ({issues.length})</summary><ul>{issues.map((issue,index)=>{
        const person=people.find(p=>p.id===issue.person);
        return <li key={index}>{t[issue.status]} {person&&<a href={"#attendee-"+person.id}>{person.first_name} {person.last_name}</a>}{issue.room&&" · "+roomLabel(issue.room)}</li>;
      })}</ul></details>}
      {!event.cancelled_at&&<><details><summary>{t.generate}</summary><p>{t.generateHelp}</p><EventHousingForm locale={locale} label={t.generate}>{fields("generate")}</EventHousingForm></details>
        <details><summary>{t.publish}</summary><EventHousingForm locale={locale} label={t.publish}>{fields("publish")}</EventHousingForm></details></>}
    </section>
    <h2>{t.rooms}</h2><div className="dorms">{rooms.map(room=>{
      const occupants=placements.filter(p=>p.dorm_id===room.id&&people.some(person=>person.id===p.attendee_id));
      return <section className="card" key={room.id}><h3>{roomLabel(room.id)}</h3><p>{t.beds} {room.beds} · {t.occupants} {occupants.length} · {t.available} {Math.max(0,room.beds-occupants.length)}</p>
        {room.needs_cleaning&&<p className="notice">{t.cleaning}</p>}{(!room.active||!room.eligible)&&<p className="notice">{t.roomUnavailable}</p>}{room.notes&&<p>{room.notes}</p>}
        {occupants.length?<ul>{occupants.map(p=>{const person=people.find(person=>person.id===p.attendee_id)!;return <li key={p.attendee_id}>
          <a href={"#attendee-"+person.id}>{person.first_name} {person.last_name}</a>{p.supervisor&&" · "+t.supervisorLabel}{p.locked&&" · "+t.lockedLabel}</li>;})}</ul>:<p>{t.noAssignments}</p>}
        {!event.cancelled_at&&<details><summary>{t.configure}</summary><EventHousingForm locale={locale} label={t.configure}>{fields("configure")}
          <input type="hidden" name="room" value={room.id}/><label className="check"><input type="checkbox" name="eligible" defaultChecked={room.eligible}/>{t.eligible}</label>
          <label><span>{t.notes}</span><textarea name="notes" maxLength={2000} defaultValue={room.notes}/></label>
        </EventHousingForm></details>}
      </section>;
    })}</div>
    <h2>{t.move}</h2>{people.map(person=>{
      const placement=placements.find(p=>p.attendee_id===person.id);
      return <section className="card" key={person.id} id={"attendee-"+person.id}><h3><Link href={"/"+locale+"/events/attendees?event="+event.id+"&attendee="+person.id}>{person.first_name} {person.last_name}</Link></h3>
        <p>{person.place_status==="confirmed"?t.confirmed:t.pending} · {placement?roomLabel(placement.dorm_id):t.unassigned}{placement?.locked&&" · "+t.lockedLabel}</p>
        <p>{t.rooming} · {person.rooming==="church"?t.church+" · "+person.church:person.rooming==="group"?t.code+" · "+person.rooming_code:t.noPreference}</p>
        {person.accessibility&&<p>{t.accessibility} · {person.accessibility}</p>}
        {!event.cancelled_at&&<details><summary>{t.review}</summary><EventHousingForm locale={locale} label={t.save}>{fields("place")}<input type="hidden" name="attendee" value={person.id}/>
          <label><span>{t.room}</span><select name="room" defaultValue={placement?.dorm_id??""}><option value="">{t.clear}</option>{rooms.filter(r=>(r.active&&r.eligible)||r.id===placement?.dorm_id).map(r=><option value={r.id} key={r.id}>{roomLabel(r.id)} · {t.beds} {r.beds}</option>)}</select></label>
          {event.supervisor_required&&<label className="check"><input name="supervisor" type="checkbox" defaultChecked={placement?.supervisor??false}/>{t.supervisor}</label>}
          <label className="check"><input name="locked" type="checkbox" defaultChecked={placement?.locked??true}/>{t.locked}</label>
          {(person.accessibility||person.rooming!=="none")&&<label className="check"><input name="requestsReviewed" type="checkbox" defaultChecked={placement?.requests_reviewed??false}/>{t.requestsReviewed}</label>}
        </EventHousingForm></details>}
      </section>;
    })}
    {history.length>0&&<section className="card"><details><summary>{t.history}</summary><ul>{history.map(item=><li key={item.id}>{item.date} · {t[(item.operation+"Operation") as "placeOperation"]??item.operation} · {item.recorded_by} · {item.reason}</li>)}</ul></details></section>}
  </ReviewFrame>;
}
