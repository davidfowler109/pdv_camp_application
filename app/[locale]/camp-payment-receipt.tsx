import { notFound } from "next/navigation";
import type { Locale } from "../../lib/copy";
import { campPaymentCopy } from "../../lib/camp-payment-copy";
import { getDatabase } from "../../lib/database";
import { formatMoney } from "../../lib/review-copy";

export async function CampPaymentReceipt({id,locale}:{id:string;locale:Locale}) {
  if (process.env.PDV_LOCAL_DEMO !== "1" ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) notFound();

  const db = await getDatabase();
  const receipt = (await db.query<{
    payment_reference:string;week:string;fee:number|null;paid:number;award:number;pending:boolean;
  }>(
    `SELECT r.payment_reference,w.name AS week,COALESCE(r.fee_at_registration_cents,w.fee_cents) AS fee,
       COALESCE((SELECT sum(amount_cents) FROM registration_payment WHERE registration_id=r.id),0)::float8 AS paid,
       COALESCE(c.value_cents,0) AS award,
       (c.code IS NULL AND NULLIF(r.details->>'scholarship','') IS NOT NULL AND r.scholarship_reviewed_at IS NULL) AS pending
     FROM registration r JOIN camp_week w ON w.id=r.week_id
     LEFT JOIN scholarship_code c ON c.registration_id=r.id
     WHERE r.id=$1 AND r.intake_channel='online'`,[id],
  )).rows[0];
  if (!receipt) notFound();

  const t = campPaymentCopy[locale];
  const due = receipt.fee === null ? null : Math.max(0,receipt.fee-receipt.paid-receipt.award);
  const account = process.env.PDV_BANK_ACCOUNT_NUMBER?.trim() || "XX-XX-XX-XXXXXX-X";
  return <>
    <h1>{t.received}</h1>
    <p>{receipt.week} · {t.receivedHelp}</p>
    <section className="card">
      <p>{t.registrationReference} <strong><code>{receipt.payment_reference}</code></strong></p>
      {receipt.pending ? <p className="notice">{t.scholarshipPending}</p>
        : due === null ? <p>{t.feePending}</p>
        : <p>{t.balance} <strong>{formatMoney(due,locale)}</strong>{due === 0 && <> · {t.settled}</>}</p>}
    </section>
    {!receipt.pending && due !== null && due > 0 && <section className="card">
      <h2>{t.transfer}</h2>
      <p className="notice">{t.example}</p>
      <p><strong>Banco General</strong><br />{t.accountType}<br />Palabra de Vida Panama<br /><code>{account}</code></p>
      <p>{t.yappy}</p>
      <p>{t.memo}</p>
      <p>{t.matching}</p>
    </section>}
    <p>{t.keep}</p>
  </>;
}
