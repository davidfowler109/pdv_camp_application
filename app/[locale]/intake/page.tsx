import Link from "next/link";
import { campPaymentCopy } from "../../../lib/camp-payment-copy";
import { copy } from "../../../lib/copy";
import { campWeekLabel, listCampWeeks } from "../../../lib/camp-week";
import { getDatabase } from "../../../lib/database";
import { panamaDate } from "../../../lib/registration";
import { registrationCopy } from "../../../lib/registration-copy";
import { reviewCopy, formatMoney } from "../../../lib/review-copy";
import { rosterCopy } from "../../../lib/roster-copy";
import { requireReview, ReviewFrame } from "./review-frame";
import { RegistrationWeekFilter } from "./week-filter";

type Row = {
  id:string; camper:string; balance:number|null; followup_date:string|null; follow_up_reason:string|null;
  place_status:"pending"|"confirmed"|"released"; participation:"pending"|"granted"|"declined";
};
const size = 25;

export default async function Intake({ params, searchParams }: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ week?:string; q?:string; followups?:string; page?:string; gender?:string; church?:string }>;
}) {
  const { locale } = await requireReview((await params).locale);
  const query = await searchParams;
  const t = rosterCopy[locale], r = reviewCopy[locale], f = registrationCopy[locale];
  const base = "/" + locale + "/intake";
  const db = await getDatabase();
  const weeks = await listCampWeeks(db);
  const week = weeks.find(item => String(item.id) === query.week) ?? weeks[0];
  const search = typeof query.q === "string" ? query.q.trim().slice(0,100) : "";
  const today = panamaDate();
  const followupViews = ["open","overdue","today","undated"] as const;
  const followups = followupViews.find(view => view === query.followups) ?? "";
  const followupLabels = {open:r.openFollowups,overdue:r.overdue,today:r.dueToday,undated:r.undatedFollowups};
  const gender = query.gender === "female" || query.gender === "male" ? query.gender : "";
  const church = typeof query.church === "string" ? query.church.trim().slice(0,100) : "";
  const filter = `FROM registration r JOIN camp_week w ON w.id=r.week_id WHERE r.week_id=$1
    AND (position(lower($2) in lower(r.first_name || ' ' || r.last_name)) > 0 OR upper($2)=r.payment_reference)
    AND CASE $3::text
      WHEN 'open' THEN r.follow_up IS NOT NULL OR r.follow_up_reason IS NOT NULL
      WHEN 'overdue' THEN r.follow_up < $6::date
      WHEN 'today' THEN r.follow_up = $6::date
      WHEN 'undated' THEN r.follow_up IS NULL AND r.follow_up_reason IS NOT NULL
      ELSE true END
    AND ($4 = '' OR r.gender_group = $4)
    AND position(lower($5) in lower(COALESCE(r.details->>'homeChurch',''))) > 0`;
  const values = [week?.id,search,followups,gender,church,today];
  const [total,counts] = week ? await Promise.all([
    db.query<{count:number}>("SELECT count(*)::integer AS count "+filter,values).then(result=>result.rows[0].count),
    db.query<Record<typeof followupViews[number],number>>(
      `SELECT count(*)::integer AS open,
         count(*) FILTER (WHERE follow_up < $2::date)::integer AS overdue,
         count(*) FILTER (WHERE follow_up = $2::date)::integer AS today,
         count(*) FILTER (WHERE follow_up IS NULL)::integer AS undated
       FROM registration WHERE week_id=$1 AND (follow_up IS NOT NULL OR follow_up_reason IS NOT NULL)`,[week.id,today],
    ).then(result=>result.rows[0]),
  ]) : [0,{open:0,overdue:0,today:0,undated:0}];
  const requested = Number(query.page);
  const page = Number.isSafeInteger(requested) ? Math.max(1,Math.min(requested,Math.ceil(total/size))) : 1;
  const offset = (page-1)*size;
  const rows = total ? (await db.query<Row>(
    `SELECT r.id,r.first_name || ' ' || r.last_name AS camper,r.place_status,r.participation,
      r.follow_up::text AS followup_date,r.follow_up_reason,
      CASE WHEN COALESCE(r.fee_at_registration_cents,w.fee_cents) IS NOT NULL THEN GREATEST(0,COALESCE(r.fee_at_registration_cents,w.fee_cents)
        - COALESCE((SELECT sum(amount_cents) FROM registration_payment p WHERE p.registration_id=r.id),0)
        - COALESCE((SELECT value_cents FROM scholarship_code c WHERE c.registration_id=r.id),0))::double precision END AS balance
      `+filter+` ORDER BY CASE WHEN $3 <> '' THEN r.follow_up END ASC NULLS LAST,
      lower(r.last_name),lower(r.first_name),r.id LIMIT $7 OFFSET $8`,[...values,size,offset],
  )).rows : [];
  function state(pageNumber:number) {
    const state = new URLSearchParams();
    if (week) state.set("week",String(week.id));
    if (search) state.set("q",search);
    if (followups) state.set("followups",followups);
    if (gender) state.set("gender",gender);
    if (church) state.set("church",church);
    if (pageNumber > 1) state.set("page",String(pageNumber));
    return state;
  }
  const date = new Intl.DateTimeFormat(locale === "es" ? "es-PA" : "en-US",{dateStyle:"medium",timeZone:"UTC"});

  return <ReviewFrame locale={locale} section="intake" title={t.title} week={week?.id} followups={followups}>
    {week ? <section className="card">
      <div className="actions">
        <Link className="action-link" href={base+"/new?week="+week.id}>{t.add}</Link>
        <Link className="action-link secondary" href={base+"/print?week="+week.id}>{t.print}</Link>
      </div>
      <section className="follow-up-queue" aria-labelledby="follow-up-queue-title">
        <h2 id="follow-up-queue-title">{r.followupQueue}</h2>
        <div className="actions">
          {followupViews.map(view=><Link key={view} className={followups === view ? "action-link" : "action-link secondary"}
            href={base+"?"+new URLSearchParams({week:String(week.id),followups:view})}
            aria-current={followups === view ? "page" : undefined}>{followupLabels[view]} <strong>({counts[view]})</strong></Link>)}
          {followups && <Link className="action-link secondary" href={base+"?week="+week.id}>{r.allApplications}</Link>}
        </div>
      </section>
      <form method="get" className="roster-filters">
        {followups && <input type="hidden" name="followups" value={followups} />}
        <div className="grid">
          <RegistrationWeekFilter label={f.week} selected={week.id} weeks={weeks.map(item => ({id:item.id,label:campWeekLabel(item,locale)}))} />
          <label>{campPaymentCopy[locale].search}<input type="search" name="q" defaultValue={search} maxLength={100} /></label>
        </div>
        <details open={Boolean(gender || church)}>
          <summary>{t.advanced}</summary>
          <div className="grid">
            <label>{f.group}<select name="gender" defaultValue={gender}>
              <option value="">{t.anyGroup}</option><option value="female">{copy[locale].female}</option><option value="male">{copy[locale].male}</option>
            </select></label>
            <label>{f.homeChurch}<input name="church" type="search" defaultValue={church} maxLength={100} /></label>
          </div>
        </details>
        <button>{t.apply}</button>
      </form>
      {rows.length ? <>
        <div className="roster-scroll"><table className="roster-table">
          <thead><tr><th scope="col">{t.camper}</th><th scope="col">{r.place}</th><th scope="col">{r.permission}</th>
            <th scope="col" className="money">{r.balance}</th><th scope="col">{r.followupHeading}</th></tr></thead>
          <tbody>{rows.map(row => {
            const destination = new URLSearchParams({from:state(page).toString()});
            const due = row.followup_date;
            return <tr key={row.id}>
              <th scope="row"><Link href={base+"/"+row.id+"?"+destination}>{row.camper}</Link></th>
              <td>{r[row.place_status]}</td><td>{r[row.participation]}</td>
              <td className="money">{row.balance === null ? r.noFee : formatMoney(row.balance,locale)}</td>
              <td>{due || row.follow_up_reason ? <>
                <span className={due && due <= today ? "badge warn" : "badge"}>{due === today ? r.dueToday : due && due < today ? r.overdue : r.followupRequired}</span>
                {due && <div><time dateTime={due}>{date.format(new Date(due+"T00:00:00Z"))}</time></div>}
                {row.follow_up_reason && <div className="follow-up-reason">{row.follow_up_reason}</div>}
              </> : "—"}</td>
            </tr>;
          })}</tbody>
        </table></div>
        <div className="actions roster-pages">
          {page > 1 && <Link href={base+"?"+state(page-1)}>{t.previous}</Link>}
          <span>{offset+1}–{Math.min(offset+size,total)} {t.of} {total}</span>
          {offset+size < total && <Link href={base+"?"+state(page+1)}>{t.next}</Link>}
        </div>
      </> : <p>{search || gender || church ? t.noMatches : followups ? r.noFollowups : f.empty}</p>}
    </section> : <p>{f.empty}</p>}
  </ReviewFrame>;
}
