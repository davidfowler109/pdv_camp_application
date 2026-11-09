import { randomBytes } from "node:crypto";
import type { Database } from "./database";

export const scholarshipDistributorRoles = ["pastor","staff","missionary"] as const;

export function moneyCents(input: string) {
  if (!/^\d{1,6}(?:[.,]\d{1,2})?$/.test(input)) return null;
  const [units, cents = ""] = input.split(/[.,]/);
  return Number(units) * 100 + Number(cents.padEnd(2, "0"));
}

export async function lockWeek(tx: Database, week: number) {
  const result = await tx.query<{ capacity: number; fee_cents: number | null; award_limit: number; season_year:number|null }>(
    "SELECT capacity,fee_cents,award_limit,EXTRACT(YEAR FROM starts_on)::integer AS season_year FROM camp_week WHERE id=$1 FOR UPDATE", [week],
  );
  return result.rows[0];
}

export async function confirmedCount(tx: Database, week: number) {
  const { rows } = await tx.query<{ count: number }>(
    "SELECT count(*)::integer AS count FROM registration WHERE week_id=$1 AND place_status='confirmed'", [week],
  );
  return rows[0].count;
}

export async function allocatedCount(tx: Database, week: number) {
  const { rows } = await tx.query<{ count: number }>(
    "SELECT count(*)::integer AS count FROM scholarship_code c JOIN scholarship_batch b ON b.id=c.batch_id WHERE b.week_id=$1", [week],
  );
  return rows[0].count;
}

export async function finance(tx: Database, id: string) {
  const { rows } = await tx.query<{ paid: number; award: number }>(
    `SELECT COALESCE((SELECT sum(amount_cents) FROM registration_payment WHERE registration_id=$1),0)::double precision AS paid,
      COALESCE((SELECT value_cents FROM scholarship_code WHERE registration_id=$1),0) AS award`, [id],
  );
  return rows[0];
}

export async function seasonAllocatedCount(tx: Database, year: number) {
  const { rows } = await tx.query<{count:number}>(
    "SELECT count(*)::integer AS count FROM scholarship_code c JOIN scholarship_batch b ON b.id=c.batch_id WHERE b.season_year=$1",[year],
  );
  return rows[0].count;
}

const codeAlphabet = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

export function normalizeScholarshipCode(input: string) {
  const code = input.trim().toUpperCase();
  return /^(?:[0-9A-HJKMNP-TV-Z]{8}|[A-F0-9]{16})$/.test(code) ? code : null;
}

export async function issueBatch(tx: Database, batch: {
  id:string; week:number|null; season:number|null; distributor:string; distributorRole:string; actor:string;
  count:number; value:number; email:string; instructions:string;
}) {
  await tx.query(
    `INSERT INTO scholarship_batch(id,week_id,season_year,distributor,distributor_role,issued_by,distributor_email,instructions)
     VALUES($1,$2,$3,$4,$5,$6,$7,$8)`,
    [batch.id,batch.week,batch.season,batch.distributor,batch.distributorRole,batch.actor,batch.email || null,batch.instructions || null],
  );
  let remaining = batch.count;
  for (let attempt = 0; remaining > 0 && attempt < 5; attempt++) {
    const codes = Array.from({length:remaining},()=>Array.from(randomBytes(8),byte=>codeAlphabet[byte & 31]).join(""));
    const result = await tx.query(
      `INSERT INTO scholarship_code(code,batch_id,value_cents) SELECT unnest($1::text[]),$2,$3
       ON CONFLICT(code) DO NOTHING RETURNING code`,[codes,batch.id,batch.value],
    );
    remaining -= result.rows.length;
  }
  if (remaining) throw new Error("Could not generate unique scholarship codes");
}

export async function redeemCode(tx: Database, week: number, id: string, code: string) {
  const { rows } = await tx.query(
    `UPDATE scholarship_code c SET registration_id=$1, redeemed_at=CURRENT_TIMESTAMP FROM scholarship_batch b
      WHERE c.batch_id=b.id AND c.code=$3 AND c.registration_id IS NULL
      AND (b.week_id=$2 OR b.season_year=(SELECT EXTRACT(YEAR FROM starts_on)::integer FROM camp_week WHERE id=$2))
      AND NOT EXISTS (SELECT 1 FROM scholarship_code WHERE registration_id=$1) RETURNING c.code`, [id,week,code],
  );
  return rows.length > 0;
}
