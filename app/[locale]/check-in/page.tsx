import { CheckInRosterFilters } from "./roster-filters";
import Link from "next/link";
import { campWeekLabel, listCampWeeks } from "../../../lib/camp-week";
import { getDatabase } from "../../../lib/database";
import { copy } from "../../../lib/copy";
import { reviewCopy, formatMoney } from "../../../lib/review-copy";
import { checkInCopy } from "../../../lib/check-in-copy";
import { ageOn, panamaDate } from "../../../lib/registration";
import { placementOptions } from "../../../lib/check-in";
import { requireReview, ReviewFrame } from "../intake/review-frame";
import { CorrectionHistory } from "../correction-history";
import { recordCheckIn } from "./actions";

type Row = {
  id:string; camper:string; participation:"pending"|"granted"|"declined"; place_status:"pending"|"confirmed";
  planned:string|null; stop:string|null; arrival_method:"own"|"bus"|null; actual_bus:string|null; arrived_at:Date|null; revision:number|null;
  dorm_id:number|null; dorm:string|null; birth:string; group:string; balance:number|null; departure_recorded:boolean;
};

export default async function CheckIn({ params, searchParams }: {
  params:Promise<{locale:string}>; searchParams:Promise<{week?:string;q?:string;stop?:string;camper?:string;status?:string}>;
}) {
  const { locale } = await requireReview((await params).locale);
  const query = await searchParams;
  const t = checkInCopy[locale], c = copy[locale], r = reviewCopy[locale];
  const db = await getDatabase();
  const weeks = await listCampWeeks(db);
  const week = weeks.find(item => String(item.id) === query.week) ?? weeks[0];
  const search = typeof query.q === "string" ? query.q.trim().slice(0,100) : "";
  const stops = week ? (await db.query<{stop:string}>(
    "SELECT DISTINCT details->>'arrivalStop' AS stop FROM registration WHERE week_id=$1 AND place_status<>'released' AND details->>'arrival'='bus' AND details->>'arrivalStop' IS NOT NULL ORDER BY stop",
    [week.id],
  )).rows : [];
  const stop = stops.find(item => item.stop === query.stop)?.stop ?? "";
  const rows = week ? (await db.query<Row>(
    `SELECT r.id,r.first_name || ' ' || r.last_name AS camper,r.place_status,r.participation,r.date_of_birth::text AS birth,r.gender_group AS "group",
      r.details->>'arrival' AS planned,r.details->>'arrivalStop' AS stop,
      a.arrival_method,a.actual_bus,a.arrived_at,a.revision,p.dorm_id,d.name AS dorm,
      EXISTS(SELECT 1 FROM camper_departure departure WHERE departure.registration_id=r.id) AS departure_recorded,
      CASE WHEN COALESCE(r.fee_at_registration_cents,w.fee_cents) IS NOT NULL THEN GREATEST(0,COALESCE(r.fee_at_registration_cents,w.fee_cents)
        - COALESCE((SELECT sum(amount_cents) FROM registration_payment pay WHERE pay.registration_id=r.id),0)
        - COALESCE((SELECT value_cents FROM scholarship_code s WHERE s.registration_id=r.id),0))::double precision END AS balance
     FROM registration r JOIN camp_week w ON w.id=r.week_id
     LEFT JOIN camper_arrival a ON a.registration_id=r.id AND a.voided_at IS NULL LEFT JOIN camper_placement p ON p.registration_id=r.id LEFT JOIN dorm d ON d.id=p.dorm_id
     WHERE r.week_id=$1 AND r.place_status<>'released' AND position(lower($2) in lower(r.first_name || ' ' || r.last_name)) > 0
       AND ($3='' OR $2<>'' OR r.details->>'arrivalStop'=$3 OR ($4<>'' AND r.id::text=$4))
     ORDER BY (a.arrived_at IS NOT NULL AND p.dorm_id IS NULL) DESC,lower(r.last_name),lower(r.first_name),r.id`,
    [week.id,search,stop,typeof query.camper === "string" ? query.camper : ""],
  )).rows : [];
  const row = rows.find(item => item.id === query.camper);
  const options = week && row?.arrived_at && !row.departure_recorded && row.place_status === "confirmed"
    ? (await placementOptions(db,week.id,ageOn(row.birth,week.start ?? panamaDate()),row.group,row.dorm_id)).filter(room => room.id !== row.dorm_id) : [];
  const base = "/"+locale+"/check-in";
  const state = new URLSearchParams();
  if (week) state.set("week",String(week.id));
  if (search) state.set("q",search);
  if (stop) state.set("stop",stop);
  const messages = {saved:t.saved,invalid:t.invalid,unavailable:t.unavailable,noLonger:t.noLonger,reasonRequired:t.reasonRequired,noPlace:t.noPlace,departureRecorded:t.departureRecorded,placementNeedsConfirmation:t.placementNeedsConfirmation,stale:t.stale};
  const status = query.status as keyof typeof messages | undefined;

  return <ReviewFrame locale={locale} section="check-in" title={t.title} week={week?.id}>
    {status && Object.hasOwn(messages,status) && <p className="notice" role={status === "saved" ? "status" : "alert"}>{messages[status]}</p>}
    {week && <>
      <p><Link className="action-link secondary" href={base+"/dorms?week="+week.id}>{locale === "en" ? "Dorm assignments" : "Asignaciones de dormitorios"}</Link></p>
      <section className="card">
        <CheckInRosterFilters locale={locale} week={week.id} weeks={weeks.map(item => ({id:item.id,label:campWeekLabel(item,locale)}))} stop={stop} stops={stops} search={search} />
      </section>
      {row && <section className="card" id="camper-check-in"><h2>{row.camper}</h2>
        <p>{r.place}: {r[row.place_status]} · {r.permission}: {r[row.participation]} · {r.balance}: {row.balance === null ? r.noFee : formatMoney(row.balance,locale)}</p>
        {row.arrived_at && row.participation !== "granted" && <p className="notice">{t.supervision}</p>}
        <p><Link href={"/"+locale+"/intake/"+row.id}>{t.review}</Link></p>
        <form action={recordCheckIn}>
          <input type="hidden" name="locale" value={locale} /><input type="hidden" name="week" value={week.id} />
          <input type="hidden" name="camper" value={row.id} /><input type="hidden" name="q" value={search} /><input type="hidden" name="stop" value={stop} />
          {!row.arrived_at ? <>
            <input type="hidden" name="operation" value="arrive" />
            <div className="grid">
              <label>{t.method}<select name="method" defaultValue={row.planned === "bus" ? "bus" : "own"}>
                <option value="bus">{t.bus}</option><option value="own">{t.own}</option></select></label>
              <label>{t.busName}<input name="bus" maxLength={100} /></label>
              <label>{t.actor}<input name="actor" required maxLength={100} /></label>
            </div><button>{t.mark}</button>
          </> : <>
            <p>{t.present} · {t.actual}: {row.arrival_method === "bus" ? row.actual_bus : t.own} · {t.dorm}: {row.dorm ?? t.unassigned}</p>
            {row.departure_recorded ? <p>{locale === "en" ? "Dorm assignments are closed after boarding or departure is recorded." : "No se cambia el dormitorio después de registrar el abordaje o la salida."}</p> : row.place_status !== "confirmed" ? <p>{t.noPlace}</p> : !options.length ? <p>{row.dorm ? t.noOtherDorm : t.noDorm}</p> : <>
              <input type="hidden" name="operation" value="place" />
              <div className="grid">
                <label>{t.dorm}<select key={row.id+":"+row.dorm_id} name="dorm" defaultValue={options[0].id}>
                  {options.map((room,index) => <option key={room.id} value={room.id}>{room.name} · {room.building}{!row.dorm_id && index === 0 ? " · "+t.suggested : ""}</option>)}</select></label>
                <label>{t.reason}<input name="reason" maxLength={500} /></label>
                <label>{t.actor}<input name="actor" required maxLength={100} /></label>
              </div>
              <ul>{options.map(room => <li key={room.id}><strong>{room.name}</strong> · {t.available}: {room.beds}
                {" · "}{c.guides}: {room.guides.join(", ")} · {c.helpers}: {room.counselors.join(", ")}</li>)}</ul>
              <button>{row.dorm ? t.change : t.assign}</button>
            </>}
          </>}
        </form>
        {row.arrived_at && (["correctArrival","undoArrival"] as const).map(operation => <details key={operation}>
          <summary>{t[operation]}</summary>
          <form action={recordCheckIn}>
            <input type="hidden" name="locale" value={locale} /><input type="hidden" name="week" value={week.id} />
            <input type="hidden" name="camper" value={row.id} /><input type="hidden" name="q" value={search} /><input type="hidden" name="stop" value={stop} />
            <input type="hidden" name="operation" value={operation} /><input type="hidden" name="revision" value={row.revision ?? ""} />
            <div className="grid">
              {operation === "correctArrival" && <>
                <label>{t.method}<select name="method" defaultValue={row.arrival_method ?? "own"}>
                  <option value="bus">{t.bus}</option><option value="own">{t.own}</option>
                </select></label>
                <label>{t.busName}<input name="bus" defaultValue={row.actual_bus ?? ""} maxLength={100} /></label>
              </>}
              <label>{t.correctionReason}<input name="reason" required maxLength={500} /></label>
              <label>{t.actor}<input name="actor" required maxLength={100} /></label>
            </div>
            {operation === "undoArrival" && row.dorm_id !== null && <label className="check"><input type="checkbox" name="removePlacement" required />{t.removePlacement}</label>}
            <button>{t[operation]}</button>
          </form>
        </details>)}
        <CorrectionHistory id={row.id} locale={locale} kind="arrival" />
      </section>}
      <section className="card">{rows.length ? <div className="roster-scroll"><table className="roster-table">
        <thead><tr><th scope="col">{t.camper}</th><th scope="col">{t.planned}</th><th scope="col">{t.actual}</th>
          <th scope="col">{r.permission}</th><th scope="col">{r.balance}</th><th scope="col">{t.dorm}</th></tr></thead>
        <tbody>{rows.map(item => <tr key={item.id}>
          <th scope="row"><Link href={base+"?"+new URLSearchParams([...state,["camper",item.id]])}>{item.camper}</Link><br /><small>{r[item.place_status]}</small></th>
          <td>{item.planned === "bus" ? item.stop ?? t.bus : item.planned === "own" ? t.own : "—"}</td>
          <td>{item.arrived_at ? t.present+(item.actual_bus ? " · "+item.actual_bus : "") : t.expected}</td>
          <td>{r[item.participation]}</td><td>{item.balance === null ? r.noFee : formatMoney(item.balance,locale)}</td>
          <td>{item.dorm ?? (item.arrived_at ? t.unassigned : "—")}</td>
        </tr>)}</tbody>
      </table></div> : <p>{t.none}</p>}</section>
    </>}
  </ReviewFrame>;
}
