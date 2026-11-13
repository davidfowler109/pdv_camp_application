import type { Database } from "./database.ts";
import { ageOn } from "./registration.ts";
import { integer } from "./housing.ts";
import { lockFacilityRooms, roomConflict } from "./facilities.ts";
import { visitIdPattern } from "./church-visits.ts";
import { markVacatedVisitRooms, recordVisitRoomUse } from "./visit-attendance.ts";

export type VisitHousingRoom = {
  id:number; name:string; building:string; beds:number; active:boolean; needs_cleaning:boolean; room_kind:"camper"|"hotel";
  gender_group:"female"|"male"|"mixed"|null; minimum_adults:number|null; allow_minors:boolean|null; supervision_notes:string|null;
};
export type VisitHousingPerson = {
  id:string; first_name:string; last_name:string; date_of_birth:string; gender_group:"female"|"male";
  visitor_role:"student"|"adult"|"leader"; rooming:string; accommodation:string;
  arrived_at:string|null; departed_at:string|null;
};
export type VisitPlacement = {visitor_id:string; dorm_id:number; supervisor:boolean; locked:boolean};
export type VisitHousingSnapshot = {
  visit:{id:string; name:string; start:string; end:string; start_day:string; turnover_minutes:number; cancelled_at:string|null; housing_revision:number; housing_published_at:string|null};
  rooms:VisitHousingRoom[]; people:VisitHousingPerson[]; placements:VisitPlacement[];
};
export type HousingIssue = {status:"unassigned"|"unconfigured"|"capacity"|"roomUnavailable"|"cleaning"|"groupMismatch"|"minorRoom"|"supervision"|"ageError"; room?:number; visitor?:string};
export type HousingResult = {status:"saved"|"invalid"|"closed"|"stale"|"unconfigured"|"roomUnavailable"|"capacity"|"groupMismatch"|"minorRoom"|"supervision"|"reviewNeeded"|"conflict"|"unavailable"; detail?:string};

export async function getVisitHousing(db:Database,id:string):Promise<VisitHousingSnapshot|null> {
  const visit = (await db.query<VisitHousingSnapshot["visit"]>(`SELECT id,name,
    to_char(starts_at,'YYYY-MM-DD"T"HH24:MI') AS start,to_char(ends_at,'YYYY-MM-DD"T"HH24:MI') AS end,
    starts_at::date::text AS start_day,turnover_minutes,cancelled_at::text AS cancelled_at,housing_revision,
    housing_published_at::text AS housing_published_at FROM church_visit WHERE id=$1`,[id])).rows[0];
  if (!visit) return null;
  const [rooms,people,placements] = await Promise.all([
    db.query<VisitHousingRoom>(`SELECT d.id,d.name,b.name AS building,COALESCE(d.default_usable_beds,d.physical_beds) AS beds,
      d.active,d.needs_cleaning,d.room_kind,p.gender_group,p.minimum_adults,p.allow_minors,p.supervision_notes
      FROM visit_room_reservation r JOIN dorm d ON d.id=r.dorm_id JOIN building b ON b.id=d.building_id
      LEFT JOIN visit_room_plan p ON p.visit_id=r.visit_id AND p.dorm_id=r.dorm_id
      WHERE r.visit_id=$1 ORDER BY b.name,d.id`,[id]).then(result => result.rows),
    db.query<VisitHousingPerson>(`SELECT id,first_name,last_name,date_of_birth::text AS date_of_birth,gender_group,visitor_role,
      arrived_at::text AS arrived_at,departed_at::text AS departed_at,
      COALESCE(details->>'rooming','') AS rooming,COALESCE(details->>'access','') AS accommodation
      FROM church_visitor WHERE visit_id=$1 AND withdrawn_at IS NULL ORDER BY lower(last_name),lower(first_name),id`,[id]).then(result => result.rows),
    db.query<VisitPlacement>("SELECT visitor_id,dorm_id,supervisor,locked FROM visit_placement WHERE visit_id=$1 ORDER BY visitor_id",[id]).then(result => result.rows),
  ]);
  return {visit,rooms,people,placements};
}

