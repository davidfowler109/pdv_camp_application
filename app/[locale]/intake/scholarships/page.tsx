import Link from "next/link";
import { WeekSelector } from "../../week-selector";
import { randomUUID } from "node:crypto";
import { campWeekOptions, type CampWeekOption } from "../../../../lib/camp-week";
import { getDatabase } from "../../../../lib/database";
import { scholarshipDistributorRoles } from "../../../../lib/review";
import { scholarshipCopy } from "../../../../lib/scholarship-copy";
import { formatMoney, reviewCopy } from "../../../../lib/review-copy";
import { manageScholarships } from "../../review-actions";
import { requireReview, ReviewFrame } from "../review-frame";

type Week = CampWeekOption & { award_limit:number; season_year:number|null };
type Code = {
  batch_id:string; code:string; distributor:string; distributor_role:typeof scholarshipDistributorRoles[number]; issued_at:Date;
  distributor_email:string|null; instructions:string|null;
  value_cents:number; redeemed_at:Date|null; camper:string|null; redeemed_week:string|null;
};

export default async function Page({ params, searchParams }: {
  params:Promise<{locale:string}>; searchParams:Promise<{status?:string;week?:string;scope?:string;batch?:string}>;
}) {
  const { locale, role } = await requireReview((await params).locale);
  const { status, week:requested, scope, batch:issuedBatch } = await searchParams;
  const db = await getDatabase();
  const weeks = (await db.query<Week>("SELECT id,name,starts_on::text AS start,ends_on::text AS end,award_limit,EXTRACT(YEAR FROM starts_on)::integer AS season_year FROM camp_week ORDER BY id")).rows;
  const week = weeks.find(item => String(item.id) === requested) ?? weeks[0];
  const t = reviewCopy[locale], s = scholarshipCopy[locale];
  const season = scope === "season" ? week?.season_year : null;
  const scopeName = season ? s.seasonName(season) : week?.name ?? "";
  const scopeLink = "/"+locale+"/intake/scholarships?week="+week?.id;
  const limit = season ? (await db.query<{award_limit:number}>(
    "SELECT award_limit FROM scholarship_season WHERE year=$1",[season],
  )).rows[0]?.award_limit ?? 0 : week?.award_limit ?? 0;
  const codes = week ? (await db.query<Code>(
    `SELECT c.batch_id,c.code,b.distributor,b.distributor_role,b.distributor_email,b.instructions,b.issued_at,
       c.value_cents,c.redeemed_at,r.first_name || ' ' || r.last_name AS camper,w.name AS redeemed_week
     FROM scholarship_code c JOIN scholarship_batch b ON b.id=c.batch_id
     LEFT JOIN registration r ON r.id=c.registration_id LEFT JOIN camp_week w ON w.id=r.week_id
     WHERE b.week_id=$1 OR b.season_year=$2 ORDER BY b.issued_at DESC,b.id,c.redeemed_at DESC NULLS LAST`,
    [season ? null : week.id,season ?? null],
  )).rows : [];
  const batches = new Map<string,{issued:Code;available:Code[];redeemed:Code[]}>();
  for (const code of codes) {
    let batch = batches.get(code.batch_id);
    if (!batch) {
      batch = {issued:code,available:[],redeemed:[]};
      batches.set(code.batch_id,batch);
    }
    if (code.redeemed_at) batch.redeemed.push(code);
    else batch.available.push(code);
  }
  const date = new Intl.DateTimeFormat(locale === "es" ? "es-PA" : "en-US", {
    dateStyle:"medium", timeStyle:"short", timeZone:"America/Panama",
  });
  const remaining = Math.max(0,limit-codes.length);
  function emailDraft(issued:Code,available:Code[]) {
    if (!issued.distributor_email || !available.length) return null;
    const body = [s.greeting(issued.distributor),s.intro(scopeName),
      issued.instructions,available.map(code=>code.code+" · "+formatMoney(code.value_cents,locale)).join("\r\n")]
      .filter(Boolean).join("\r\n\r\n");
    const recipient = encodeURIComponent(issued.distributor_email).replace("%40","@");
    const draft = "mailto:"+recipient+"?subject="+encodeURIComponent(s.subject);
    const fullDraft = draft+"&body="+encodeURIComponent(body);
    if (fullDraft.length <= 1800) return <p><a className="action-link secondary" href={fullDraft}>{s.emailCodes}</a></p>;
    return <details open={issued.batch_id === issuedBatch}>
      <summary>{s.emailCodes}</summary>
      <p><a href={draft}>{s.openDraft}</a></p>
      <label>{s.copyDraft}<textarea rows={7} readOnly value={body} /></label>
    </details>;
  }
  return <ReviewFrame locale={locale} week={week?.id} scholarshipSeason={Boolean(season)}
    section="intake/scholarships" title={t.scholarships} status={status}>
    {week && <>
      {status === "seasonLimitError" && <p className="notice" role="alert">{s.seasonLimitError}</p>}
      <section className="card"><h2>{scopeName}</h2>
        <WeekSelector key={week.id} weeks={campWeekOptions(weeks,locale)} selected={week.id}
          label={locale === "en" ? "Camp week" : "Semana de campamento"} submitLabel={locale === "en" ? "View week" : "Ver semana"}>
          {season && <input type="hidden" name="scope" value="season" />}
        </WeekSelector>
        {week.season_year && <p className="actions">
          <Link className={season ? "action-link secondary" : "action-link"} href={scopeLink} aria-current={!season ? "page" : undefined}>{s.weekCodes}</Link>
          <Link className={season ? "action-link" : "action-link secondary"} href={scopeLink+"&scope=season"} aria-current={season ? "page" : undefined}>{s.seasonCodes}</Link>
        </p>}
        {season && <p>{s.seasonHelp}</p>}
        <p>{t.allocated}: {codes.length} / {limit} · <strong>{t.remaining}: {remaining}</strong></p>
        {season && role === "leadership" && <form action={manageScholarships}>
          <input type="hidden" name="locale" value={locale} /><input type="hidden" name="week" value={week.id} />
          <input type="hidden" name="scope" value="season" /><input type="hidden" name="operation" value="seasonLimit" />
          <label>{s.seasonLimit}<input type="number" name="limit" min={0} max={10000} defaultValue={limit} required /></label>
          <button>{s.saveLimit}</button>
        </form>}
        {!season && role === "leadership" && <Link href={"/"+locale+"?week="+week.id+"#scholarship-limit"}>{locale === "en" ? "Change weekly scholarship limit" : "Cambiar el límite semanal de becas"}</Link>}
      </section>
      <section className="card"><h2>{t.issue}</h2>
        {remaining === 0 ? <p>{season ? s.noSeasonAwards : t.noAwards}</p> : <form action={manageScholarships}>
          <input type="hidden" name="locale" value={locale} /><input type="hidden" name="week" value={week.id} />
          <input type="hidden" name="operation" value="issue" />
          {season && <input type="hidden" name="scope" value="season" />}
          <input type="hidden" name="batchId" value={randomUUID()} />
          <div className="grid">
            <label>{t.distributor}<input name="distributor" maxLength={100} required /></label>
            <label>{t.distributorRole}<select name="distributorRole" defaultValue="" required><option value="">—</option>{scholarshipDistributorRoles.map(role => <option value={role} key={role}>{t[role]}</option>)}</select></label>
            <label>{t.count}<input name="count" type="number" min="1" max={Math.min(remaining,999)} required /></label>
            <label>{t.value}<input name="value" inputMode="decimal" required /></label>
            <label>{t.actor}<input name="actor" maxLength={100} required /></label>
            <label>{s.email}<input name="email" type="email" maxLength={254} /></label>
          </div>
          <label>{s.instructions}<textarea name="instructions" maxLength={1000} rows={3} /></label>
          <button>{t.issue}</button>
        </form>}
      </section>
      {[...batches.values()].map(({issued,available,redeemed}) => <section className="card" key={issued.batch_id} id={"batch-"+issued.batch_id}>
        <h2>{issued.distributor} ({t[issued.distributor_role]})</h2>
        <p className="muted">{t.issuedOn} {date.format(issued.issued_at)}</p>
        {issued.distributor_email && <p>{issued.distributor_email}</p>}
        {issued.instructions && <p className="scholarship-instructions">{issued.instructions}</p>}
        {emailDraft(issued,available)}
        <h3>{t.availableToRedeem} ({available.length})</h3>
        {available.length > 0 && <ul>{available.map(code => <li key={code.code}>
          <code>{code.code}</code> · {formatMoney(code.value_cents,locale)}
        </li>)}</ul>}
        {redeemed.length > 0 ? <details>
          <summary>{t.redeemedCodes} ({redeemed.length})</summary>
          <ul>{redeemed.map(code => <li key={code.code}>
            <code>{code.code}</code> · {formatMoney(code.value_cents,locale)}
            {code.camper && " · "+code.camper}
            {season && code.redeemed_week && " · "+s.redeemedIn+" "+code.redeemed_week}
            {code.redeemed_at && " · "+date.format(code.redeemed_at)}
          </li>)}</ul>
        </details> : <p>{t.redeemedCodes} (0)</p>}
      </section>)}
    </>}
  </ReviewFrame>;
}
