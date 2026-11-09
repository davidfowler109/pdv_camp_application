import type { ReactNode } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getDatabase } from "../../../../lib/database";
import { confirmedCount, finance } from "../../../../lib/review";
import { panamaDate } from "../../../../lib/registration";
import { signedFormMaxFiles } from "../../../../lib/signed-form";
import { signedFormCopy } from "../../../../lib/signed-form-copy";
import { SignedFormUpload } from "../../signed-form-files";
import { campPaymentCopy } from "../../../../lib/camp-payment-copy";
import { registrationCopy } from "../../../../lib/registration-copy";
import { rosterCopy } from "../../../../lib/roster-copy";
import { formatMoney, reviewCopy } from "../../../../lib/review-copy";
import { reviewRegistration } from "../../review-actions";
import { FollowUpFields } from "./follow-up-fields";
import { requireReview, ReviewFrame } from "../review-frame";

type ReviewRow = {
  id:string; week_id:number; week:string; capacity:number; fee_cents:number|null; first_name:string; last_name:string;
  intake_channel:"online"|"paper"|"desk"; participation:"pending"|"granted"|"declined"; place_status:"pending"|"confirmed"|"released";
  photo_permission:"granted"|"declined"|null; payment_reference:string; scholarship_reviewed_at:Date|null;
  signed_form_expires_on:string; followup:string|null; follow_up_reason:string|null; signer_name:string; authorized:string; notice_version:string; details:Record<string,string>;
};

