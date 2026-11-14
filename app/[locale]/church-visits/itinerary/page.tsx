import { randomUUID } from "node:crypto";
import Link from "next/link";
import { notFound,redirect } from "next/navigation";
import { isLocale } from "../../../../lib/copy";
import { currentRole } from "../../../../lib/session";
import { getDatabase } from "../../../../lib/database";
import { dateParts } from "../../../../lib/registration";
import { visitIdPattern } from "../../../../lib/church-visits";
import { calculateVisitBudget,getVisitPlan,visitPlanDays,type Activity,type VisitCost } from "../../../../lib/visit-itinerary";
import { visitItineraryCopy } from "../../../../lib/visit-itinerary-copy";
import { ReviewFrame } from "../../intake/review-frame";
import { RegistrationLink } from "../registration-link";
import { PlanForm,MealFields } from "./plan-form";
import { BudgetSummary,CostTable } from "./budget-summary";
import { DaySelector } from "./day-selector";

export default async function VisitItinerary({params,searchParams}: {
  params:Promise<{locale:string}>;searchParams:Promise<{visit?:string;day?:string;status?:string}>;
}) {
  const {locale}=await params;
  if (!isLocale(locale)) notFound();
  if (await currentRole()!=="leadership") redirect("/"+locale);
  const query=await searchParams,id=query.visit;
  if (!id || !visitIdPattern.test(id)) redirect("/"+locale+"/church-visits");
  const db=await getDatabase(), plan=await getVisitPlan(db,id);
  if (!plan) notFound();
  const t=visitItineraryCopy[locale],budget=calculateVisitBudget(plan),base="/"+locale+"/church-visits";
  const day=query.day && dateParts(query.day) ? query.day : plan.visit.start;
  const shortVisit=(Date.parse(plan.visit.end)-Date.parse(plan.visit.start))/86400000<=366;
  const days=shortVisit ? visitPlanDays(plan.visit.start,plan.visit.end) : [plan.visit.start,plan.visit.end];
  const active=plan.activities.filter(activity => !activity.archived_at);
  const outside=active.filter(activity => activity.day<plan.visit.start || activity.day>plan.visit.end);
  const [publications,history]=await Promise.all([
    db.query<{id:string;revision:number;version:number;date:string;withdrawn_at:string|null}>(`SELECT id,revision,version,withdrawn_at::text AS withdrawn_at,
      to_char(published_at AT TIME ZONE 'America/Panama','YYYY-MM-DD HH24:MI') AS date
      FROM visit_budget_publication WHERE visit_id=$1 ORDER BY version DESC`,[id]).then(result => result.rows),
    db.query<{request_id:string;recorded_by:string;notes:string;operation:string;date:string}>(`SELECT request_id,recorded_by,notes,operation,
      to_char(recorded_at AT TIME ZONE 'America/Panama','YYYY-MM-DD HH24:MI') AS date
      FROM visit_plan_change WHERE visit_id=$1 ORDER BY recorded_at DESC,request_id DESC LIMIT 30`,[id]).then(result => result.rows),
  ]);
  const fields=(operation:string,itemId?:string) => <>
    <input name="locale" type="hidden" value={locale} /><input name="visit" type="hidden" value={id} />
    <input name="request" type="hidden" value={randomUUID()} /><input name="revision" type="hidden" value={plan.visit.itinerary_revision} />
    <input name="operation" type="hidden" value={operation} /><input name="returnDay" type="hidden" value={day} />
    {itemId && <input name="id" type="hidden" value={itemId} />}
  </>;
  const activityEditor=(activity?:Activity) => <PlanForm locale={locale} label={t.saveActivity}>
    {fields("activitySave",activity?.id ?? randomUUID())}<div className="grid">
      <label><span>{t.day} *</span><input name="day" type="date" min={plan.visit.start} max={plan.visit.end} required defaultValue={activity?.day ?? day} /></label>
      <label><span>{t.activityTitle} *</span><input name="title" maxLength={160} required defaultValue={activity?.title} /></label>
      <label><span>{t.time}</span><input name="time" type="time" defaultValue={activity?.time ?? ""} /></label>
      <label><span>{t.location}</span><input name="location" maxLength={200} defaultValue={activity?.location} /></label>
    </div><label><span>{t.activityNotes}</span><textarea name="activityNotes" maxLength={2000} defaultValue={activity?.notes} /></label>
  </PlanForm>;
  const costEditor=(activity:string|null,cost?:VisitCost) => <PlanForm locale={locale} label={t.saveCost}>
    {fields("costSave",cost?.id ?? randomUUID())}<input name="activity" type="hidden" value={activity ?? ""} />
    <div className="grid">
      {activity ? <MealFields locale={locale} meal={cost?.meal} source={cost?.meal_source} description={cost?.description} /> :
        <label><span>{t.description} *</span><input name="description" maxLength={200} required defaultValue={cost?.description} /></label>}
      <label><span>{t.payer} *</span><select name="payer" required defaultValue={cost?.payer ?? ""}><option value="">—</option>
        <option value="camp">{t.camp}</option><option value="church">{t.church}</option><option value="personal">{t.personal}</option>
      </select></label>
      <label><span>{t.basis} *</span><select name="basis" required defaultValue={cost?.basis ?? ""}><option value="">—</option><option value="person">{t.person}</option><option value="group">{t.group}</option></select></label>
      <label><span>{t.applies} *</span><select name="applies" required defaultValue={cost?.applies_to ?? "all"}>
        {(["all","student","adult","leader"] as const).map(value => <option key={value} value={value}>{t[value]}</option>)}
      </select></label>
      <label><span>{t.quantity}</span><input name="quantity" type="number" min={0} max={1000} defaultValue={cost?.quantity_override ?? ""} /></label>
      <label><span>{t.unit}</span><input name="price" inputMode="decimal" defaultValue={cost?.unit_cents==null ? "" : (cost.unit_cents/100).toFixed(2)} /></label>
    </div><p className="muted">{t.quantityHelp}</p><p className="muted">{t.priceHelp}</p>
  </PlanForm>;
  const costControls=(activity:string|null) => !plan.visit.cancelled_at && <>
    <details><summary>{t.addCost}</summary>{costEditor(activity)}</details>
    {plan.costs.filter(cost => cost.activity_id===activity && !cost.archived_at).map(cost => <details key={cost.id}><summary>{t.edit} · {cost.meal ? t[cost.meal] : cost.description}</summary>
      {costEditor(activity,cost)}<details><summary>{t.archiveCost}</summary><PlanForm locale={locale} label={t.archiveCost} reason>{fields("costArchive",cost.id)}</PlanForm></details>
    </details>)}
  </>;
  const targetDay=<label><span>{t.targetDay} *</span><input name="targetDay" type="date" min={plan.visit.start} max={plan.visit.end} required /></label>;
  const dayUrl=(value:string) => base+"/itinerary?"+new URLSearchParams({visit:id,day:value});
  const operationLabel:Record<string,string>={activitySave:t.saveActivity,activityArchive:t.archiveActivity,activityRestore:t.restoreActivity,
    costSave:t.saveCost,costArchive:t.archiveCost,costRestore:t.restoreCost,copyActivity:t.copyActivity,copyDay:t.copyDay,settings:t.saveSettings,publish:t.publish,
    estimateWithdraw:t.withdrawEstimate,estimateRestore:t.restoreEstimate};
  return <ReviewFrame locale={locale} section="church-visits/itinerary" title={t.title} visit={id} day={day}>
    <p><Link href={base+"?visit="+id}>{t.setup}</Link>{" · "}<Link href={base+"/visitors?visit="+id}>{t.roster}</Link></p>
    <h2>{plan.visit.name}</h2><p>{plan.visit.start} – {plan.visit.end}</p>
    {query.status==="saved" && <p className="notice" role="status">{t.saved}</p>}
    {plan.visit.cancelled_at && <p className="notice">{t.closed}</p>}
    {outside.length>0 && <section className="card notice"><p>{t.outsideDates}</p><ul>{outside.map(activity => <li key={activity.id}><Link href={dayUrl(activity.day)}>{activity.day} · {activity.title}</Link></li>)}</ul></section>}
    <details><summary>{t.summary}</summary><BudgetSummary locale={locale} budget={budget} countBasis={plan.settings.count_basis} extra={plan.settings.personal_extra_cents} shareGroupCosts={plan.settings.share_group_costs} /></details>
    {!plan.visit.cancelled_at && <section className="card"><details><summary>{t.settings}</summary>
      <PlanForm locale={locale} label={t.saveSettings}>{fields("settings")}<div className="grid">
        <label><span>{t.countBasis} *</span><select name="countBasis" defaultValue={plan.settings.count_basis}><option value="expected">{t.expected}</option><option value="registered">{t.registered}</option></select></label>
        <label><span>{t.extra} *</span><input name="extra" inputMode="decimal" required defaultValue={(plan.settings.personal_extra_cents/100).toFixed(2)} /></label>
      </div><label className="check"><input name="shareGroup" type="checkbox" defaultChecked={plan.settings.share_group_costs} />{t.shareGroup}</label></PlanForm>
    </details></section>}
    <section className="card"><h2>{t.day} · {day}</h2>
      <DaySelector visit={id} day={day} start={plan.visit.start} end={plan.visit.end} days={days} label={t.day} submitLabel={t.viewDay} />
      {!plan.visit.cancelled_at && <><details><summary>{t.addActivity}</summary>{activityEditor()}</details>
        <details><summary>{t.copyDay}</summary><PlanForm locale={locale} label={t.copyDay}>{fields("copyDay")}<input name="sourceDay" type="hidden" value={day} />{targetDay}</PlanForm></details></>}
    </section>
    {active.filter(activity => activity.day===day).length===0 && <p>{t.noActivities}</p>}
    {active.filter(activity => activity.day===day).map(activity => <section className="card" key={activity.id}>
      <h2>{activity.time && activity.time+" · "}{activity.title}</h2><p>{activity.location}</p>{activity.notes && <p>{activity.notes}</p>}
      <CostTable locale={locale} lines={budget.lines.filter(line => line.activity_id===activity.id)} />
      {costControls(activity.id)}
      {!plan.visit.cancelled_at && <><details><summary>{t.edit} · {t.activity}</summary>{activityEditor(activity)}</details>
        <details><summary>{t.copyActivity}</summary><PlanForm locale={locale} label={t.copyActivity}>{fields("copyActivity",activity.id)}{targetDay}</PlanForm></details>
        <details><summary>{t.archiveActivity}</summary><PlanForm locale={locale} label={t.archiveActivity} reason>{fields("activityArchive",activity.id)}</PlanForm></details></>}
    </section>)}
    <section className="card"><h2>{t.wholeVisit}</h2><p>{t.wholeHelp}</p><CostTable locale={locale} lines={budget.lines.filter(line => !line.activity_id)} />{costControls(null)}</section>
    {!plan.visit.cancelled_at && <section className="card"><details><summary>{t.archived}</summary>
      {plan.activities.filter(activity => activity.archived_at).map(activity => <details key={activity.id}><summary>{activity.day} · {activity.title}</summary>
        <PlanForm locale={locale} label={t.restoreActivity} reason>{fields("activityRestore",activity.id)}</PlanForm>
      </details>)}
      {plan.costs.filter(cost => cost.archived_at).map(cost => <details key={cost.id}><summary>{cost.meal ? t[cost.meal] : cost.description}</summary><PlanForm locale={locale} label={t.restoreCost} reason>{fields("costRestore",cost.id)}</PlanForm></details>)}
    </details></section>}
    <section className="card"><h2>{t.published}</h2>
      {!plan.visit.cancelled_at && <details><summary>{t.publish}</summary><p>{t.publishHelp}</p><PlanForm locale={locale} label={t.publish}>{fields("publish")}</PlanForm></details>}
      {publications.length ? publications.map(item => <details key={item.id} open={item.id===publications[0].id}><summary>{t.version} {item.version} · {item.date} · {item.withdrawn_at ? t.withdrawn : item.revision===plan.visit.itinerary_revision ? t.current : t.changed}</summary>
        <p><Link href={base+"/estimate/"+item.id}>{t.openEstimate}</Link></p>{!item.withdrawn_at && <RegistrationLink locale={locale} path={base+"/estimate/"+item.id} label={t.link} />}
        {!plan.visit.cancelled_at && <details><summary>{item.withdrawn_at ? t.restoreEstimate : t.withdrawEstimate}</summary><PlanForm locale={locale} label={item.withdrawn_at ? t.restoreEstimate : t.withdrawEstimate} reason>
          {fields(item.withdrawn_at ? "estimateRestore" : "estimateWithdraw",item.id)}
        </PlanForm></details>}
      </details>) : <p>{t.noEstimate}</p>}
    </section>
    {history.length>0 && <section className="card"><details><summary>{t.history}</summary><ul>{history.map(item => <li key={item.request_id}>{item.date} · {operationLabel[item.operation] ?? item.operation} · {item.recorded_by}{item.notes && " · "+item.notes}</li>)}</ul></details></section>}
  </ReviewFrame>;
}
