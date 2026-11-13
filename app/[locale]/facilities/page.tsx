import Link from "next/link";
import { getDatabase } from "../../../lib/database";
import { facilitiesCopy } from "../../../lib/facilities-copy";
import { churchVisitsCopy } from "../../../lib/church-visits-copy";
import { panamaDate } from "../../../lib/registration";
import { requireReview, ReviewFrame } from "../intake/review-frame";

type Booking = {
  id:string; kind:"camp"|"event"|"visit"; name:string; start:string; end:string; blocked_until:string; rooms:string[];
};
const days = 86400000;
const isoDay = (ms:number) => new Date(ms).toISOString().slice(0,10);
const localTime = (value:string) => value.replace("T"," ");

export default async function Facilities({ params, searchParams }: {
  params:Promise<{locale:string}>;searchParams:Promise<{month?:string}>;
}) {
  const { locale, role } = await requireReview((await params).locale);
  const { month:requested } = await searchParams;
  const t = facilitiesCopy[locale], today = panamaDate();
  const month = requested && /^20\d\d-(0[1-9]|1[0-2])$/.test(requested) ? requested : today.slice(0,7);
  const [year,number] = month.split("-").map(Number);
  const first = Date.UTC(year,number-1,1), next = Date.UTC(year,number,1);
  const gridStart = first - new Date(first).getUTCDay()*days;
  const gridEnd = next + ((7-new Date(next).getUTCDay())%7)*days;
  const db = await getDatabase();
  const formatMonth = new Intl.DateTimeFormat(locale,{month:"long",year:"numeric",timeZone:"UTC"});
  const formatDay = new Intl.DateTimeFormat(locale,{weekday:"short",timeZone:"UTC"});
  const base = "/"+locale+"/facilities?month=";
  const previousMonth = isoDay(Date.UTC(year,number-2,1)).slice(0,7);
  const nextMonth = isoDay(next).slice(0,7);
  const { rows } = await db.query<Booking>(
    `SELECT * FROM (
       SELECT w.id::text AS id,'camp' AS kind,w.name,w.starts_on::text AS start,w.ends_on::text AS end,
         (w.ends_on+1)::text AS blocked_until,
         ARRAY(SELECT b.name || ' · ' || d.name FROM weekly_dorm wd JOIN dorm d ON d.id=wd.dorm_id
           JOIN building b ON b.id=d.building_id WHERE wd.week_id=w.id AND wd.in_service AND d.active ORDER BY b.name,d.id) AS rooms
       FROM camp_week w WHERE w.starts_on IS NOT NULL AND w.ends_on IS NOT NULL
       UNION ALL
       SELECT e.id::text,'event',e.name,to_char(e.starts_at,'YYYY-MM-DD"T"HH24:MI'),to_char(e.ends_at,'YYYY-MM-DD"T"HH24:MI'),
         to_char(e.ends_at+e.turnover_minutes*interval '1 minute','YYYY-MM-DD"T"HH24:MI'),
         ARRAY(SELECT b.name || ' · ' || d.name FROM event_room_reservation er JOIN dorm d ON d.id=er.dorm_id
           JOIN building b ON b.id=d.building_id WHERE er.event_id=e.id ORDER BY b.name,d.id)
       FROM special_event e WHERE e.cancelled_at IS NULL
       UNION ALL
       SELECT v.id::text,'visit',v.name,to_char(v.starts_at,'YYYY-MM-DD"T"HH24:MI'),to_char(v.ends_at,'YYYY-MM-DD"T"HH24:MI'),
         to_char(v.ends_at+v.turnover_minutes*interval '1 minute','YYYY-MM-DD"T"HH24:MI'),
         ARRAY(SELECT b.name || ' · ' || d.name FROM visit_room_reservation vr JOIN dorm d ON d.id=vr.dorm_id
           JOIN building b ON b.id=d.building_id WHERE vr.visit_id=v.id ORDER BY b.name,d.id)
       FROM church_visit v WHERE v.cancelled_at IS NULL
     ) bookings ORDER BY start,name,id`,
  );
  function intersects(booking:Booking,start:string,end:string) {
    return booking.start < end && booking.blocked_until > start;
  }
  const listed = rows.filter(item => intersects(item,isoDay(first),isoDay(next)));
  const upcoming = rows.find(item => item.start.slice(0,10)>today)?.start.slice(0,7);
  function bookingLabel(item:Booking) {
    const link = item.kind === "camp" ? "/"+locale+"?week="+item.id : role === "leadership"
      ? "/"+locale+(item.kind === "visit" ? "/church-visits?visit=" : "/events?event=")+item.id : null;
    return link ? <Link href={link}>{item.name}</Link> : item.name;
  }
  return <ReviewFrame locale={locale} section="facilities" title={t.calendar} month={month}>
    <p className="muted">{t.inPanama} {t.campDates}</p>
    <section className="card">
      <div className="actions facilities-controls">
        <Link href={base+previousMonth}>{t.monthBack}</Link><strong>{formatMonth.format(first)}</strong><Link href={base+nextMonth}>{t.monthNext}</Link>
        <Link href={base+today.slice(0,7)}>{t.today}</Link>
        {upcoming && upcoming !== month && <Link href={base+upcoming}>{t.upcoming}</Link>}
      </div>
      <div className="roster-scroll">
        <div className="facility-calendar">
          {Array.from({length:7},(_,index) => <strong key={"day-"+index}>{formatDay.format(gridStart+index*days)}</strong>)}
          {Array.from({length:(gridEnd-gridStart)/days},(_,index) => {
            const ms = gridStart+index*days, day = isoDay(ms), after = isoDay(ms+days);
            const bookings = rows.filter(item => intersects(item,day,after));
            return <div className={"facility-day"+(ms<first || ms>=next ? " outside" : "")} key={day} aria-label={day}>
              <time dateTime={day} aria-current={day===today ? "date" : undefined}>{new Date(ms).getUTCDate()}</time>
              {bookings.map(item => <div className={"facility-booking "+item.kind} key={item.kind+item.id}>{bookingLabel(item)}</div>)}
            </div>;
          })}
        </div>
      </div>
    </section>
    <section className="card"><h2>{t.summary}</h2>
      {listed.length ? <ul>{listed.map(item => <li key={item.kind+item.id}>
        <strong>{bookingLabel(item)}</strong> · {item.kind === "camp" ? t.camp : item.kind === "visit" ? churchVisitsCopy[locale].title : t.event} · {localTime(item.start)} – {localTime(item.end)}
        {item.kind !== "camp" && item.end !== item.blocked_until && <> · {t.cleanUntil}: {localTime(item.blocked_until)}</>}
        {item.rooms.length ? <details><summary>{t.roomCount}: {item.rooms.length}</summary><ul>{item.rooms.map((room,index) => <li key={room+"-"+index}>{room}</li>)}</ul></details> : <div>{t.noRooms}</div>}
      </li>)}</ul> : <p>{t.none}</p>}
    </section>
  </ReviewFrame>;
}