export default async function Page({ params, searchParams }: {
  params: Promise<{ locale:string; id:string }>; searchParams: Promise<{ status?:string; from?:string }>;
}) {
  const route = await params;
  const { locale } = await requireReview(route.locale);
  if (!/^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(route.id)) notFound();
  const { status, from } = await searchParams;
  const backQuery = typeof from === "string" ? new URLSearchParams(from.slice(0,500)).toString() : undefined;
  const db = await getDatabase();
  const { rows } = await db.query<ReviewRow>(
    `SELECT r.*,w.name AS week,w.capacity,COALESCE(r.fee_at_registration_cents,w.fee_cents) AS fee_cents,r.follow_up::text AS followup,r.authorized_on::text AS authorized,
       signed_form_expires_on(w.ends_on,r.received_at)::text AS signed_form_expires_on
       FROM registration r JOIN camp_week w ON w.id=r.week_id WHERE r.id=$1`, [route.id],
  );
  if (!rows.length) notFound();
  const r = rows[0], t = reviewCopy[locale];
  const registration = registrationCopy[locale];
  const attachment = signedFormCopy[locale], payment = campPaymentCopy[locale];
  const canAttach = r.intake_channel === "paper" && r.signed_form_expires_on > panamaDate();
  const [funds, confirmed, payments, events, attachments] = await Promise.all([
    finance(db,r.id), confirmedCount(db,r.week_id),
    db.query<{ id:string; amount_cents:number; reference:string; recorded_by:string; paid_on:string|null }>(
      "SELECT id,amount_cents,reference,recorded_by,paid_on::text AS paid_on FROM registration_payment WHERE registration_id=$1 ORDER BY recorded_at,id",[r.id]),
    db.query<{ id:string; event_type:"permission"|"confirmed"|"released"; recorded_by:string; detail:string; recorded_at:Date }>(
      "SELECT id,event_type,recorded_by,detail,recorded_at FROM registration_review_event WHERE registration_id=$1 ORDER BY id DESC",[r.id]),
    canAttach ? db.query<{id:string;uploaded_at:Date}>(
      "SELECT id,uploaded_at FROM registration_signed_form WHERE registration_id=$1 ORDER BY uploaded_at,id",[r.id],
    ).then(result=>result.rows) : [],
  ]);
  const money = (cents:number) => formatMoney(cents,locale);
  const balance = r.fee_cents === null ? null : Math.max(0,r.fee_cents - funds.paid - funds.award);
  const dateTime = new Intl.DateTimeFormat(locale, { dateStyle:"medium", timeStyle:"short", timeZone:"America/Panama" });
  const display = (value:string|undefined) => value || "—";
  function form(operation:string, label:string, content:ReactNode) {
    return <form action={reviewRegistration}>
      <input type="hidden" name="locale" value={locale} /><input type="hidden" name="id" value={r.id} />
      <input type="hidden" name="operation" value={operation} />
      {backQuery && <input type="hidden" name="from" value={backQuery} />}
      <div className="grid">{content}<label>{t.actor}<input name="actor" required maxLength={100} /></label></div>
      <button>{label}</button>
    </form>;
  }

  return <ReviewFrame locale={locale} week={r.week_id} backQuery={backQuery} section={"intake/"+r.id} status={status} title={t.title}>
    <section className="card"><h2>{r.first_name} {r.last_name}</h2>
      <p>{r.week} · {r.intake_channel === "desk" ? rosterCopy[locale].desk : t[r.intake_channel]} · {t.counts}: {confirmed} / {r.capacity}</p>
      <div className="grid"><strong>{t.place}: {t[r.place_status]}</strong><strong>{t.permission}: {t[r.participation]}</strong>
        <strong>{t.balance}: {balance === null ? t.noFee : money(balance)}</strong></div>
    </section>
    <section className="card"><details><summary>{t.authorization}</summary>
      <p>{r.signer_name} · {r.authorized} · {r.notice_version}</p>
      <p>{registration.photoPermission} · {r.photo_permission === "granted" ? registration.yes : r.photo_permission === "declined" ? registration.no : registration.photoUnknown}</p>
      {r.intake_channel === "desk" && <p>{t.recorder}: {display(r.details.recorder)}</p>}
      {r.intake_channel === "paper" && <p>{t.received}: {display(r.details.paperRoute)}<br />{t.source}: {display(r.details.paperSource)}<br />
        {t.recorder}: {display(r.details.recorder)}<br />{t.witness}: {display(r.details.witness)}</p>}
    </details></section>
    {r.intake_channel === "paper" && <section className="card">
      <h2>{attachment.title}</h2>
      {r.details.paperLocation && <p>{attachment.location} · {r.details.paperLocation}</p>}
      {attachments.length > 0 && <ul>{attachments.map((file,index)=><li key={file.id}>
        <a href={"/api/signed-forms/"+r.id+"/"+file.id}>{attachment.download} {index+1}</a>{" · "}{dateTime.format(new Date(file.uploaded_at))}
      </li>)}</ul>}
      {canAttach && attachments.length < signedFormMaxFiles &&
        <SignedFormUpload locale={locale} registration={r.id} limit={signedFormMaxFiles-attachments.length} />}
    </section>}
    <section className="card"><h2>{t.followupHeading}</h2><p>{t.followupHelp}</p>
      {form("followup",t.saveFollowup,<FollowUpFields key={JSON.stringify([r.followup,r.follow_up_reason])} locale={locale} date={r.followup} reason={r.follow_up_reason} />)}
    </section>
    <section className="card"><h2>{t.permission}</h2>
      {form("permission",t.reviewPermission,<>
        <label>{t.permission}<select name="permission" defaultValue={r.participation}><option value="pending">{t.pending}</option>
          <option value="granted">{t.granted}</option><option value="declined">{t.declined}</option></select></label>
        <label>{t.evidence}<input name="detail" maxLength={500} required /></label>
      </>)}
    </section>
    <section className="card"><h2>{t.finance}</h2>
      <p>{payment.registrationReference} <strong><code>{r.payment_reference}</code></strong></p>
      <Link href={"/"+locale+"/intake/scholarships?week="+r.week_id}>{t.scholarships}</Link>
      <dl className="balance-breakdown">
        <div><dt>{t.fee}</dt><dd>{r.fee_cents === null ? t.noFee : money(r.fee_cents)}</dd></div>
        <div><dt>{t.award}</dt><dd>− {money(funds.award)}</dd></div>
        <div><dt>{t.paid}</dt><dd>− {money(funds.paid)}</dd></div>
        <div><dt>{t.balance}</dt><dd>{balance === null ? "—" : money(balance)}</dd></div>
      </dl>
      {payments.rows.length > 0 && <ul>{payments.rows.map(p => <li key={p.id}>{money(p.amount_cents)} · {p.reference} · {p.recorded_by}{p.paid_on && <> · <time dateTime={p.paid_on}>{p.paid_on}</time></>}</li>)}</ul>}
      {!funds.award && form("redeem",t.redeem,<label>{t.code}<input name="code" defaultValue={r.details.scholarship ?? ""} required maxLength={100} /></label>)}
      {!funds.award && r.details.scholarship && !r.scholarship_reviewed_at && <details>
        <summary>{payment.pending}</summary>{form("closeScholarship",payment.closeScholarship,null)}
      </details>}
      <hr />
      {form("payment",t.savePayment,<><label>{t.amount}<input name="amount" inputMode="decimal" required /></label>
        <label>{t.reference}<input name="reference" required maxLength={150} /></label>
        <label>{payment.paidOn}<input name="paidOn" type="date" max={panamaDate()} /></label></>)}
    </section>
    <section className="card"><h2>{t.place}</h2>
      {r.place_status === "confirmed" ?
        form("release",t.release,<label>{t.releaseReason}<input name="detail" maxLength={500} required /></label>) :
        form("confirm",t.confirm,<>
          <label className="check"><input name="eligible" type="checkbox" required />{t.eligible}</label>
          <label>{t.exception}<input name="detail" maxLength={500} /></label>
        </>)}
    </section>
    <section className="card"><h2>{t.history}</h2>{events.rows.length ? <ul>{events.rows.map(event =>
      <li key={event.id}>{t[event.event_type + "Event" as "permissionEvent"|"confirmedEvent"|"releasedEvent"]} · {event.recorded_by} · {dateTime.format(new Date(event.recorded_at))}{event.detail && <> · {event.detail}</>}</li>
    )}</ul> : <p>{t.noHistory}</p>}</section>
  </ReviewFrame>;
}
