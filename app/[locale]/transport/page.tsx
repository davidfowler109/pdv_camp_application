import { randomUUID } from "node:crypto";
import { redirect } from "next/navigation";
import Link from "../app-link";
import { currentRole } from "../../../lib/session";
import { getDatabase } from "../../../lib/database";
import { campWeekOptions,listCampWeeks } from "../../../lib/camp-week";
import { getCampTransport,activeTransport,transportNeedsReview,savedTransportLabel,transportStopLabel,type TransportStop } from "../../../lib/camp-transport";
import { campTransportCopy } from "../../../lib/camp-transport-copy";
import { requireReview,ReviewFrame } from "../intake/review-frame";
import { WeekSelector } from "../week-selector";
import { TransportForm } from "./transport-form";

export default async function TransportSetup({params,searchParams}:{params:Promise<{locale:string}>;searchParams:Promise<{week?:string;status?:string}>}){
  const {locale}=await requireReview((await params).locale);
  if(await currentRole()!=="leadership")redirect("/"+locale);
  const query=await searchParams,db=await getDatabase(),weeks=await listCampWeeks(db),week=weeks.find(w=>String(w.id)===query.week)??weeks[0],t=campTransportCopy[locale];
  if(!week)redirect("/"+locale);
  const revision=(await db.query<{transport_revision:number}>("SELECT transport_revision FROM camp_week WHERE id=$1",[week.id])).rows[0].transport_revision;
  const plan=await getCampTransport(db,week.id),active=activeTransport(plan.stops);
  const registrations=(await db.query<{id:string;name:string;details:Record<string,string>}>("SELECT id,first_name||' '||last_name AS name,details FROM registration WHERE week_id=$1 AND place_status<>'released' ORDER BY lower(last_name),lower(first_name),id",[week.id])).rows;
  const review=registrations.flatMap(person=>(["arrival","departure"] as const).filter(leg=>transportNeedsReview(person.details,leg,plan.stops)).map(leg=>({person,leg})));
  const fields=(operation:string,id?:string)=><><input type="hidden" name="locale" value={locale}/><input type="hidden" name="week" value={week.id}/><input type="hidden" name="request" value={randomUUID()}/><input type="hidden" name="revision" value={revision}/><input type="hidden" name="operation" value={operation}/>{id&&<input type="hidden" name="id" value={id}/>}</>;
  const stopForm=(route:string,stop?:TransportStop)=><TransportForm locale={locale} label={t.saveStop}>{fields("stopSave",stop?.id??randomUUID())}<input type="hidden" name="route" value={route}/><div className="grid">
    <label><span>{t.leg} *</span><select name="leg" defaultValue={stop?.leg??"arrival"}><option value="arrival">{t.arrival}</option><option value="departure">{t.departure}</option></select></label>
    <label><span>{t.location} *</span><input name="location" required maxLength={160} defaultValue={stop?.location}/></label>
    <label><span>{t.time} *</span><input name="time" type="time" step={60} required defaultValue={stop?.time??""}/></label>
    <label><span>{t.notes}</span><input name="notes" maxLength={500} defaultValue={stop?.notes}/></label></div></TransportForm>;
  const history=(await db.query<{request_id:string;operation:string;registration_id:string|null;recorded_by:string;reason:string;date:string}>("SELECT request_id,operation,registration_id,recorded_by,reason,to_char(recorded_at AT TIME ZONE 'America/Panama','YYYY-MM-DD HH24:MI') AS date FROM camp_transport_history WHERE week_id=$1 ORDER BY recorded_at DESC LIMIT 30",[week.id])).rows;
  return <ReviewFrame locale={locale} section="transport" title={t.title} week={week.id}>
    <p><Link href={"/"+locale+"?week="+week.id}>{t.back}</Link></p><section className="card"><WeekSelector selected={week.id} weeks={campWeekOptions(weeks,locale)} label={t.week} submitLabel={t.week}/><p>{t.help}</p>
      {query.status==="saved"&&<p role="status">{t.saved}</p>}{plan.stops.some(s=>!s.time)&&<p className="notice">{t.legacy}</p>}
      <details><summary>{t.copy}</summary><p>{t.copyHelp}</p><TransportForm locale={locale} label={t.copy}>{fields("copy")}<label><span>{t.source} *</span><select name="source" required defaultValue=""><option value="">—</option>{campWeekOptions(weeks.filter(w=>w.id!==week.id),locale).map(w=><option key={w.id} value={w.id}>{w.label}</option>)}</select></label></TransportForm></details>
    </section><h2>{t.routes}</h2>{!plan.routes.length&&<p>{t.empty}</p>}
    <section className="card"><details><summary>{t.addRoute}</summary><TransportForm locale={locale} label={t.saveRoute}>{fields("routeSave",randomUUID())}<div className="grid">
      <label><span>{t.name} *</span><input name="name" maxLength={40} required/></label><label><span>{t.vehicle} *</span><input name="vehicle" maxLength={40} required/></label></div></TransportForm></details></section>
    {plan.routes.map(route=><section className="card" key={route.id}><h3>{route.name} · {route.vehicle}{!route.active&&" · "+t.archived}</h3>
      <details><summary>{t.saveRoute}</summary><TransportForm locale={locale} label={t.saveRoute}>{fields("routeSave",route.id)}<div className="grid"><label><span>{t.name} *</span><input name="name" maxLength={40} required defaultValue={route.name}/></label><label><span>{t.vehicle} *</span><input name="vehicle" maxLength={40} required defaultValue={route.vehicle}/></label></div></TransportForm></details>
      {plan.stops.filter(s=>s.route_id===route.id).map(stop=><details key={stop.id}><summary>{t[stop.leg]} · {transportStopLabel(stop,locale)}{!stop.active&&" · "+t.archived}</summary>{route.active&&stopForm(route.id,stop)}<TransportForm locale={locale} label={stop.active?t.archive:t.restore}>{fields("stopToggle",stop.id)}</TransportForm></details>)}
      {route.active&&<details><summary>{t.addStop}</summary>{stopForm(route.id)}</details>}
      <details><summary>{route.active?t.archive:t.restore}</summary><TransportForm locale={locale} label={route.active?t.archive:t.restore}>{fields("routeToggle",route.id)}</TransportForm></details>
    </section>)}
    <section className="card" id="review"><h2>{t.review} ({review.length})</h2><p>{t.reviewHelp}</p>{!review.length&&<p>{t.noReview}</p>}
      {review.map(({person,leg})=><details key={person.id+leg}><summary>{person.name} · {t[leg]}</summary><p>{t.savedPlan}: {savedTransportLabel(person.details,leg,locale)}</p><Link href={"/"+locale+"/intake/"+person.id}>{person.name}</Link>
        <TransportForm locale={locale} label={t.saveReview}>{fields("review")}<input name="registration" type="hidden" value={person.id}/><input name="leg" type="hidden" value={leg}/>
          <label><span>{t.currentPlan} *</span><select name="choice" required defaultValue=""><option value="">—</option><option value="own">{t.own}</option>{active.filter(s=>s.leg===leg).map(s=><option value={s.id} key={s.id}>{transportStopLabel(s,locale)}</option>)}</select></label>
        </TransportForm></details>)}
    </section>{history.length>0&&<section className="card"><details><summary>{t.history}</summary><ul>{history.map(h=><li key={h.request_id}>{h.date} · {h.operation==="review"?t.reviewOperation:h.operation==="copy"?t.copyOperation:t[h.operation as "routeSave"]} · {h.recorded_by} · {h.reason}{h.registration_id&&<> · <Link href={"/"+locale+"/intake/"+h.registration_id}>{registrations.find(r=>r.id===h.registration_id)?.name??h.registration_id}</Link></>}</li>)}</ul></details></section>}
  </ReviewFrame>;
}
