import type { Database } from "./database.ts";
import { ageOn, dateParts } from "./registration.ts";
import { visitIdPattern } from "./church-visits.ts";
import { churchVisitorCopy, visitAcknowledgmentVersion, visitNoticeVersion } from "./church-visitor-copy.ts";

export type VisitorMode = "online" | "desk" | "edit";
export type VisitorResult = "received" | "saved" | "invalid" | "closed" | "unavailable" | "stale" | "stillPresent" | null;
export type VisitorDetails = {
  food:string; diet:string; access:string; rooming:string;
  foodAnswer?:string; dietAnswer?:string; accessAnswer?:string;
  signer:string; relationship:"self"|"guardian"|"representative"; permissionDate:string;
  noticeVersion:string; intakeSource:string; recorder:string;
};
export type ChurchVisitor = {
  id:string; visit_id:string; first_name:string; last_name:string; date_of_birth:string;
  gender_group:"female"|"male"; visitor_role:"student"|"adult"|"leader";
  contact:string; emergency_name:string; emergency_phone:string; details:VisitorDetails;
  source:"online"|"desk"; withdrawn_at:string|null; revision:number;
  arrived_at:string|null; departed_at:string|null; presence_revision:number;
};

export function readVisitorField(form:FormData,key:string) {
  const value = form.get(key);
  return typeof value === "string" ? value.trim() : "";
}

// Called inside a transaction. The visit lock also serializes registration with cancellation.
export async function writeVisitor(tx:Database, form:FormData, mode:VisitorMode, today:string):Promise<VisitorResult> {
  const read = (key:string) => readVisitorField(form,key);
  const id = read("id"), visitId = read("visit");
  if (!visitIdPattern.test(id) || !visitIdPattern.test(visitId)) return "invalid";
  const visit = (await tx.query<{start:string;cancelled_at:string|null}>(
    "SELECT starts_at::date::text AS start,cancelled_at FROM church_visit WHERE id=$1 FOR UPDATE",[visitId],
  )).rows[0];
  if (!visit || visit.cancelled_at) return "closed";
  const previous = (await tx.query<ChurchVisitor>(
    "SELECT *,date_of_birth::text AS date_of_birth FROM church_visitor WHERE id=$1 FOR UPDATE",[id],
  )).rows[0];
  if (mode !== "edit" && previous) return previous.visit_id === visitId && previous.source === mode ? "received" : "invalid";
  if (mode === "edit" && (!previous || previous.visit_id !== visitId || previous.withdrawn_at || String(previous.revision) !== read("revision"))) return "stale";

  const first = read("first"), last = read("last"), birth = read("birth"), gender = read("gender"), role = read("role");
  const contact = read("contact"), emergencyName = read("emergencyName"), emergencyPhone = read("emergencyPhone");
  const currentAge = ageOn(birth,today), arrivalAge = ageOn(birth,visit.start);
  const bounded = (value:string,max:number) => value.length > 0 && value.length <= max;
  if (!bounded(first,100) || !bounded(last,100) || !dateParts(birth) || birth > today || currentAge === null || currentAge > 120 ||
      arrivalAge === null || arrivalAge < 0 || !["female","male"].includes(gender) || !["student","adult","leader"].includes(role) ||
      (role !== "student" && arrivalAge < 18) || !bounded(contact,200) || !bounded(emergencyName,160) || !bounded(emergencyPhone,80)) return "invalid";
  const food = read("food"), diet = read("diet"), access = read("access"), rooming = read("rooming");
  if ([food,diet,access,rooming].some(value => value.length > 1000)) return "invalid";
  const answers = {foodAnswer:read("foodAnswer"),dietAnswer:read("dietAnswer"),accessAnswer:read("accessAnswer")};
  for (const [field,detail] of [["foodAnswer",food],["dietAnswer",diet],["accessAnswer",access]] as const) {
    if (!["none","yes","unknown"].includes(answers[field]) || (answers[field] === "yes" && !detail)) return "invalid";
  }
  const recorder = mode === "online" ? "" : read("recorder");
  const reason = read("reason");
  if (mode !== "online" && !bounded(recorder,160)) return "invalid";
  if (mode === "edit" && !bounded(reason,1000)) return "invalid";

  let permission = previous?.details;
  if (mode !== "edit") {
    const signer = read("signer"), relationship = read("relationship"), intakeSource = mode === "desk" ? read("intakeSource") : "";
    if (!bounded(signer,160) || !["self","guardian","representative"].includes(relationship) || read("consent") !== "yes" ||
        (relationship === "self" && currentAge < 18) || (relationship === "guardian" && currentAge >= 18) ||
        (relationship === "representative" && read("sharingAuthority") !== "yes") ||
        (mode === "desk" && !bounded(intakeSource,1000))) return "invalid";
    permission = {food,diet,access,rooming,signer,relationship:relationship as VisitorDetails["relationship"],permissionDate:today,
      noticeVersion:visitNoticeVersion,intakeSource,recorder};
  }
  if (!permission || (permission.relationship === "self" && (ageOn(birth,permission.permissionDate) ?? -1) < 18)) return "invalid";
  const details = {...permission,...answers,food:answers.foodAnswer === "yes" ? food : "",
    diet:answers.dietAnswer === "yes" ? diet : "",access:answers.accessAnswer === "yes" ? access : "",rooming};
  const acknowledge = read("acknowledge") === "yes";
  const locale = read("locale") === "es" ? "es" : "en";
  const ackSource = mode === "online" ? "" : read("ackSource");
  if (acknowledge && (role !== "leader" || currentAge < 18 || (mode === "online" && permission.relationship !== "self") ||
      (mode !== "online" && !bounded(ackSource,1000)))) return "invalid";

  if (mode === "edit") {
    await tx.query(`INSERT INTO church_visitor_history(visitor_id,operation,recorded_by,reason,previous_record)
      VALUES($1,'edit',$2,$3,$4::jsonb)`,[id,recorder,reason,JSON.stringify(previous)]);
    await tx.query(`UPDATE church_visitor SET first_name=$2,last_name=$3,date_of_birth=$4,gender_group=$5,visitor_role=$6,
      contact=$7,emergency_name=$8,emergency_phone=$9,details=$10::jsonb,revision=revision+1 WHERE id=$1`,
      [id,first,last,birth,gender,role,contact,emergencyName,emergencyPhone,JSON.stringify(details)]);
  } else {
    await tx.query(`INSERT INTO church_visitor(id,visit_id,first_name,last_name,date_of_birth,gender_group,visitor_role,
      contact,emergency_name,emergency_phone,details,source) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb,$12)`,
      [id,visitId,first,last,birth,gender,role,contact,emergencyName,emergencyPhone,JSON.stringify(details),mode]);
  }
  if (acknowledge) {
    await tx.query(`INSERT INTO church_visit_acknowledgment(visit_id,visitor_id,leader_name,version,wording,language,source,evidence_source,recorded_by)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT(visitor_id,leader_name,version) DO NOTHING`,
      [visitId,id,first+" "+last,visitAcknowledgmentVersion,churchVisitorCopy[locale].acknowledgment,locale,
        mode === "online" ? "online" : "desk",ackSource || null,recorder || null]);
  }
  await tx.query(`UPDATE church_visit SET housing_revision=housing_revision+1,housing_published_at=NULL,
    itinerary_revision=itinerary_revision+CASE WHEN EXISTS(SELECT 1 FROM visit_budget_settings WHERE visit_id=$1 AND count_basis='registered') THEN 1 ELSE 0 END WHERE id=$1`,[visitId]);
  return mode === "edit" ? "saved" : "received";
}

