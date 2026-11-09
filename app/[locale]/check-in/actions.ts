"use server";

import { redirect } from "next/navigation";
import { getDatabase } from "../../../lib/database";
import { ageOn, panamaDate } from "../../../lib/registration";
import { lockWeek } from "../../../lib/review";
import { placementOptions } from "../../../lib/check-in";
import { currentRole } from "../../../lib/session";

type Result = "saved"|"invalid"|"unavailable"|"noLonger"|"reasonRequired"|"noPlace"|"departureRecorded"|"placementNeedsConfirmation"|"stale";

function value(form:FormData,key:string) {
  const item = form.get(key);
  return typeof item === "string" ? item.trim() : "";
}

export async function recordCheckIn(form:FormData) {
  const locale = value(form,"locale") === "en" ? "en" : "es";
  const base = "/"+locale+"/check-in";
  const role = await currentRole();
  if (role !== "leadership" && role !== "registration") redirect("/"+locale);
  const id = value(form,"camper");
  const week = Number(value(form,"week"));
  const actor = value(form,"actor");
  const operation = value(form,"operation");
  const query = new URLSearchParams();
  if (Number.isSafeInteger(week) && week > 0) query.set("week",String(week));
  if (/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(id)) query.set("camper",id);
  for (const key of ["q","stop"]) {
    const item = value(form,key);
    if (item) query.set(key,item.slice(0,100));
  }
  let result:Result = "invalid";
  if (query.has("camper") && week > 0 && week <= 2147483647 && Number.isInteger(week) && actor && actor.length <= 100) {
    try {
      const db = await getDatabase();
      result = await db.transaction(async tx => {
        if (!(await lockWeek(tx,week))) return "invalid";
        const { rows } = await tx.query<{place_status:string;group:string;birth:string;age_on:string|null}>(
          `SELECT r.place_status,r.gender_group AS "group",r.date_of_birth::text AS birth,w.starts_on::text AS age_on
           FROM registration r JOIN camp_week w ON w.id=r.week_id WHERE r.id=$1 AND r.week_id=$2 FOR UPDATE OF r`,[id,week],
        );
        const record = rows[0];
        if (!record || record.place_status === "released") return "invalid";
        if (operation === "undoArrival" || operation === "correctArrival") {
          const current = (await tx.query<{revision:number}>(
            "SELECT revision FROM camper_arrival WHERE registration_id=$1 AND voided_at IS NULL",[id],
          )).rows[0];
          if (!current) return operation === "undoArrival" ? "saved" : "invalid";
          if (value(form,"revision") !== String(current.revision)) return "stale";
        }
        if (operation === "undoArrival") {
          const reason = value(form,"reason");
          if (!reason || reason.length > 500) return "invalid";
          if ((await tx.query("SELECT 1 FROM camper_departure WHERE registration_id=$1",[id])).rows.length) return "departureRecorded";
          if ((await tx.query("SELECT 1 FROM camper_placement WHERE registration_id=$1",[id])).rows.length && !form.has("removePlacement")) return "placementNeedsConfirmation";
          await tx.query(
            `INSERT INTO camper_operation_correction(registration_id,operation,reason,recorded_by,previous_record)
             SELECT a.registration_id,'undoArrival',$2,$3,jsonb_build_object('arrival',to_jsonb(a),'placement',to_jsonb(p))
             FROM camper_arrival a LEFT JOIN camper_placement p ON p.registration_id=a.registration_id
             WHERE a.registration_id=$1 AND a.voided_at IS NULL`,[id,reason,actor],
          );
          await tx.query("DELETE FROM camper_placement WHERE registration_id=$1",[id]);
          await tx.query("UPDATE camper_arrival SET voided_at=CURRENT_TIMESTAMP,revision=revision+1 WHERE registration_id=$1 AND voided_at IS NULL",[id]);
          return "saved";
        }
        if (operation === "arrive" || operation === "correctArrival") {
          const method = value(form,"method"), bus = value(form,"bus");
          if ((method !== "bus" && method !== "own") || (method === "bus" && (!bus || bus.length > 100))) return "invalid";
          if (operation === "correctArrival") {
            const reason = value(form,"reason");
            if (!reason || reason.length > 500) return "invalid";
            const result = await tx.query(
              `INSERT INTO camper_operation_correction(registration_id,operation,reason,recorded_by,previous_record)
               SELECT registration_id,'correctArrival',$2,$3,to_jsonb(a) FROM camper_arrival a
               WHERE registration_id=$1 AND voided_at IS NULL
               AND (arrival_method IS DISTINCT FROM $4 OR actual_bus IS DISTINCT FROM $5) RETURNING id`,
              [id,reason,actor,method,method === "bus" ? bus : null],
            );
            if (result.rows.length) await tx.query("UPDATE camper_arrival SET arrival_method=$2,actual_bus=$3,revision=revision+1 WHERE registration_id=$1",
              [id,method,method === "bus" ? bus : null]);
            return result.rows.length || (await tx.query("SELECT 1 FROM camper_arrival WHERE registration_id=$1 AND voided_at IS NULL",[id])).rows.length ? "saved" : "invalid";
          }
          await tx.query(
            "INSERT INTO camper_arrival(registration_id,arrival_method,actual_bus,recorded_by) VALUES($1,$2,$3,$4) ON CONFLICT(registration_id) DO UPDATE SET arrival_method=excluded.arrival_method,actual_bus=excluded.actual_bus,recorded_by=excluded.recorded_by,arrived_at=CURRENT_TIMESTAMP,voided_at=NULL,revision=camper_arrival.revision+1 WHERE camper_arrival.voided_at IS NOT NULL",
            [id,method,method === "bus" ? bus : null,actor],
          );
          return "saved";
        }
        if (operation !== "place") return "invalid";
        if (record.place_status !== "confirmed") return "noPlace";
        const { rows: arrived } = await tx.query("SELECT 1 FROM camper_arrival WHERE registration_id=$1 AND voided_at IS NULL",[id]);
        if (!arrived.length || (await tx.query("SELECT 1 FROM camper_departure WHERE registration_id=$1",[id])).rows.length) return "invalid";
        const dorm = Number(value(form,"dorm"));
        const reason = value(form,"reason");
        if (!Number.isInteger(dorm) || dorm < 1 || dorm > 2147483647 || reason.length > 500) return "invalid";
        const { rows: current } = await tx.query<{dorm_id:number}>("SELECT dorm_id FROM camper_placement WHERE registration_id=$1",[id]);
        const previous = current[0]?.dorm_id ?? null;
        if (previous === dorm) return "saved";
        await tx.query("SELECT id FROM dorm WHERE id=$1 FOR UPDATE",[dorm]);
        const age = ageOn(record.birth,record.age_on ?? panamaDate());
        const options = await placementOptions(tx,week,age,record.group,previous);
        if (!options.some(room => room.id === dorm)) return "noLonger";
        if ((previous !== null || options[0]?.id !== dorm) && !reason) return "reasonRequired";
        await tx.query(
          "INSERT INTO camper_placement(registration_id,week_id,dorm_id) VALUES($1,$2,$3) ON CONFLICT(registration_id) DO UPDATE SET dorm_id=excluded.dorm_id",
          [id,week,dorm],
        );
        await tx.query(
          "INSERT INTO camper_placement_event(registration_id,week_id,dorm_id,recorded_by,reason) VALUES($1,$2,$3,$4,$5)",
          [id,week,dorm,actor,reason || null],
        );
        return "saved";
      });
    } catch {
      result = "unavailable";
    }
  }
  query.set("status",result);
  redirect(base+"?"+query);
}
