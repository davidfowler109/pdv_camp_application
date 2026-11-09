"use server";

import { redirect } from "next/navigation";
import { getDatabase } from "../../../lib/database";
import { ageOn, panamaDate } from "../../../lib/registration";
import { lockWeek } from "../../../lib/review";
import { currentRole } from "../../../lib/session";

function read(form:FormData,key:string) {
  const value = form.get(key);
  return typeof value === "string" ? value.trim() : "";
}
const uuid = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
type Status = "saved"|"invalid"|"unavailable"|"departed"|"leadership"|"stale";

export async function saveDeparture(form:FormData) {
  const locale = read(form,"locale") === "en" ? "en" : "es";
  const role = await currentRole();
  if (role !== "leadership" && role !== "registration") redirect("/"+locale);
  const week = Number(read(form,"week")), actor = read(form,"actor"), camper = read(form,"camper"), operation = read(form,"operation");
  const query = new URLSearchParams();
  const weekValid = Number.isInteger(week) && week > 0 && week <= 2147483647;
  const camperValid = uuid.test(camper);
  if (weekValid) query.set("week",String(week));
  if (camperValid) query.set("camper",camper);
  if (read(form,"q")) query.set("q",read(form,"q").slice(0,100));
  if (read(form,"open") === "yes") query.set("open","yes");
  let status:Status = "invalid";

  if (weekValid && actor && actor.length <= 100) {
    try {
      const db = await getDatabase();
      status = await db.transaction(async tx => {
        if (!(await lockWeek(tx,week))) return "invalid";
        const bus = read(form,"bus").replace(/\s+/g," ");
        const busKey = bus.toLowerCase();
        if (operation === "batchBus") {
          if (!bus || bus.length > 100 || read(form,"verified") !== "yes") return "invalid";
          const selected = [...new Set(form.getAll("selected").map(String))];
          const handoffs = [...new Set(form.getAll("handoff").map(String))];
          const snapshot = new Set(form.getAll("boarded").map(String));
          if (!selected.length || selected.length > 1000 || !selected.every(id => uuid.test(id)) ||
              handoffs.some(id => !selected.includes(id))) return "invalid";
          const existing = (await tx.query<{departed_at:Date|null}>(
            "SELECT departed_at FROM return_bus WHERE week_id=$1 AND bus_key=$2",[week,busKey],
          )).rows[0];
          if (existing?.departed_at) return "departed";
          const boarded = (await tx.query<{id:string;version:string}>(
            `SELECT registration_id AS id,recorded_at::text AS version FROM camper_departure
             WHERE week_id=$1 AND bus_key=$2`,[week,busKey],
          )).rows;
          if (boarded.length !== snapshot.size || boarded.some(row => !snapshot.has(row.id+"|"+row.version))) return "stale";

          const removed = boarded.filter(row => !selected.includes(row.id)).map(row => row.id);
          const added = selected.filter(id => !boarded.some(row => row.id === id));
          const reason = read(form,"note");
          if (removed.length && (!reason || reason.length > 500)) return "invalid";
          const eligible = (await tx.query<{id:string}>(
            `SELECT r.id FROM registration r JOIN camper_arrival a ON a.registration_id=r.id AND a.voided_at IS NULL
             LEFT JOIN camper_departure d ON d.registration_id=r.id
             WHERE r.week_id=$1 AND r.id=ANY($2::uuid[]) AND
               ((d.registration_id IS NULL AND r.details->>'departure'='bus') OR (d.method='bus' AND d.bus_key=$3))`,
            [week,selected,busKey],
          )).rows;
          if (eligible.length !== selected.length) return "stale";

          await tx.query("INSERT INTO return_bus(week_id,bus_key,name) VALUES($1,$2,$3) ON CONFLICT DO NOTHING",[week,busKey,bus]);
          if (removed.length) {
            await tx.query(
              `INSERT INTO camper_operation_correction(registration_id,operation,reason,recorded_by,previous_record)
               SELECT registration_id,'undoBoarding',$2,$3,to_jsonb(d) FROM camper_departure d WHERE registration_id=ANY($1::uuid[])`,
              [removed,reason,actor],
            );
            await tx.query("DELETE FROM camper_departure WHERE registration_id=ANY($1::uuid[])",[removed]);
          }
          await tx.query(
            `INSERT INTO camper_departure(registration_id,week_id,method,bus_key,handoff_required,recorded_by)
             SELECT id,$1,'bus',$2,id=ANY($4::uuid[]),$5 FROM unnest($3::uuid[]) AS campers(id)`,
            [week,busKey,added,handoffs,actor],
          );
          await tx.query("UPDATE return_bus SET departed_at=CURRENT_TIMESTAMP,departed_by=$3 WHERE week_id=$1 AND bus_key=$2",[week,busKey,actor]);
          return "saved";
        }
        if (operation === "departBus") {
          if (!bus || bus.length > 100) return "invalid";
          const result = await tx.query(
            `UPDATE return_bus SET departed_at=COALESCE(departed_at,CURRENT_TIMESTAMP),departed_by=COALESCE(departed_by,$3)
             WHERE week_id=$1 AND bus_key=$2 RETURNING bus_key`,[week,busKey,actor],
          );
          return result.rows.length ? "saved" : "invalid";
        }
        if (!camperValid) return "invalid";
        const { rows } = await tx.query<{pickup:string|null;birth:string;planned:string|null}>(
          `SELECT r.details->>'pickup' AS pickup,r.date_of_birth::text AS birth,r.details->>'departure' AS planned
           FROM registration r JOIN camper_arrival a ON a.registration_id=r.id AND a.voided_at IS NULL WHERE r.week_id=$1 AND r.id=$2`,[week,camper],
        );
        if (!rows.length) return "invalid";
        const prior = (await tx.query<{method:string;bus_key:string|null;pickup_name:string|null;handoff_at:Date|null; version:string}>(
          "SELECT method,bus_key,pickup_name,handoff_at,recorded_at::text AS version FROM camper_departure WHERE registration_id=$1",[camper],
        )).rows[0];
        const recipient = read(form,"recipient"), note = read(form,"note");
        if (recipient.length > 150 || note.length > 500) return "invalid";
        if (operation === "undoBoarding" || operation === "correctDeparture") {
          if (!prior) return "saved";
          if (read(form,"version") !== prior.version) return "stale";
          if (!note) return "invalid";
          const boarded = prior.method === "bus" && (await tx.query(
            "SELECT 1 FROM return_bus WHERE week_id=$1 AND bus_key=$2 AND departed_at IS NULL",[week,prior.bus_key],
          )).rows.length > 0;
          if (operation === "undoBoarding" && !boarded) return "departed";
          if (operation === "correctDeparture" && role !== "leadership") return "leadership";
          await tx.query(
            `INSERT INTO camper_operation_correction(registration_id,operation,reason,recorded_by,previous_record)
             SELECT registration_id,$2,$3,$4,to_jsonb(d) FROM camper_departure d WHERE registration_id=$1`,
            [camper,operation,note,actor],
          );
          await tx.query("DELETE FROM camper_departure WHERE registration_id=$1",[camper]);
          return "saved";
        }
        if (operation === "handoff") {
          if (!prior || prior.method !== "bus" || !recipient || !form.has("verified")) return "invalid";
          const result = await tx.query(
            `UPDATE camper_departure d SET handoff_at=COALESCE(d.handoff_at,CURRENT_TIMESTAMP),
               handoff_by=COALESCE(d.handoff_by,$2),pickup_name=COALESCE(d.pickup_name,$3),handoff_note=COALESCE(d.handoff_note,$4)
             FROM return_bus b WHERE d.registration_id=$1 AND d.week_id=b.week_id AND d.bus_key=b.bus_key
               AND d.handoff_required AND b.departed_at IS NOT NULL RETURNING d.registration_id`,[camper,actor,recipient,note || null],
          );
          return result.rows.length ? "saved" : "invalid";
        }
        if (operation === "board") {
          if (!bus || bus.length > 100) return "invalid";
          if (prior) return prior.method === "bus" && prior.bus_key === busKey ? "saved" : "invalid";
          await tx.query("INSERT INTO return_bus(week_id,bus_key,name) VALUES($1,$2,$3) ON CONFLICT DO NOTHING",[week,busKey,bus]);
          const result = await tx.query<{departed_at:Date|null}>("SELECT departed_at FROM return_bus WHERE week_id=$1 AND bus_key=$2",[week,busKey]);
          if (result.rows[0].departed_at) {
            if (role !== "leadership" || !(await tx.query(
              "SELECT 1 FROM camper_operation_correction WHERE registration_id=$1 AND operation='correctDeparture' LIMIT 1",[camper],
            )).rows.length) return "departed";
          }
          await tx.query(
            "INSERT INTO camper_departure(registration_id,week_id,method,bus_key,handoff_required,recorded_by) VALUES($1,$2,'bus',$3,$4,$5)",
            [camper,week,busKey,form.has("handoffRequired"),actor],
          );
          return "saved";
        }
        if (operation === "self") {
          if (!form.has("verified") || (ageOn(rows[0].birth,panamaDate()) ?? 0) < 18) return "invalid";
          if (prior) return prior.method === "self" ? "saved" : "invalid";
          await tx.query("INSERT INTO camper_departure(registration_id,week_id,method,handoff_at,handoff_by,recorded_by) VALUES($1,$2,'self',CURRENT_TIMESTAMP,$3,$3)",[camper,week,actor]);
          return "saved";
        }
        if (operation !== "pickup" || !recipient || !form.has("verified")) return "invalid";
        const method = read(form,"method");
        if (method !== "pickup" && method !== "home") return "invalid";
        if (prior) return prior.method === method && prior.pickup_name === recipient ? "saved" : "invalid";
        const normal = rows[0].planned === "own" && rows[0].pickup?.trim().toLowerCase() === recipient.toLowerCase();
        if (!normal || method === "home") {
          if (role !== "leadership") return "leadership";
          if (!note) return "invalid";
        }
        await tx.query(
          `INSERT INTO camper_departure(registration_id,week_id,method,pickup_name,handoff_note,handoff_at,handoff_by,recorded_by)
           VALUES($1,$2,$3,$4,$5,CURRENT_TIMESTAMP,$6,$6)`,[camper,week,method,recipient,note || null,actor],
        );
        return "saved";
      });
    } catch {
      status = "unavailable";
    }
  }
  query.set("status",status);
  redirect("/"+locale+"/departure?"+query);
}
