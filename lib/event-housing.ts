import type { Database } from "./database.ts";
import { eventUuid } from "./event-registration.ts";
import { integer } from "./housing.ts";
import { lockFacilityRooms,roomConflict } from "./facilities.ts";

export type EventRoom={id:number;name:string;building:string;beds:number;active:boolean;needs_cleaning:boolean;eligible:boolean;notes:string};
export type EventPerson={id:string;first_name:string;last_name:string;place_status:string;rooming:string|null;church:string|null;rooming_code:string|null;accessibility:string|null};
export type EventPlacement={attendee_id:string;dorm_id:number;supervisor:boolean;locked:boolean;requests_reviewed:boolean};
export type EventHousing={event:{id:string;name:string;start:string;end:string;turnover_minutes:number;supervisor_required:boolean;cancelled_at:string|null;housing_revision:number;housing_published_at:string|null};rooms:EventRoom[];people:EventPerson[];placements:EventPlacement[]};
export type EventHousingStatus="saved"|"invalid"|"closed"|"stale"|"capacity"|"roomUnavailable"|"reviewNeeded"|"conflict"|"unavailable";
export type EventHousingResult={status:EventHousingStatus;detail?:string};
export type EventHousingIssue={status:"unassigned"|"roomUnavailable"|"capacity"|"cleaning"|"supervision"|"requests"|"splitGroup";person?:string;room?:number};

export async function getEventHousing(db:Database,id:string):Promise<EventHousing|null> {
  const event=(await db.query<EventHousing["event"]>(`SELECT id,name,to_char(starts_at,'YYYY-MM-DD"T"HH24:MI') AS start,
    to_char(ends_at,'YYYY-MM-DD"T"HH24:MI') AS end,turnover_minutes,supervisor_required,cancelled_at::text AS cancelled_at,
    housing_revision,housing_published_at::text AS housing_published_at FROM special_event WHERE id=$1`,[id])).rows[0];
  if(!event)return null;
  const [rooms,people,placements]=await Promise.all([
    db.query<EventRoom>(`SELECT d.id,d.name,b.name AS building,COALESCE(d.default_usable_beds,d.physical_beds) AS beds,d.active,d.needs_cleaning,
      COALESCE(p.eligible,true) AS eligible,COALESCE(p.notes,'') AS notes FROM event_room_reservation r
      JOIN dorm d ON d.id=r.dorm_id JOIN building b ON b.id=d.building_id
      LEFT JOIN event_room_plan p ON p.event_id=r.event_id AND p.dorm_id=r.dorm_id WHERE r.event_id=$1 ORDER BY b.name,d.id`,[id]).then(r=>r.rows),
    db.query<EventPerson>(`SELECT id,first_name,last_name,place_status,rooming,church,rooming_code,accessibility FROM event_attendee
      WHERE event_id=$1 AND attendance='overnight' AND place_status<>'released' ORDER BY (place_status='confirmed') DESC,lower(last_name),lower(first_name),id`,[id]).then(r=>r.rows),
    db.query<EventPlacement>("SELECT attendee_id,dorm_id,supervisor,locked,requests_reviewed FROM event_placement WHERE event_id=$1 ORDER BY attendee_id",[id]).then(r=>r.rows),
  ]);
  return {event,rooms,people,placements};
}

export function eventRoomingKey(person:EventPerson) {
  if(person.rooming==="group" && person.rooming_code)return "group:"+person.rooming_code.trim().toUpperCase();
  if(person.rooming==="church" && person.church)return "church:"+person.church.trim().toLowerCase();
  return "person:"+person.id;
}

export function eventHousingIssues(plan:EventHousing):EventHousingIssue[] {
  const issues:EventHousingIssue[]=[];
  for(const person of plan.people){
    const placement=plan.placements.find(p=>p.attendee_id===person.id);
    if(!placement){issues.push({status:"unassigned",person:person.id});continue;}
    const room=plan.rooms.find(r=>r.id===placement.dorm_id);
    if(!room || !room.active || !room.eligible)issues.push({status:"roomUnavailable",person:person.id});
    if(person.accessibility && !placement.requests_reviewed)issues.push({status:"requests",person:person.id});
    if(person.rooming!=="none"){
      const group=plan.people.filter(p=>eventRoomingKey(p)===eventRoomingKey(person));
      if(group.some(p=>!plan.placements.some(a=>a.attendee_id===p.id && a.dorm_id===placement.dorm_id)) && !placement.requests_reviewed)
        issues.push({status:"splitGroup",person:person.id});
    }
  }
  for(const room of plan.rooms){
    const occupants=plan.placements.filter(p=>p.dorm_id===room.id && plan.people.some(person=>person.id===p.attendee_id));
    if(!occupants.length)continue;
    if(occupants.length>room.beds)issues.push({status:"capacity",room:room.id});
    if(room.needs_cleaning)issues.push({status:"cleaning",room:room.id});
    if(plan.event.supervisor_required && !occupants.some(p=>p.supervisor))issues.push({status:"supervision",room:room.id});
  }
  return issues;
}

