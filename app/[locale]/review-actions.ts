"use server";

import { randomUUID } from "node:crypto";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getDatabase } from "../../lib/database";
import { currentRole } from "../../lib/session";
import { dateParts, panamaDate } from "../../lib/registration";
import { allocatedCount, confirmedCount, finance, issueBatch, lockWeek, moneyCents, normalizeScholarshipCode, redeemCode, scholarshipDistributorRoles, seasonAllocatedCount } from "../../lib/review";

type Result = "saved" | "invalid" | "full" | "codeError" | "allocationExceeded" | "feeNeeded" | "exceptionNeeded" | "alreadyArrived" | "unavailable" | "seasonLimitError";
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function read(form: FormData, name: string) {
  const value = form.get(name);
  return typeof value === "string" ? value.trim() : "";
}

export async function reviewRegistration(form: FormData) {
  const role = await currentRole();
  const locale = read(form, "locale") === "en" ? "en" : "es";
  if (role !== "leadership" && role !== "registration") redirect("/" + locale);
  const id = read(form, "id");
  if (!uuid.test(id)) redirect("/" + locale + "/intake");
  const actor = read(form, "actor");
  const operation = read(form, "operation");
  const detail = read(form, "detail");
  let result: Result = "invalid";

  try {
    const db = await getDatabase();
    if (actor && actor.length <= 100 && detail.length <= 500) result = await db.transaction(async tx => {
      const { rows } = await tx.query<{ week_id: number }>("SELECT week_id FROM registration WHERE id=$1", [id]);
      if (!rows.length) return "invalid";
      const weekId = rows[0].week_id;
      const week = await lockWeek(tx, weekId);
      if (!week) return "invalid";
      const { rows: locked } = await tx.query<{ place_status: string; participation: string; fee_at_registration_cents:number|null }>(
        "SELECT place_status,participation,fee_at_registration_cents FROM registration WHERE id=$1 FOR UPDATE", [id],
      );
      if (!locked.length) return "invalid";
      const record = locked[0];
      const event = (type: string, note: string) => tx.query(
        "INSERT INTO registration_review_event(registration_id,event_type,recorded_by,detail) VALUES($1,$2,$3,$4)",
        [id,type,actor,note],
      );
      if (operation === "followup") {
        const needed = form.has("followupRequired");
        const date = needed ? read(form, "followup") : "";
        if (needed && (!detail || (date && !dateParts(date)))) return "invalid";
        await tx.query("UPDATE registration SET follow_up=$2,follow_up_reason=$3 WHERE id=$1",
          [id,date || null,needed ? detail : null]);
      } else if (operation === "permission") {
        const permission = read(form, "permission");
        if (!["pending","granted","declined"].includes(permission) || !detail) return "invalid";
        if (record.participation === permission) return "saved";
        await tx.query("UPDATE registration SET participation=$2 WHERE id=$1", [id,permission]);
        await event("permission", permission + ": " + detail);
      } else if (operation === "redeem") {
        const code = normalizeScholarshipCode(read(form, "code"));
        if (!code) return "codeError";
        const { rows: redeemed } = await tx.query("SELECT 1 FROM scholarship_code WHERE code=$1 AND registration_id=$2", [code,id]);
        if (!redeemed.length && !(await redeemCode(tx,weekId,id,code))) return "codeError";
      } else if (operation === "closeScholarship") {
        const closed = await tx.query(
          `UPDATE registration SET scholarship_reviewed_at=CURRENT_TIMESTAMP,scholarship_reviewed_by=$2
           WHERE id=$1 AND NULLIF(details->>'scholarship','') IS NOT NULL
             AND NOT EXISTS (SELECT 1 FROM scholarship_code WHERE registration_id=$1) RETURNING id`,[id,actor],
        );
        if (!closed.rows.length) return "invalid";
      } else if (operation === "payment") {
        const amount = moneyCents(read(form, "amount"));
        const reference = read(form, "reference");
        const paidOn = read(form,"paidOn");
        if (!amount || !reference || reference.length > 150 || (paidOn && (!dateParts(paidOn) || paidOn > panamaDate()))) return "invalid";
        const { rows: prior } = await tx.query<{ amount_cents: number; paid_on:string|null }>(
          "SELECT amount_cents,paid_on::text AS paid_on FROM registration_payment WHERE registration_id=$1 AND reference=$2",[id,reference],
        );
        if (prior.length) return prior[0].amount_cents === amount && prior[0].paid_on === (paidOn || null) ? "saved" : "invalid";
        await tx.query("INSERT INTO registration_payment(id,registration_id,amount_cents,reference,recorded_by,paid_on) VALUES($1,$2,$3,$4,$5,$6)",
          [randomUUID(),id,amount,reference,actor,paidOn || null]);
      } else if (operation === "confirm") {
        if (record.place_status === "confirmed") return "saved";
        if (!form.has("eligible")) return "invalid";
        if (await confirmedCount(tx,weekId) >= week.capacity) return "full";
        const fee = record.fee_at_registration_cents ?? week.fee_cents;
        if (fee === null) return "feeNeeded";
        const { paid, award } = await finance(tx,id);
        if (fee > paid + award && !detail) return "exceptionNeeded";
        await tx.query("UPDATE registration SET place_status='confirmed' WHERE id=$1",[id]);
        await event("confirmed",detail);
      } else if (operation === "release") {
        if (record.place_status === "released") return "saved";
        if (record.place_status !== "confirmed" || !detail) return "invalid";
        if ((await tx.query("SELECT 1 FROM camper_arrival WHERE registration_id=$1 AND voided_at IS NULL",[id])).rows.length) return "alreadyArrived";
        await tx.query("UPDATE registration SET place_status='released' WHERE id=$1",[id]);
        await event("released",detail);
      } else return "invalid";
      return "saved";
    });
  } catch {
    result = "unavailable";
  }
  revalidatePath("/[locale]/intake", "page");
  const from = read(form,"from").slice(0,500);
  redirect("/" + locale + "/intake/" + id + "?" + new URLSearchParams(from ? { status:result, from } : { status:result }));
}