export function canUseVisitRoom(person:VisitHousingPerson,room:VisitHousingRoom,start:string) {
  if (!room.active || !room.gender_group) return false;
  if (room.gender_group !== "mixed" && room.gender_group !== person.gender_group) return false;
  const age = ageOn(person.date_of_birth,start) ?? -1;
  if (age < 0 || (person.visitor_role !== "student" && age < 18)) return false;
  return age >= 18 || room.allow_minors === true;
}

export function visitHousingIssues(snapshot:VisitHousingSnapshot):HousingIssue[] {
  const {people,rooms,placements,visit} = snapshot;
  const issues:HousingIssue[] = [];
  for (const person of people) {
    const age = ageOn(person.date_of_birth,visit.start_day) ?? -1;
    if (age < 0 || (person.visitor_role !== "student" && age < 18)) issues.push({status:"ageError",visitor:person.id});
    const placement = placements.find(item => item.visitor_id === person.id);
    if (!placement) { issues.push({status:"unassigned",visitor:person.id}); continue; }
    const room = rooms.find(item => item.id === placement.dorm_id);
    if (!room || !room.active) { issues.push({status:"roomUnavailable",visitor:person.id}); continue; }
    if (!room.gender_group) issues.push({status:"unconfigured",room:room.id});
    else if (room.gender_group !== "mixed" && room.gender_group !== person.gender_group) issues.push({status:"groupMismatch",visitor:person.id,room:room.id});
    if (age < 18 && !room.allow_minors) issues.push({status:"minorRoom",visitor:person.id,room:room.id});
    if (placement.supervisor && age < 18) issues.push({status:"supervision",visitor:person.id,room:room.id});
  }
  for (const room of rooms) {
    const occupants = placements.filter(item => item.dorm_id === room.id && people.some(person => person.id === item.visitor_id));
    if (!occupants.length) continue;
    if (occupants.length > room.beds) issues.push({status:"capacity",room:room.id});
    if (room.needs_cleaning) issues.push({status:"cleaning",room:room.id});
    const hasMinors = occupants.some(item => (ageOn(people.find(person => person.id === item.visitor_id)!.date_of_birth,visit.start_day) ?? -1) < 18);
    const supervisors = occupants.filter(item => item.supervisor && (ageOn(people.find(person => person.id === item.visitor_id)!.date_of_birth,visit.start_day) ?? -1) >= 18).length;
    if (hasMinors && (room.minimum_adults === null || supervisors < room.minimum_adults || !room.supervision_notes?.trim())) issues.push({status:"supervision",room:room.id});
    const present = occupants.filter(item => { const person = people.find(person => person.id === item.visitor_id)!; return person.arrived_at && !person.departed_at; });
    const presentMinors = present.some(item => (ageOn(people.find(person => person.id === item.visitor_id)!.date_of_birth,visit.start_day) ?? -1) < 18);
    if (presentMinors && present.filter(item => item.supervisor).length < (room.minimum_adults ?? 0)) issues.push({status:"supervision",room:room.id});
  }
  return issues;
}