export function suggestEventHousing(plan:EventHousing):EventPlacement[]{
  const result=plan.placements.filter(p=>p.locked && plan.people.some(person=>person.id===p.attendee_id)).map(p=>({...p}));
  const groups=new Map<string,EventPerson[]>();
  for(const person of plan.people){const key=eventRoomingKey(person);groups.set(key,[...(groups.get(key)??[]),person]);}
  const ordered=[...groups.entries()].sort(([a,pa],[b,pb])=>Number(b.startsWith("group:"))-Number(a.startsWith("group:")) ||
    Number(pb.some(p=>p.place_status==="confirmed"))-Number(pa.some(p=>p.place_status==="confirmed")) || pb.length-pa.length || a.localeCompare(b));
  for(const [,group]of ordered){
    const remaining=group.filter(person=>!result.some(p=>p.attendee_id===person.id));
    if(!remaining.length)continue;
    const anchored=[...new Set(result.filter(p=>group.some(person=>person.id===p.attendee_id)).map(p=>p.dorm_id))];
    if(anchored.length>1)continue;
    const candidates=plan.rooms.filter(room=>room.active && room.eligible && (!anchored.length || anchored[0]===room.id) &&
      room.beds-result.filter(p=>p.dorm_id===room.id).length>=remaining.length)
      .sort((a,b)=>Number(a.needs_cleaning)-Number(b.needs_cleaning)||a.beds-b.beds||a.id-b.id);
    if(!candidates[0])continue;
    for(const person of remaining)result.push({attendee_id:person.id,dorm_id:candidates[0].id,supervisor:false,locked:false,requests_reviewed:false});
  }
  return result;
}

export async function releaseEventHousing(tx:Database,event:string,person:string,actor:string,reason:string){
  const placements=(await tx.query<EventPlacement>("SELECT attendee_id,dorm_id,supervisor,locked,requests_reviewed FROM event_placement WHERE event_id=$1 AND attendee_id=$2",[event,person])).rows;
  if(!placements.length)return;
  await tx.query("DELETE FROM event_placement WHERE event_id=$1 AND attendee_id=$2",[event,person]);
  await tx.query(`INSERT INTO event_housing_history(event_id,operation,recorded_by,reason,previous_plan,resulting_plan) VALUES($1,'release',$2,$3,$4::jsonb,'[]'::jsonb)`,[event,actor,reason,JSON.stringify(placements)]);
}

export async function saveEventHousing(tx:Database,form:FormData):Promise<EventHousingResult>{
  const read=(key:string)=>typeof form.get(key)==="string" ? String(form.get(key)).trim() : "";
  const id=read("event"),operation=read("operation"),actor=read("actor"),reason=read("reason");
  if(!eventUuid.test(id)||!actor||actor.length>160||!reason||reason.length>1000||!["configure","generate","place","publish"].includes(operation))return {status:"invalid"};
  const event=(await tx.query<{housing_revision:number;cancelled_at:string|null}>("SELECT housing_revision,cancelled_at FROM special_event WHERE id=$1 FOR UPDATE",[id])).rows[0];
  if(!event || event.cancelled_at)return {status:"closed"};
  if(String(event.housing_revision)!==read("revision"))return {status:"stale"};
  const reserved=(await tx.query<{dorm_id:number}>("SELECT dorm_id FROM event_room_reservation WHERE event_id=$1",[id])).rows.map(r=>r.dorm_id);
  await lockFacilityRooms(tx,reserved);
  const before=(await getEventHousing(tx,id))!;
  const conflict=await roomConflict(tx,reserved,before.event.start,before.event.end,before.event.turnover_minutes,id,true);
  if(conflict)return {status:"conflict",detail:conflict.room+" · "+conflict.booking};
  let next=before.placements.filter(p=>before.people.some(person=>person.id===p.attendee_id));
  if(operation==="configure"){
    const room=integer(form.get("room"),1,2147483647),notes=read("notes");
    if(!before.rooms.some(r=>r.id===room)||notes.length>2000)return {status:"invalid"};
    await tx.query(`INSERT INTO event_room_plan(event_id,dorm_id,eligible,notes) VALUES($1,$2,$3,$4) ON CONFLICT(event_id,dorm_id) DO UPDATE SET eligible=excluded.eligible,notes=excluded.notes`,[id,room,form.has("eligible"),notes]);
  }else if(operation==="place"){
    const person=before.people.find(p=>p.id===read("attendee"));
    if(!person)return {status:"invalid"};
    const roomId=read("room") ? integer(form.get("room"),1,2147483647) : null;
    if(read("room") && roomId===null)return {status:"invalid"};
    next=next.filter(p=>p.attendee_id!==person.id);
    if(roomId!==null){
      const room=before.rooms.find(r=>r.id===roomId);
      if(!room || !room.active || !room.eligible)return {status:"roomUnavailable"};
      if(next.filter(p=>p.dorm_id===roomId).length>=room.beds)return {status:"capacity"};
      next.push({attendee_id:person.id,dorm_id:roomId,supervisor:form.has("supervisor"),locked:form.has("locked"),requests_reviewed:form.has("requestsReviewed")});
    }
  }else if(operation==="generate")next=suggestEventHousing(before);
  else if(!before.people.length || eventHousingIssues(before).length)return {status:"reviewNeeded"};
  if(operation==="place"||operation==="generate"){
    await tx.query("DELETE FROM event_placement WHERE event_id=$1",[id]);
    for(const p of next)await tx.query("INSERT INTO event_placement(attendee_id,event_id,dorm_id,supervisor,locked,requests_reviewed) VALUES($1,$2,$3,$4,$5,$6)",[p.attendee_id,id,p.dorm_id,p.supervisor,p.locked,p.requests_reviewed]);
  }
  await tx.query("UPDATE special_event SET housing_revision=housing_revision+1,housing_published_at=CASE WHEN $2='publish' THEN CURRENT_TIMESTAMP ELSE NULL END WHERE id=$1",[id,operation]);
  const after=(await getEventHousing(tx,id))!;
  await tx.query("INSERT INTO event_housing_history(event_id,operation,recorded_by,reason,previous_plan,resulting_plan) VALUES($1,$2,$3,$4,$5::jsonb,$6::jsonb)",[id,operation,actor,reason,
    JSON.stringify({rooms:before.rooms,placements:before.placements}),JSON.stringify({rooms:after.rooms,placements:after.placements})]);
  return {status:"saved"};
}
