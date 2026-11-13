import type { Database } from "./database.ts";
import { lockFacilityRooms, roomConflict, validFacilityTime } from "./facilities.ts";
import { integer } from "./housing.ts";

export type VisitSaveResult = {
  status: "saved" | "invalid" | "dateError" | "countError" | "contactError" | "roomUnavailable" | "housingInUse" | "visitorsPresent" | "conflict" | "unavailable" | "stale";
  detail?: string;
};

export const visitIdPattern = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;

// The caller supplies a transaction so a visit and its room reservations save together.
export async function writeChurchVisit(tx: Database, form: FormData): Promise<VisitSaveResult> {
  const read = (key: string) => String(form.get(key) ?? "").trim();
  const id = read("id"), operation = read("operation");
  if (!visitIdPattern.test(id) || !["create", "edit", "cancel"].includes(operation)) return {status:"invalid"};
  const existing = (await tx.query<{cancelled_at: Date|null}>(
    "SELECT cancelled_at FROM church_visit WHERE id=$1 FOR UPDATE", [id],
  )).rows[0];
  if (operation !== "create" && !existing) return {status:"stale"};
  const previous = (await tx.query<{dorm_id: number}>(
    "SELECT dorm_id FROM visit_room_reservation WHERE visit_id=$1", [id],
  )).rows.map(room => room.dorm_id);
  if (operation === "cancel") {
    if ((await tx.query("SELECT id FROM church_visitor WHERE visit_id=$1 AND arrived_at IS NOT NULL AND departed_at IS NULL LIMIT 1",[id])).rows.length) return {status:"visitorsPresent"};
    await lockFacilityRooms(tx, previous);
    await tx.query("UPDATE church_visit SET cancelled_at=COALESCE(cancelled_at,CURRENT_TIMESTAMP) WHERE id=$1", [id]);
    return {status:"saved"};
  }
  if (existing?.cancelled_at) return {status:"stale"};
  if (operation === "create" && existing) return {status:"saved"};

  const name = read("name"), church = read("church"), purpose = read("purpose");
  const leader = read("leader"), email = read("email"), phone = read("phone");
  const start = read("start"), end = read("end");
  const students = integer(form.get("students"),0,1000);
  const adults = integer(form.get("adults"),0,1000);
  const leaders = integer(form.get("leaders"),0,1000);
  const turnover = integer(form.get("turnover"),0,10080);
  if (!name || name.length > 120 || !church || church.length > 160 || !purpose || purpose.length > 2000 || turnover === null) return {status:"invalid"};
  if (!leader || leader.length > 160 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254 || !phone || phone.length > 80) return {status:"contactError"};
  if (students === null || adults === null || leaders === null || students+adults+leaders < 1 || students+adults+leaders > 1000) return {status:"countError"};
  if (!validFacilityTime(start) || !validFacilityTime(end) || start >= end) return {status:"dateError"};
  const requested = [...new Set(form.getAll("room").map(value => integer(value,1,2147483647)))];
  const rooms = requested.filter((room): room is number => room !== null);
  if (rooms.length !== requested.length) return {status:"roomUnavailable"};
  const locked = await lockFacilityRooms(tx,[...new Set([...previous,...rooms])]);
  if (rooms.some(room => !locked.some(item => item.id === room && item.active))) return {status:"roomUnavailable"};
  const conflict = await roomConflict(tx,rooms,start,end,turnover,null,true,id);
  if (conflict) return {status:"conflict",detail:conflict.room+" · "+conflict.booking};
  if (existing && (await tx.query("SELECT visitor_id FROM visit_placement WHERE visit_id=$1 AND NOT (dorm_id=ANY($2::integer[])) LIMIT 1",[id,rooms])).rows.length) return {status:"housingInUse"};

  if (operation === "create") {
    const created = await tx.query(
      `INSERT INTO church_visit(id,name,church_name,purpose,leader_name,leader_email,leader_phone,starts_at,ends_at,
        turnover_minutes,expected_students,expected_adults,expected_leaders)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) ON CONFLICT(id) DO NOTHING RETURNING id`,
      [id,name,church,purpose,leader,email,phone,start,end,turnover,students,adults,leaders],
    );
    if (!created.rows.length) return {status:"saved"};
  } else {
    await tx.query(
      `UPDATE church_visit SET name=$2,church_name=$3,purpose=$4,leader_name=$5,leader_email=$6,leader_phone=$7,
        starts_at=$8,ends_at=$9,turnover_minutes=$10,expected_students=$11,expected_adults=$12,expected_leaders=$13,
        housing_revision=housing_revision+1,housing_published_at=NULL,itinerary_revision=itinerary_revision+1 WHERE id=$1`,
      [id,name,church,purpose,leader,email,phone,start,end,turnover,students,adults,leaders],
    );
  }
  await tx.query("DELETE FROM visit_room_reservation WHERE visit_id=$1 AND NOT (dorm_id=ANY($2::integer[]))", [id,rooms]);
  await tx.query("INSERT INTO visit_room_reservation(visit_id,dorm_id) SELECT $1,unnest($2::integer[]) ON CONFLICT DO NOTHING", [id,rooms]);
  return {status:"saved"};
}