export async function changeVisitorStatus(tx:Database,form:FormData):Promise<VisitorResult> {
  const read = (key:string) => readVisitorField(form,key);
  const id = read("id"), visitId = read("visit"), operation = read("operation");
  const actor = read("recorder"), reason = read("reason");
  if (!visitIdPattern.test(id) || !visitIdPattern.test(visitId) || !["withdraw","restore"].includes(operation) || !actor || actor.length > 160 || !reason || reason.length > 1000) return "invalid";
  const visit = (await tx.query<{cancelled_at:string|null}>("SELECT cancelled_at FROM church_visit WHERE id=$1 FOR UPDATE",[visitId])).rows[0];
  if (!visit || visit.cancelled_at) return "closed";
  const visitor = (await tx.query<ChurchVisitor>("SELECT * FROM church_visitor WHERE id=$1 AND visit_id=$2 FOR UPDATE",[id,visitId])).rows[0];
  if (!visitor) return "invalid";
  if (operation === "withdraw" && visitor.arrived_at && !visitor.departed_at) return "stillPresent";
  if ((operation === "withdraw") === Boolean(visitor.withdrawn_at)) return "saved";
  if (String(visitor.revision) !== read("revision")) return "stale";
  await tx.query(`INSERT INTO church_visitor_history(visitor_id,operation,recorded_by,reason,previous_record)
    VALUES($1,$2,$3,$4,$5::jsonb)`,[id,operation,actor,reason,JSON.stringify(visitor)]);
  await tx.query("UPDATE church_visitor SET withdrawn_at=CASE WHEN $2='withdraw' THEN CURRENT_TIMESTAMP ELSE NULL END,revision=revision+1 WHERE id=$1",[id,operation]);
  if (operation === "withdraw") {
    const placement = (await tx.query("SELECT visitor_id,dorm_id,supervisor,locked FROM visit_placement WHERE visitor_id=$1",[id])).rows;
    if (placement.length) await tx.query(`INSERT INTO church_housing_history(visit_id,visitor_id,operation,recorded_by,reason,previous_plan,resulting_plan)
      VALUES($1,$2,'withdraw',$3,$4,$5::jsonb,'[]'::jsonb)`,[visitId,id,actor,reason,JSON.stringify(placement)]);
    await tx.query("DELETE FROM visit_placement WHERE visitor_id=$1",[id]);
  }
  await tx.query(`UPDATE church_visit SET housing_revision=housing_revision+1,housing_published_at=NULL,
    itinerary_revision=itinerary_revision+CASE WHEN EXISTS(SELECT 1 FROM visit_budget_settings WHERE visit_id=$1 AND count_basis='registered') THEN 1 ELSE 0 END WHERE id=$1`,[visitId]);
  return "saved";
}