export function suggestVisitHousing(snapshot:VisitHousingSnapshot):VisitPlacement[] {
  const {rooms,people,visit} = snapshot;
  const result = snapshot.placements.filter(item => people.some(person => person.id === item.visitor_id && (item.locked || person.arrived_at))).map(item => ({...item}));
  const remaining = people.filter(person => !result.some(item => item.visitor_id === person.id));
  const age = (person:VisitHousingPerson) => ageOn(person.date_of_birth,visit.start_day) ?? -1;
  const available = (room:VisitHousingRoom) => room.beds-result.filter(item => item.dorm_id === room.id).length;
  const roomValid = (room:VisitHousingRoom) => room.active && room.gender_group && available(room) > 0 &&
    result.filter(item => item.dorm_id === room.id).every(item => {
      const person = people.find(person => person.id === item.visitor_id)!;
      return canUseVisitRoom(person,room,visit.start_day) && (!item.supervisor || age(person) >= 18);
    });
  const place = (person:VisitHousingPerson,room:VisitHousingRoom,supervisor = false) => {
    result.push({visitor_id:person.id,dorm_id:room.id,supervisor,locked:false});
  };
  // Reserve resident supervisors before placing minors or filling adult hotel rooms.
  for (const room of rooms.filter(room => roomValid(room) && room.allow_minors && room.minimum_adults !== null && room.supervision_notes?.trim())) {
    const hasMinor = people.some(person => age(person) < 18 && canUseVisitRoom(person,room,visit.start_day) &&
      (!result.some(item => item.visitor_id === person.id) || result.some(item => item.visitor_id === person.id && item.dorm_id === room.id)));
    if (!hasMinor) continue;
    const supervisors = result.filter(item => item.dorm_id === room.id && item.supervisor).length;
    const needed = Math.max(0,room.minimum_adults!-supervisors);
    const candidates = remaining.filter(person => age(person) >= 18 && canUseVisitRoom(person,room,visit.start_day) && !result.some(item => item.visitor_id === person.id))
      .sort((a,b) => Number(b.visitor_role === "leader")-Number(a.visitor_role === "leader"));
    const minorAlreadyHere = result.some(item => item.dorm_id === room.id && age(people.find(person => person.id === item.visitor_id)!) < 18);
    if (candidates.length < needed || available(room) < needed+(minorAlreadyHere ? 0 : 1)) continue;
    for (const person of candidates.slice(0,needed)) place(person,room,true);
  }
  const ordered = [...remaining].sort((a,b) => Number(age(a) >= 18)-Number(age(b) >= 18));
  for (const person of ordered) {
    if (result.some(item => item.visitor_id === person.id)) continue;
    const eligible = rooms.filter(room => roomValid(room) && canUseVisitRoom(person,room,visit.start_day) && (age(person) >= 18 ||
      (room.minimum_adults !== null && room.supervision_notes?.trim() && result.filter(item => item.dorm_id === room.id && item.supervisor).length >= room.minimum_adults)));
    // Fill occupied rooms first, leaving larger empty rooms available for another group.
    eligible.sort((a,b) => Number(result.some(item => item.dorm_id === b.id))-Number(result.some(item => item.dorm_id === a.id)) || a.beds-b.beds || a.id-b.id);
    if (eligible[0]) place(person,eligible[0]);
  }
  return result;
}

