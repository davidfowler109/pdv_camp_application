import { randomUUID } from "node:crypto";
import Link from "next/link";
import { eventHousingCopy } from "../../../lib/event-housing-copy";
import { notFound, redirect } from "next/navigation";
import { getDatabase } from "../../../lib/database";
import { isLocale } from "../../../lib/copy";
import { eventRegistrationCopy } from "../../../lib/event-registration-copy";
import { facilitiesCopy } from "../../../lib/facilities-copy";
import { currentRole } from "../../../lib/session";
import { ReviewFrame } from "../intake/review-frame";
import { EventEditor } from "./event-editor";
import { DateRangeFields } from "../date-range-fields";
import { saveEvent } from "./actions";

type Event = {
  id:string; name:string; start:string; end:string; turnover_minutes:number; capacity:number; fee_cents:number|null;
  day_attendance:boolean; overnight_attendance:boolean; supervisor_required:boolean; cancelled:boolean; rooms:number[];
};
type Room = {id:number;name:string;building:string;active:boolean;needs_cleaning:boolean;room_kind:"camper"|"hotel"};

export default async function Events({ params, searchParams }: {
  params:Promise<{locale:string}>;searchParams:Promise<{event?:string;status?:string;conflict?:string}>;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  if (await currentRole() !== "leadership") redirect("/"+locale);
  const query = await searchParams, t = facilitiesCopy[locale];
  const db = await getDatabase();
  const [events,rooms] = await Promise.all([
    db.query<Event>(
      `SELECT e.id,e.name,to_char(e.starts_at,'YYYY-MM-DD"T"HH24:MI') AS start,to_char(e.ends_at,'YYYY-MM-DD"T"HH24:MI') AS end,
        e.turnover_minutes,e.capacity,e.fee_cents,e.day_attendance,e.overnight_attendance,e.supervisor_required,e.cancelled_at IS NOT NULL AS cancelled,
        ARRAY(SELECT dorm_id FROM event_room_reservation WHERE event_id=e.id ORDER BY dorm_id) AS rooms
       FROM special_event e ORDER BY e.starts_at,e.name,e.id`,
    ).then(result => result.rows),
    db.query<Room>(`SELECT d.id,d.name,b.name AS building,d.active,d.needs_cleaning,d.room_kind FROM dorm d JOIN building b ON b.id=d.building_id`)
      .then(result => result.rows),
  ]);
  const selected = events.find(event => event.id === query.event);
  const creating = query.event === "new";
  const editing = creating || Boolean(selected && !selected.cancelled);
  const base = "/"+locale+"/events";
  const order = new Intl.Collator(locale,{numeric:true});
  rooms.sort((a,b) => order.compare(a.building,b.building) || order.compare(a.name,b.name) || a.id-b.id);
  const display = (value:string) => value.replace("T"," ");
  const messages = {saved:t.saved,invalid:t.invalid,unavailable:t.unavailable,conflict:t.conflict};
  const status = query.status as keyof typeof messages | undefined;

  return <ReviewFrame locale={locale} section="events" title={t.events} event={selected?.id ?? (creating ? "new" : undefined)}>
    <p><Link className="action-link" href={base+"?event=new"}>{t.add}</Link> <Link href={"/"+locale+"/facilities"+(selected ? "?month="+selected.start.slice(0,7) : "")}>{t.calendar}</Link></p>
    <p className="muted">{t.inPanama}</p>
    {status && Object.hasOwn(messages,status) && <p className="notice" role={status === "saved" ? "status" : "alert"}>
      {messages[status]}{status === "conflict" && typeof query.conflict === "string" ? " · "+query.conflict.slice(0,250) : ""}
    </p>}
    {events.length ? <section className="card roster-scroll"><table className="roster-table">
      <thead><tr><th scope="col">{t.name}</th><th scope="col">{t.start}</th><th scope="col">{t.end}</th><th scope="col">{t.rooms}</th></tr></thead>
      <tbody>{events.map(event => <tr key={event.id}>
        <th scope="row"><Link href={base+"?event="+event.id}>{event.name}</Link></th><td>{display(event.start)}</td><td>{display(event.end)}</td>
        <td>{event.cancelled ? t.cancelled : event.rooms.length ? event.rooms.length+" · "+t.reserved : t.noRooms}</td>
      </tr>)}</tbody>
    </table></section> : <p>{t.empty}</p>}
    {selected && <p><Link className="action-link" href={base+"/attendees?event="+selected.id}>{eventRegistrationCopy[locale].roster}</Link>{" "}<Link className="action-link secondary" href={base+"/housing?event="+selected.id}>{eventHousingCopy[locale].title}</Link>{" "}
      {!selected.cancelled && process.env.PDV_LOCAL_DEMO === "1" && <Link href={base+"/register/"+selected.id}>{eventRegistrationCopy[locale].publicLink}</Link>}
    </p>}
    {selected?.cancelled && <section className="card"><h2>{selected.name}</h2><p>{t.cancelled}</p></section>}
    {editing && <section className="card"><h2>{creating ? t.add : t.edit}</h2>
      <EventEditor locale={locale} key={JSON.stringify(selected ?? "new")}>
        <input name="locale" type="hidden" value={locale} /><input name="operation" type="hidden" value={creating ? "create" : "edit"} />
        <input name="id" type="hidden" value={selected?.id ?? randomUUID()} />
        <div className="grid">
          <label>{t.name}<input name="name" maxLength={120} required defaultValue={selected?.name} /></label>
          <DateRangeFields startLabel={t.start} endLabel={t.end} type="datetime-local"
            start={selected?.start} end={selected?.end} />
          <label>{t.turnover}<input name="turnover" type="number" min={0} max={10080} required defaultValue={selected?.turnover_minutes ?? 0} /></label>
          <label>{t.capacity}<input name="capacity" type="number" min={1} max={1000} required defaultValue={selected?.capacity} /></label>
          <label>{t.fee}<input name="fee" inputMode="decimal" placeholder="80.00" defaultValue={selected?.fee_cents == null ? "" : (selected.fee_cents/100).toFixed(2)} /></label>
        </div>
        <label className="check"><input name="day" type="checkbox" defaultChecked={selected?.day_attendance ?? true} />{t.day}</label>
        <label className="check"><input name="overnight" type="checkbox" defaultChecked={selected?.overnight_attendance ?? true} />{t.overnight}</label>
        <label className="check"><input name="supervisor" type="checkbox" defaultChecked={selected?.supervisor_required ?? false} />{t.supervisor}</label>
        <fieldset><legend>{t.rooms}</legend><p className="muted">{t.choose}</p>
          <div className="dorms">{[...new Set(rooms.map(room => room.building))].map(building => <fieldset key={building}><legend>{building}</legend>
            {rooms.filter(room => room.building === building && (room.active || selected?.rooms.includes(room.id))).map(room => <label className="check" key={room.id}>
              <input name="room" type="checkbox" value={room.id} defaultChecked={selected?.rooms.includes(room.id)} />
              {room.name}{room.needs_cleaning ? " · "+t.cleaning : ""}
            </label>)}
          </fieldset>)}</div>
        </fieldset>
      </EventEditor>
      {selected && <details><summary>{t.cancel}</summary><form action={saveEvent}>
        <input name="locale" type="hidden" value={locale} /><input name="operation" type="hidden" value="cancel" />
        <input name="id" type="hidden" value={selected.id} /><button>{t.cancel}</button>
      </form></details>}
    </section>}
  </ReviewFrame>;
}
