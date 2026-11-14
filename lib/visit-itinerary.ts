import { createHash, randomUUID } from "node:crypto";
import type { Database } from "./database.ts";
import { visitIdPattern } from "./church-visits.ts";
import { dateParts } from "./registration.ts";
import { integer } from "./housing.ts";
import { moneyCents } from "./review.ts";

export type Activity = {id:string;day:string;title:string;time:string|null;location:string;notes:string;archived_at:string|null};
export type VisitCost = {
  id:string;activity_id:string|null;description:string;payer:"camp"|"church"|"personal";basis:"person"|"group";
  applies_to:"all"|"student"|"adult"|"leader";quantity_override:number|null;unit_cents:number|null;
  meal:"breakfast"|"lunch"|"dinner"|null;meal_source:"camp"|"packed"|"outside"|null;archived_at:string|null;
};
export type VisitCounts = {student:number;adult:number;leader:number};
export type VisitPlan = {
  visit:{id:string;name:string;church_name:string;start:string;end:string;itinerary_revision:number;cancelled_at:string|null};
  expected:VisitCounts;registered:VisitCounts;settings:{count_basis:"expected"|"registered";share_group_costs:boolean;personal_extra_cents:number};
  activities:Activity[];costs:VisitCost[];
};
export type Budget = {
  counts:VisitCounts;count:number;totals:{camp:number;church:number;personal:number};incomplete:boolean;customCounts:boolean;
  lines:(VisitCost & {quantity:number;total:number|null;day:string|null})[];
  allowances:{role:"student"|"adult"|"leader";count:number;collect:number;bring:number}[];
  meals:{day:string;meal:"breakfast"|"lunch"|"dinner";camp:number;packed:number;outside:number}[];
};
export type SharedVisitEstimate = {visit:VisitPlan["visit"];activities:Activity[];budget:Budget;extra:number;countBasis:"expected"|"registered";shareGroupCosts:boolean};
export type ItineraryResult = {status:"saved"|"invalid"|"stale"|"closed"|"outsideDates"|"noteRequired"|"emptyDay"|"unavailable";day?:string};

export function visitPlanDays(start:string,end:string) {
  const days:string[] = [];
  for (let day=Date.parse(start+"T00:00:00Z");day<=Date.parse(end+"T00:00:00Z");day+=86400000) days.push(new Date(day).toISOString().slice(0,10));
  return days;
}

export async function getVisitPlan(db:Database,id:string):Promise<VisitPlan|null> {
  const row = (await db.query<VisitPlan["visit"] & {expected_students:number;expected_adults:number;expected_leaders:number}>(
    `SELECT id,name,church_name,starts_at::date::text AS start,ends_at::date::text AS end,itinerary_revision,cancelled_at::text AS cancelled_at,
      expected_students,expected_adults,expected_leaders FROM church_visit WHERE id=$1`,[id],
  )).rows[0];
  if (!row) return null;
  const [activities,costs,settings,registered] = await Promise.all([
    db.query<Activity>(`SELECT id,day::text AS day,title,to_char(time_of_day,'HH24:MI') AS time,location,notes,archived_at::text AS archived_at
      FROM visit_activity WHERE visit_id=$1 ORDER BY day,time_of_day NULLS LAST,title,id`,[id]).then(result => result.rows),
    db.query<VisitCost>("SELECT *,archived_at::text AS archived_at FROM visit_cost WHERE visit_id=$1 ORDER BY description,id",[id]).then(result => result.rows),
    db.query<VisitPlan["settings"]>("SELECT count_basis,share_group_costs,personal_extra_cents FROM visit_budget_settings WHERE visit_id=$1",[id]).then(result => result.rows[0]),
    db.query<VisitCounts>(`SELECT count(*) FILTER(WHERE visitor_role='student')::integer AS student,
      count(*) FILTER(WHERE visitor_role='adult')::integer AS adult,count(*) FILTER(WHERE visitor_role='leader')::integer AS leader
      FROM church_visitor WHERE visit_id=$1 AND withdrawn_at IS NULL`,[id]).then(result => result.rows[0]),
  ]);
  const {expected_students,expected_adults,expected_leaders,...visit} = row;
  return {visit,expected:{student:expected_students,adult:expected_adults,leader:expected_leaders},registered,
    activities,costs,settings:settings ?? {count_basis:"expected",share_group_costs:true,personal_extra_cents:0}};
}

