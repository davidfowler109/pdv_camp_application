import type { ReactNode } from "react";
import Link from "next/link";
import { campWeekLabel, listCampWeeks } from "../../../lib/camp-week";
import { getDatabase } from "../../../lib/database";
import { departureCopy } from "../../../lib/departure-copy";
import { ageOn, panamaDate } from "../../../lib/registration";
import { requireReview, ReviewFrame } from "../intake/review-frame";
import { DepartureFilters } from "./departure-filters";
import { CorrectionHistory } from "../correction-history";
import { saveDeparture } from "./actions";
import { BusDeparture, type BusCandidate } from "./bus-departure";

type Status = "waiting"|"boarded"|"awaiting"|"complete";
type Row = {
  id:string; camper:string; birth:string; planned:string|null; stop:string|null; expected_pickup:string|null;
  method:"bus"|"pickup"|"home"|"self"|null; bus:string|null; pickup_name:string|null; handoff_note:string|null;
  recorded_at:Date|null; version:string|null; departed_at:Date|null; handoff_at:Date|null; state:Status;
};
type Bus = { bus_key:string; name:string; departed_at:Date|null; boarded:number };

export default async function Departure({ params, searchParams }: {
  params:Promise<{locale:string}>; searchParams:Promise<{week?:string;q?:string;open?:string;camper?:string;status?:string}>;
}) {
  const { locale, role } = await requireReview((await params).locale);
  const query = await searchParams, t = departureCopy[locale];
  const db = await getDatabase();
  const weeks = await listCampWeeks(db);
  const week = weeks.find(item => String(item.id) === query.week) ?? weeks[0];
  const search = typeof query.q === "string" ? query.q.trim().slice(0,100) : "";
  const open = query.open === "yes";
  const camper = typeof query.camper === "string" ? query.camper : "";
  const base = "/"+locale+"/departure";
  const state = new URLSearchParams();
  if (week) state.set("week",String(week.id));
  if (search) state.set("q",search);
  if (open) state.set("open","yes");

  const [rows,buses,candidates] = week ? await Promise.all([
    db.query<Row>(
      `WITH departures AS (
        SELECT r.id,r.first_name || ' ' || r.last_name AS camper,r.date_of_birth::text AS birth,r.last_name,r.first_name,
          r.details->>'departure' AS planned,r.details->>'departureStop' AS stop,r.details->>'pickup' AS expected_pickup,
          d.method,b.name AS bus,d.pickup_name,d.handoff_note,d.recorded_at,d.recorded_at::text AS version,b.departed_at,d.handoff_at,
          CASE WHEN d.method IS NULL THEN 'waiting' WHEN d.method='bus' AND b.departed_at IS NULL THEN 'boarded'
               WHEN d.method='bus' AND d.handoff_required AND d.handoff_at IS NULL THEN 'awaiting' ELSE 'complete' END AS state
        FROM registration r JOIN camper_arrival a ON a.registration_id=r.id AND a.voided_at IS NULL
        LEFT JOIN camper_departure d ON d.registration_id=r.id
        LEFT JOIN return_bus b ON b.week_id=d.week_id AND b.bus_key=d.bus_key
        WHERE r.week_id=$1)
       SELECT * FROM departures WHERE (NOT $3::boolean OR state<>'complete' OR id::text=$4)
         AND position(lower($2) in lower(camper))>0
       ORDER BY (state='complete'),lower(last_name),lower(first_name),id`,[week.id,search,open,camper],
    ).then(result => result.rows),
    db.query<Bus>(
      `SELECT b.bus_key,b.name,b.departed_at,(SELECT count(*)::integer FROM camper_departure d WHERE d.week_id=b.week_id AND d.bus_key=b.bus_key) AS boarded
       FROM return_bus b WHERE b.week_id=$1 ORDER BY (b.departed_at IS NOT NULL),b.name,b.bus_key`,[week.id],
    ).then(result => result.rows),
    db.query<BusCandidate>(
      `SELECT r.id,r.first_name || ' ' || r.last_name AS camper,r.details->>'departureStop' AS stop,
         d.bus_key,d.recorded_at::text AS version,COALESCE(d.handoff_required,false) AS handoff_required
       FROM registration r JOIN camper_arrival a ON a.registration_id=r.id AND a.voided_at IS NULL
       LEFT JOIN camper_departure d ON d.registration_id=r.id
       LEFT JOIN return_bus b ON b.week_id=d.week_id AND b.bus_key=d.bus_key
       WHERE r.week_id=$1 AND ((d.registration_id IS NULL AND r.details->>'departure'='bus')
         OR (d.method='bus' AND b.departed_at IS NULL))
       ORDER BY lower(r.last_name),lower(r.first_name),r.id`,[week.id],
    ).then(result => result.rows),
  ]) : [[],[],[]];
  const row = rows.find(item => item.id === camper);
  const reopensDeparture = role === "leadership" && row?.state === "waiting" && (await db.query(
    "SELECT 1 FROM camper_operation_correction WHERE registration_id=$1 AND operation='correctDeparture' LIMIT 1",[row.id],
  )).rows.length > 0;
  const visibleRows = open ? rows.filter(item => item.state !== "complete") : rows;
  const hasArrivals = visibleRows.length > 0 || (week && (await db.query<{ present: boolean }>(
    "SELECT EXISTS(SELECT 1 FROM camper_arrival a JOIN registration r ON r.id=a.registration_id WHERE r.week_id=$1 AND a.voided_at IS NULL) AS present", [week.id],
  )).rows[0].present);
  const date = new Intl.DateTimeFormat(locale === "es" ? "es-PA" : "en-US",{dateStyle:"medium",timeStyle:"short",timeZone:"America/Panama"});
  const dateText = (value:Date) => date.format(new Date(value));
  const status = query.status;
  const messages = {saved:t.saved,invalid:t.invalid,unavailable:t.unavailable,departed:t.departed,leadership:t.leadership,stale:t.stale};
  const actor = <label>{t.staff}<input name="actor" required maxLength={100} /></label>;
  const verification = <label className="check"><input type="checkbox" name="verified" required />{t.verified}</label>;
  const note = <label>{t.notes}<input name="note" maxLength={500} /></label>;
  const recipient = <label>{t.recipient}<input name="recipient" required maxLength={150} /></label>;
  function form(operation:string, label:string, content:ReactNode, camperId?:string) {
    return <form action={saveDeparture}>
      <input type="hidden" name="locale" value={locale} /><input type="hidden" name="week" value={week?.id} />
      <input type="hidden" name="operation" value={operation} />
      {camperId && <input type="hidden" name="camper" value={camperId} />}
      <input type="hidden" name="q" value={search} />{open && <input type="hidden" name="open" value="yes" />}
      {content}<button>{label}</button>
    </form>;
  }
  function actual(item:Row) {
    if (item.method === "bus") return item.bus;
    if (!item.method) return "—";
    return t[item.method]+(item.pickup_name ? " · "+item.pickup_name : "");
  }

  return <ReviewFrame locale={locale} section="departure" title={t.title} week={week?.id}>
    {status && Object.hasOwn(messages,status) && <p className="notice" role={status === "saved" ? "status" : "alert"}>{messages[status as keyof typeof messages]}</p>}
    {week && <>
      <section className="card">
        <DepartureFilters key={state.toString()}>
          <div className="grid">
            <label>{t.week}<select name="week" defaultValue={week.id}>{weeks.map(item => <option key={item.id} value={item.id}>{campWeekLabel(item,locale)}</option>)}</select></label>
            <label>{t.search}<input type="search" name="q" defaultValue={search} maxLength={100} /></label>
            <label className="check"><input name="open" type="checkbox" value="yes" defaultChecked={open} />{t.open}</label>
          </div><button>{t.filter}</button>
        </DepartureFilters>
      </section>
      {row && <section className="card">
        <Link href={base+"?"+state}>{t.close}</Link>
        <h2>{row.camper}</h2><p>{t[row.state]} · {actual(row)}{row.recorded_at && <> · {dateText(row.recorded_at)}</>}</p>
        {row.handoff_at && row.method === "bus" && <p>{row.pickup_name} · {dateText(row.handoff_at)}</p>}
        {row.handoff_note && <p>{row.handoff_note}</p>}
        {row.state === "waiting" && <>
          <details open={row.planned === "bus"}><summary>{t.recordBoarding}</summary>
            {form("board",t.recordBoarding,<><div className="grid">
              <label>{t.busName}<input name="bus" list="return-bus-names" maxLength={100} required /></label>{actor}
            </div><small>{t.choose}</small>
              <datalist id="return-bus-names">{buses.filter(bus => reopensDeparture || !bus.departed_at).map(bus => <option key={bus.name} value={bus.name} />)}</datalist>
              <label className="check"><input type="checkbox" name="handoffRequired" />{t.handoffNeeded}</label>
            </>,row.id)}
          </details>
          <details open={row.planned !== "bus"}><summary>{t.recordPickup}</summary>
            <p>{t.expectedRecipient}: {row.expected_pickup ?? t.noRecipient}</p><p className="muted">{t.leadershipHelp}</p>
            {form("pickup",t.recordPickup,<><div className="grid">
              <label>{t.actual}<select name="method"><option value="pickup">{t.pickup}</option>{role === "leadership" && <option value="home">{t.home}</option>}</select></label>
              {recipient}{note}{actor}
            </div>{verification}</>,row.id)}
          </details>
          {(ageOn(row.birth,panamaDate()) ?? 0) >= 18 && <details><summary>{t.self}</summary>
            {form("self",t.self,<><div className="grid">{actor}</div>
              <label className="check"><input type="checkbox" name="verified" required />{t.selfVerified}</label></>,row.id)}
          </details>}
        </>}
        {row.state === "awaiting" && form("handoff",t.recordHandoff,<><div className="grid">{recipient}{note}{actor}</div>{verification}</>,row.id)}
        {row.state === "boarded" && <details><summary>{t.undoBoarding}</summary>
          {form("undoBoarding",t.undoBoarding,<><input type="hidden" name="version" value={row.version ?? ""} />
            <div className="grid"><label>{t.correctionReason}<input name="note" required maxLength={500} /></label>{actor}</div>
          </>,row.id)}
        </details>}
        {role === "leadership" && (row.state === "awaiting" || row.state === "complete") && <details><summary>{t.correctDeparture}</summary>
          {form("correctDeparture",t.correctDeparture,<><input type="hidden" name="version" value={row.version ?? ""} />
            <div className="grid"><label>{t.correctionReason}<input name="note" required maxLength={500} /></label>{actor}</div>
          </>,row.id)}
        </details>}
        <CorrectionHistory id={row.id} locale={locale} kind="departure" />
      </section>}
      <section className="card"><h2>{t.buses}</h2>
        {candidates.length > 0 && <BusDeparture key={week.id} locale={locale} week={week.id} candidates={candidates}
          buses={buses.map(bus => ({key:bus.bus_key,name:bus.name,departed:bus.departed_at !== null}))} search={search} open={open} />}
        {buses.length ? <div className="dorms">{buses.map(bus => <article className="card" key={bus.name}>
          <h3>{bus.name} · {bus.boarded}</h3><p>{bus.departed_at ? t.busDeparted+" · "+dateText(bus.departed_at) : t.atCamp}</p>
          {!bus.departed_at && form("departBus",t.departBus,<><input type="hidden" name="bus" value={bus.name} />{actor}</>)}
        </article>)}</div> : <p>{t.noBuses}</p>}
      </section>
      <section className="card"><h2>{open ? t.unresolved : t.title} · {week.name}</h2>
        {visibleRows.length ? <div className="roster-scroll"><table className="roster-table">
          <thead><tr><th scope="col">{t.camper}</th><th scope="col">{t.planned}</th><th scope="col">{t.status}</th><th scope="col">{t.actual}</th></tr></thead>
          <tbody>{visibleRows.map(item => <tr key={item.id}>
            <th scope="row"><Link href={base+"?"+new URLSearchParams([...state,["camper",item.id]])}>{item.camper}</Link></th>
            <td>{item.planned === "bus" ? item.stop ?? t.bus : item.planned === "own" ? t.own : "—"}</td>
            <td><span className={item.state === "complete" ? "badge" : "badge warn"}>{t[item.state]}</span></td><td>{actual(item)}</td>
          </tr>)}</tbody>
        </table></div> : <p>{hasArrivals ? t.none : t.noArrivals}</p>}
      </section>
    </>}
  </ReviewFrame>;
}
