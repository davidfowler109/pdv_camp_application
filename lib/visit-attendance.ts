import { createHash } from "node:crypto";
import type { Database } from "./database.ts";
import { visitIdPattern } from "./church-visits.ts";
import { lockFacilityRooms } from "./facilities.ts";
import { canRecordAttendance, type AttendancePerson, type AttendanceOperation, type AttendanceResult } from "./visit-attendance-state.ts";

export async function recordVisitRoomUse(tx:Database,visit:string) {
  await tx.query(`INSERT INTO visit_room_use(visit_id,visitor_id,dorm_id)
    SELECT p.visit_id,p.visitor_id,p.dorm_id FROM visit_placement p JOIN church_visitor v ON v.id=p.visitor_id
    WHERE p.visit_id=$1 AND v.arrived_at IS NOT NULL AND v.departed_at IS NULL AND v.withdrawn_at IS NULL
    ON CONFLICT(visitor_id,dorm_id) DO UPDATE SET needs_turnover=true`,[visit]);
}

// Called with the affected dorm rows locked. Used rooms become dirty only after actual occupants leave.
export async function markVacatedVisitRooms(tx:Database,rooms:number[]) {
  if (!rooms.length) return;
  const used = (await tx.query<{dorm_id:number}>(
    "SELECT DISTINCT dorm_id FROM visit_room_use WHERE dorm_id=ANY($1::integer[]) AND needs_turnover",[rooms],
  )).rows;
  for (const {dorm_id:room} of used) {
    const present = (await tx.query(`SELECT 1 FROM visit_placement p JOIN church_visitor v ON v.id=p.visitor_id
      WHERE p.dorm_id=$1 AND v.arrived_at IS NOT NULL AND v.departed_at IS NULL AND v.withdrawn_at IS NULL LIMIT 1`,[room])).rows.length;
    if (present) continue;
    const campers = (await tx.query(`SELECT 1 FROM camper_placement p
      LEFT JOIN camper_departure d ON d.registration_id=p.registration_id
      LEFT JOIN return_bus b ON b.week_id=d.week_id AND b.bus_key=d.bus_key
      WHERE p.dorm_id=$1 AND (d.registration_id IS NULL OR (d.method='bus' AND b.departed_at IS NULL)) LIMIT 1`,[room])).rows.length;
    if (campers) continue;
    await tx.query("UPDATE dorm SET needs_cleaning=true,readiness_updated_at=CURRENT_TIMESTAMP WHERE id=$1",[room]);
    await tx.query("UPDATE visit_room_use SET needs_turnover=false WHERE dorm_id=$1 AND needs_turnover",[room]);
  }
}

export async function saveVisitAttendance(tx:Database,form:FormData):Promise<AttendanceResult> {
  const read = (key:string) => String(form.get(key) ?? "").trim();
  const visit = read("visit").toLowerCase(), batch = read("batch").toLowerCase(), actor = read("actor"), notes = read("notes");
  const operation = read("operation") as AttendanceOperation;
  const selection = form.getAll("visitor").map(value => typeof value === "string" ? value : "");
  if (!visitIdPattern.test(visit) || !visitIdPattern.test(batch) || !actor || actor.length>160 || notes.length>1000 ||
      !["arrive","depart","undoArrival","undoDeparture"].includes(operation) ||
      ((operation === "undoArrival" || operation === "undoDeparture") && !notes) || !selection.length || selection.length>1000) return {status:"invalid"};
  const revisions = new Map<string,string>();
  for (const value of selection) {
    const [rawId,revision,extra] = value.split(":");
    const id = rawId.toLowerCase();
    if (!visitIdPattern.test(id) || !/^\d{1,10}$/.test(revision ?? "") || extra !== undefined || revisions.has(id)) return {status:"invalid"};
    revisions.set(id,revision);
  }
  const signature = createHash("sha256").update(JSON.stringify({visit,operation,actor,notes,selection:[...revisions].map(([id,revision]) => id+":"+revision).sort()})).digest("hex");
  const current = (await tx.query<{cancelled_at:string|null}>("SELECT cancelled_at FROM church_visit WHERE id=$1 FOR UPDATE",[visit])).rows[0];
  if (!current) return {status:"closed"};
  const previousBatch = (await tx.query<{visit_id:string;request_signature:string;visitor_count:number}>(
    "SELECT visit_id,request_signature,visitor_count FROM visit_attendance_batch WHERE id=$1",[batch],
  )).rows[0];
  if (previousBatch) return previousBatch.visit_id === visit && previousBatch.request_signature === signature
    ? {status:"saved",count:previousBatch.visitor_count} : {status:"invalid"};
  if (current.cancelled_at) return {status:"closed"};
  const people = (await tx.query<AttendancePerson>(`SELECT id,arrived_at::text AS arrived_at,departed_at::text AS departed_at,
    withdrawn_at::text AS withdrawn_at,presence_revision FROM church_visitor WHERE visit_id=$1 AND id=ANY($2::uuid[]) ORDER BY id FOR UPDATE`,[visit,[...revisions.keys()]])).rows;
  if (people.length !== revisions.size) return {status:"invalid"};
  if (people.some(person => String(person.presence_revision) !== revisions.get(person.id))) return {status:"stale"};
  if (people.some(person => !canRecordAttendance(person,operation))) return {status:"wrongState"};
  const rooms = (await tx.query<{dorm_id:number}>(`SELECT dorm_id FROM visit_placement WHERE visitor_id=ANY($1::uuid[])
    UNION SELECT dorm_id FROM visit_room_use WHERE visitor_id=ANY($1::uuid[]) AND needs_turnover`,[[...revisions.keys()]])).rows.map(item => item.dorm_id);
  await lockFacilityRooms(tx,rooms);
  await tx.query(`INSERT INTO visit_attendance_batch(id,visit_id,operation,request_signature,recorded_by,notes,visitor_count)
    VALUES($1,$2,$3,$4,$5,$6,$7)`,[batch,visit,operation,signature,actor,notes,people.length]);
  const assignment = operation === "arrive" ? "arrived_at=CURRENT_TIMESTAMP" : operation === "depart" ? "departed_at=CURRENT_TIMESTAMP"
    : operation === "undoArrival" ? "arrived_at=NULL" : "departed_at=NULL";
  for (const person of people) {
    await tx.query("UPDATE church_visitor SET "+assignment+",presence_revision=presence_revision+1 WHERE id=$1",[person.id]);
    await tx.query(`INSERT INTO visit_attendance_event(batch_id,visitor_id,previous_arrival,previous_departure,resulting_arrival,resulting_departure)
      SELECT $1,id,$3::timestamptz,$4::timestamptz,arrived_at,departed_at FROM church_visitor WHERE id=$2`,[batch,person.id,person.arrived_at,person.departed_at]);
  }
  if (operation === "undoArrival") {
    await tx.query("DELETE FROM visit_room_use WHERE visitor_id=ANY($1::uuid[])",[[...revisions.keys()]]);
  } else {
    await recordVisitRoomUse(tx,visit);
    if (operation === "depart") await markVacatedVisitRooms(tx,rooms);
  }
  await tx.query("UPDATE church_visit SET housing_revision=housing_revision+1 WHERE id=$1",[visit]);
  return {status:"saved",count:people.length};
}