export async function saveVisitHousing(tx:Database,form:FormData):Promise<HousingResult> {
  const read = (key:string) => String(form.get(key) ?? "").trim();
  const id = read("visit"), operation = read("operation"), actor = read("actor"), reason = read("reason");
  if (!visitIdPattern.test(id) || !actor || actor.length > 160 || !reason || reason.length > 1000 || !["configure","generate","place","publish"].includes(operation)) return {status:"invalid"};
  const visit = (await tx.query<{housing_revision:number;cancelled_at:string|null}>("SELECT housing_revision,cancelled_at FROM church_visit WHERE id=$1 FOR UPDATE",[id])).rows[0];
  if (!visit || visit.cancelled_at) return {status:"closed"};
  if (String(visit.housing_revision) !== read("revision")) return {status:"stale"};
  const reserved = (await tx.query<{dorm_id:number}>("SELECT dorm_id FROM visit_room_reservation WHERE visit_id=$1",[id])).rows.map(item => item.dorm_id);
  await lockFacilityRooms(tx,reserved);
  const snapshot = (await getVisitHousing(tx,id))!;
  if (operation !== "configure") {
    const conflict = await roomConflict(tx,reserved,snapshot.visit.start,snapshot.visit.end,snapshot.visit.turnover_minutes,null,true,id);
    if (conflict) return {status:"conflict",detail:conflict.room+" · "+conflict.booking};
  }
  const before = {rooms:snapshot.rooms.map(room => ({id:room.id,gender_group:room.gender_group,minimum_adults:room.minimum_adults,allow_minors:room.allow_minors,supervision_notes:room.supervision_notes})),placements:snapshot.placements};
  let next = snapshot.placements;
  if (operation === "configure") {
    const roomId = integer(form.get("room"),1,2147483647);
    const room = snapshot.rooms.find(room => room.id === roomId);
    const minimum = integer(form.get("minimumAdults"),0,1000), gender = read("gender"), notes = read("notes");
    if (!room || minimum === null || minimum > room.beds || !["female","male","mixed"].includes(gender) || notes.length > 2000) return {status:"invalid"};
    await tx.query(`INSERT INTO visit_room_plan(visit_id,dorm_id,gender_group,minimum_adults,allow_minors,supervision_notes)
      VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(visit_id,dorm_id) DO UPDATE SET gender_group=excluded.gender_group,
      minimum_adults=excluded.minimum_adults,allow_minors=excluded.allow_minors,supervision_notes=excluded.supervision_notes`,
      [id,roomId,gender,minimum,form.has("allowMinors"),notes]);
  } else if (operation === "place") {
    const visitor = snapshot.people.find(person => person.id === read("visitor"));
    if (!visitor) return {status:"invalid"};
    if (visitor.departed_at) return {status:"reviewNeeded"};
    const age = ageOn(visitor.date_of_birth,snapshot.visit.start_day) ?? -1;
    const roomId = read("room") ? integer(form.get("room"),1,2147483647) : null;
    if (read("room") && roomId === null) return {status:"invalid"};
    next = snapshot.placements.filter(item => item.visitor_id !== visitor.id);
    if (roomId !== null) {
      if (age < 0 || (visitor.visitor_role !== "student" && age < 18)) return {status:"invalid"};
      const room = snapshot.rooms.find(item => item.id === roomId);
      if (!room || !room.active || !room.gender_group) return {status:"roomUnavailable"};
      if (room.gender_group !== "mixed" && room.gender_group !== visitor.gender_group) return {status:"groupMismatch"};
      if ((ageOn(visitor.date_of_birth,snapshot.visit.start_day) ?? -1) < 18 && !room.allow_minors) return {status:"minorRoom"};
      if (next.filter(item => item.dorm_id === roomId).length >= room.beds) return {status:"capacity"};
      const supervisor = form.has("supervisor");
      if (supervisor && (ageOn(visitor.date_of_birth,snapshot.visit.start_day) ?? -1) < 18) return {status:"supervision"};
      next.push({visitor_id:visitor.id,dorm_id:roomId,supervisor,locked:form.has("locked")});
    }
  } else if (operation === "generate") {
    if (!snapshot.rooms.some(room => room.active && room.gender_group)) return {status:"unconfigured"};
    next = suggestVisitHousing(snapshot);
  } else {
    if (!snapshot.people.length || visitHousingIssues(snapshot).length) return {status:"reviewNeeded"};
  }
  if (operation === "place" || operation === "generate") {
    await tx.query("DELETE FROM visit_placement WHERE visit_id=$1",[id]);
    for (const placement of next) await tx.query(`INSERT INTO visit_placement(visitor_id,visit_id,dorm_id,supervisor,locked) VALUES($1,$2,$3,$4,$5)`,
      [placement.visitor_id,id,placement.dorm_id,placement.supervisor,placement.locked]);
    await recordVisitRoomUse(tx,id);
    await markVacatedVisitRooms(tx,reserved);
  }
  await tx.query("UPDATE church_visit SET housing_revision=housing_revision+1,housing_published_at=CASE WHEN $2='publish' THEN CURRENT_TIMESTAMP ELSE NULL END WHERE id=$1",[id,operation]);
  const updated = (await getVisitHousing(tx,id))!;
  await tx.query(`INSERT INTO church_housing_history(visit_id,visitor_id,operation,recorded_by,reason,previous_plan,resulting_plan)
    VALUES($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb)`,[id,operation === "place" ? read("visitor") : null,operation,actor,reason,
      JSON.stringify(before),JSON.stringify({rooms:updated.rooms.map(room => ({id:room.id,gender_group:room.gender_group,minimum_adults:room.minimum_adults,allow_minors:room.allow_minors,supervision_notes:room.supervision_notes})),placements:updated.placements})]);
  return {status:"saved"};
}