export function calculateVisitBudget(plan:VisitPlan):Budget {
  const counts = plan[plan.settings.count_basis], count = counts.student+counts.adult+counts.leader;
  const activities = plan.activities.filter(activity => !activity.archived_at);
  const lines = plan.costs.filter(cost => !cost.archived_at && (!cost.activity_id || activities.some(activity => activity.id===cost.activity_id))).map(cost => {
    const quantity = cost.quantity_override ?? (cost.applies_to === "all" ? count : counts[cost.applies_to]);
    return {...cost,quantity,total:cost.unit_cents === null ? null : cost.unit_cents*(cost.basis === "group" ? 1 : quantity),
      day:activities.find(activity => activity.id===cost.activity_id)?.day ?? null};
  });
  const totals = {camp:0,church:0,personal:0};
  for (const line of lines) totals[line.payer]+=line.total ?? 0;
  const allowances = (["student","adult","leader"] as const).filter(role => counts[role]>0).map(role => {
    let collect=0,bring=plan.settings.personal_extra_cents;
    for (const line of lines.filter(line => line.quantity>0 && (line.applies_to === "all" || line.applies_to === role))) {
      const amount = line.unit_cents ?? 0;
      const share = line.basis === "person" ? amount : Math.ceil(amount/line.quantity);
      if (line.payer === "personal") bring+=share;
      else if (line.basis === "person" || plan.settings.share_group_costs) collect+=share;
    }
    return {role,count:counts[role],collect,bring};
  });
  const meals:Budget["meals"] = [];
  for (const line of lines) {
    if (!line.day || !line.meal || !line.meal_source) continue;
    let entry = meals.find(item => item.day===line.day && item.meal===line.meal);
    if (!entry) { entry={day:line.day,meal:line.meal,camp:0,packed:0,outside:0}; meals.push(entry); }
    entry[line.meal_source]+=line.quantity;
  }
  meals.sort((a,b) => a.day.localeCompare(b.day) || ["breakfast","lunch","dinner"].indexOf(a.meal)-["breakfast","lunch","dinner"].indexOf(b.meal));
  return {counts,count,totals,lines,allowances,meals,incomplete:lines.some(line => line.unit_cents === null),
    customCounts:lines.some(line => line.quantity_override !== null)};
}