export async function manageScholarships(form: FormData) {
  const role = await currentRole();
  const locale = read(form, "locale") === "en" ? "en" : "es";
  if (role !== "leadership" && role !== "registration") redirect("/" + locale);
  const weekId = Number(read(form,"week"));
  const operation = read(form,"operation");
  const seasonScope = read(form,"scope") === "season";
  let issuedBatch: string | undefined;
  let result: Result = "invalid";
  try {
    const db = await getDatabase();
    if (Number.isInteger(weekId) && weekId > 0 && weekId <= 2147483647) result = await db.transaction(async tx => {
      const week = await lockWeek(tx,weekId);
      if (!week) return "invalid";
      const season = seasonScope ? week.season_year : null;
      if (seasonScope && !season) return "invalid";
      if (operation !== "issue" && operation !== "seasonLimit") return "invalid";
      const rawLimit = read(form,"limit"), newLimit = Number(rawLimit);
      if (operation === "seasonLimit" && (role !== "leadership" || !season || !/^\d{1,5}$/.test(rawLimit) || newLimit > 10000)) return "invalid";
      let limit = week.award_limit;
      if (season) {
        if (operation === "seasonLimit") {
          await tx.query("INSERT INTO scholarship_season(year) VALUES($1) ON CONFLICT DO NOTHING",[season]);
        }
        limit = (await tx.query<{award_limit:number}>(
          "SELECT award_limit FROM scholarship_season WHERE year=$1 FOR UPDATE",[season],
        )).rows[0]?.award_limit ?? 0;
      }
      const allocated = season ? await seasonAllocatedCount(tx,season) : await allocatedCount(tx,weekId);
      if (operation === "seasonLimit") {
        if (newLimit < allocated) return "seasonLimitError";
        await tx.query("UPDATE scholarship_season SET award_limit=$2 WHERE year=$1",[season,newLimit]);
      } else {
        const batchId = read(form,"batchId");
        const count = read(form,"count");
        const value = moneyCents(read(form,"value"));
        const actor = read(form,"actor");
        const distributor = read(form,"distributor");
        const distributorRole = read(form,"distributorRole");
        const email = read(form,"email"), instructions = read(form,"instructions");
        if (!uuid.test(batchId) || !/^\d{1,3}$/.test(count) || Number(count) < 1 || !value || !actor || actor.length > 100 ||
            !distributor || distributor.length > 100 || !scholarshipDistributorRoles.some(role => role === distributorRole) || instructions.length > 1000 ||
            (email && (email.length > 254 || !/^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/.test(email)))) return "invalid";
        const prior = await tx.query("SELECT 1 FROM scholarship_batch WHERE id=$1 AND (week_id=$2 OR season_year=$3)",
          [batchId,season ? null : weekId,season]);
        if (!prior.rows.length) {
          if (allocated + Number(count) > limit) return "allocationExceeded";
          await issueBatch(tx,{id:batchId,week:season ? null : weekId,season,distributor,distributorRole,actor,
            count:Number(count),value,email,instructions});
        }
        issuedBatch = batchId;
      }
      return "saved";
    });
  } catch {
    result = "unavailable";
  }
  revalidatePath("/[locale]/intake", "page");
  const query = new URLSearchParams({status:result});
  if (Number.isInteger(weekId) && weekId > 0) query.set("week",String(weekId));
  if (seasonScope) query.set("scope","season");
  if (result === "saved" && issuedBatch) query.set("batch",issuedBatch);
  redirect("/"+locale+"/intake/scholarships?"+query+(result === "saved" && issuedBatch ? "#batch-"+issuedBatch : ""));
}