export async function saveVisitPlan(tx:Database,form:FormData):Promise<ItineraryResult> {
  const read = (key:string) => typeof form.get(key) === "string" ? String(form.get(key)).trim() : "";
  const visit = read("visit").toLowerCase(), request = read("request").toLowerCase(), operation=read("operation"), actor=read("actor"), changeNotes=read("changeNotes");
  const operations=["activitySave","activityArchive","activityRestore","costSave","costArchive","costRestore","copyActivity","copyDay","settings","publish","estimateWithdraw","estimateRestore"];
  if (!visitIdPattern.test(visit) || !visitIdPattern.test(request) || !operations.includes(operation) || !actor || actor.length>160 || changeNotes.length>1000) return {status:"invalid"};
  const signature=createHash("sha256").update(JSON.stringify([...form.entries()].map(([key,value]) => [key,String(value)]).sort((a,b) => a[0].localeCompare(b[0]) || a[1].localeCompare(b[1])))).digest("hex");
  const current = (await tx.query<{itinerary_revision:number;cancelled_at:string|null}>("SELECT itinerary_revision,cancelled_at FROM church_visit WHERE id=$1 FOR UPDATE",[visit])).rows[0];
  if (!current) return {status:"closed"};
  const receipt=(await tx.query<{visit_id:string;request_signature:string}>("SELECT visit_id,request_signature FROM visit_plan_change WHERE request_id=$1",[request])).rows[0];
  if (receipt) return {status:receipt.visit_id===visit && receipt.request_signature===signature ? "saved" : "invalid"};
  if (current.cancelled_at) return {status:"closed"};
  if (String(current.itinerary_revision)!==read("revision")) return {status:"stale"};
  if ((operation.endsWith("Archive") || operation.endsWith("Restore") || operation==="estimateWithdraw") && !changeNotes) return {status:"noteRequired"};
  const before=(await getVisitPlan(tx,visit))!;
  const id=read("id").toLowerCase();
  const validDay=(day:string) => Boolean(dateParts(day)) && day>=before.visit.start && day<=before.visit.end;
  let returnDay=read("returnDay"), publication:string|null=null;
  if (operation === "settings") {
    const basis=read("countBasis"), extra=moneyCents(read("extra"));
    if (!["expected","registered"].includes(basis) || extra===null) return {status:"invalid"};
    await tx.query(`INSERT INTO visit_budget_settings(visit_id,count_basis,share_group_costs,personal_extra_cents) VALUES($1,$2,$3,$4)
      ON CONFLICT(visit_id) DO UPDATE SET count_basis=excluded.count_basis,share_group_costs=excluded.share_group_costs,personal_extra_cents=excluded.personal_extra_cents`,[visit,basis,form.has("shareGroup"),extra]);
  } else if (operation === "activitySave") {
    const day=read("day"),title=read("title"),time=read("time"),location=read("location"),notes=read("activityNotes");
    if (!visitIdPattern.test(id) || !validDay(day) || !title || title.length>160 || location.length>200 || notes.length>2000 || (time && !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(time))) return {status:"invalid"};
    const existing=(await tx.query<{visit_id:string}>("SELECT visit_id FROM visit_activity WHERE id=$1",[id])).rows[0];
    if (existing && existing.visit_id!==visit) return {status:"invalid"};
    await tx.query(`INSERT INTO visit_activity(id,visit_id,day,title,time_of_day,location,notes) VALUES($1,$2,$3,$4,$5::time,$6,$7)
      ON CONFLICT(id) DO UPDATE SET day=excluded.day,title=excluded.title,time_of_day=excluded.time_of_day,location=excluded.location,notes=excluded.notes`,[id,visit,day,title,time||null,location,notes]);
    returnDay=day;
  } else if (operation === "costSave") {
    const activity=read("activity"),payer=read("payer"),basis=read("basis"),applies=read("applies");
    const rawQuantity=read("quantity"),quantity=rawQuantity ? integer(rawQuantity,0,1000) : null;
    const rawPrice=read("price"),price=rawPrice ? moneyCents(rawPrice) : null;
    const meal=read("meal"),source=meal ? read("mealSource") : "";
    const mealNames:Record<string,string>={breakfast:"Breakfast",lunch:"Lunch",dinner:"Dinner"};
    const description=meal ? mealNames[meal] ?? "" : read("description");
    if (!visitIdPattern.test(id) || !description || description.length>200 || !["camp","church","personal"].includes(payer) || !["person","group"].includes(basis) ||
      !["all","student","adult","leader"].includes(applies) || (rawQuantity && quantity===null) || (rawPrice && price===null) ||
      (activity && !before.activities.some(item => item.id===activity && !item.archived_at)) ||
      (meal && (!activity || !["breakfast","lunch","dinner"].includes(meal) || !["camp","packed","outside"].includes(source) ||
        ((source==="camp" || source==="packed") && payer!=="camp")))) return {status:"invalid"};
    const existing=(await tx.query<{visit_id:string}>("SELECT visit_id FROM visit_cost WHERE id=$1",[id])).rows[0];
    if (existing && existing.visit_id!==visit) return {status:"invalid"};
    await tx.query(`INSERT INTO visit_cost(id,visit_id,activity_id,description,payer,basis,applies_to,quantity_override,unit_cents,meal,meal_source)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) ON CONFLICT(id) DO UPDATE SET activity_id=excluded.activity_id,description=excluded.description,
      payer=excluded.payer,basis=excluded.basis,applies_to=excluded.applies_to,quantity_override=excluded.quantity_override,unit_cents=excluded.unit_cents,meal=excluded.meal,meal_source=excluded.meal_source`,
      [id,visit,activity||null,description,payer,basis,applies,quantity,price,meal||null,source||null]);
  } else if (operation === "copyActivity" || operation === "copyDay") {
    const target=read("targetDay");
    if (!validDay(target) || (operation === "copyDay" && target===read("sourceDay"))) return {status:"invalid"};
    const sources=before.activities.filter(item => !item.archived_at && (operation === "copyActivity" ? item.id===id : item.day===read("sourceDay")));
    if (!sources.length) return {status:"emptyDay"};
    for (const activity of sources) {
      const copied=randomUUID();
      await tx.query("INSERT INTO visit_activity(id,visit_id,day,title,time_of_day,location,notes) VALUES($1,$2,$3,$4,$5::time,$6,$7)",[copied,visit,target,activity.title,activity.time,activity.location,activity.notes]);
      for (const cost of before.costs.filter(cost => cost.activity_id===activity.id && !cost.archived_at)) await tx.query(`INSERT INTO visit_cost(id,visit_id,activity_id,description,payer,basis,applies_to,quantity_override,unit_cents,meal,meal_source)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,[randomUUID(),visit,copied,cost.description,cost.payer,cost.basis,cost.applies_to,cost.quantity_override,cost.unit_cents,cost.meal,cost.meal_source]);
    }
    returnDay=target;
  } else if (operation === "publish") {
    const active=before.activities.filter(item => !item.archived_at);
    if (active.some(item => !validDay(item.day))) return {status:"outsideDates"};
    publication=randomUUID();
    const version=(await tx.query<{next:number}>("SELECT COALESCE(max(version),0)+1 AS next FROM visit_budget_publication WHERE visit_id=$1",[visit])).rows[0].next;
    const payload:SharedVisitEstimate={visit:before.visit,activities:active,budget:calculateVisitBudget(before),extra:before.settings.personal_extra_cents,
      countBasis:before.settings.count_basis,shareGroupCosts:before.settings.share_group_costs};
    await tx.query("INSERT INTO visit_budget_publication(id,visit_id,revision,version,payload) VALUES($1,$2,$3,$4,$5::jsonb)",[publication,visit,current.itinerary_revision,version,JSON.stringify(payload)]);
  } else if (operation==="estimateWithdraw" || operation==="estimateRestore") {
    if (!visitIdPattern.test(id) || !(await tx.query("SELECT id FROM visit_budget_publication WHERE id=$1 AND visit_id=$2",[id,visit])).rows.length) return {status:"invalid"};
    await tx.query("UPDATE visit_budget_publication SET withdrawn_at="+(operation==="estimateWithdraw" ? "CURRENT_TIMESTAMP" : "NULL")+" WHERE id=$1",[id]);
    publication=id;
  } else {
    const table=operation.startsWith("activity") ? "visit_activity" : "visit_cost";
    if (!visitIdPattern.test(id) || !(await tx.query("SELECT id FROM "+table+" WHERE id=$1 AND visit_id=$2",[id,visit])).rows.length) return {status:"invalid"};
    await tx.query("UPDATE "+table+" SET archived_at="+(operation.endsWith("Archive") ? "CURRENT_TIMESTAMP" : "NULL")+" WHERE id=$1",[id]);
  }
  if (!["publish","estimateWithdraw","estimateRestore"].includes(operation)) await tx.query("UPDATE church_visit SET itinerary_revision=itinerary_revision+1 WHERE id=$1",[visit]);
  const after=await getVisitPlan(tx,visit);
  await tx.query(`INSERT INTO visit_plan_change(request_id,visit_id,operation,request_signature,recorded_by,notes,previous_plan,resulting_plan)
    VALUES($1,$2,$3,$4,$5,$6,$7::jsonb,$8::jsonb)`,[request,visit,operation,signature,actor,changeNotes,JSON.stringify(before),JSON.stringify({...after,publication})]);
  return {status:"saved",day:dateParts(returnDay) ? returnDay : undefined};
}
