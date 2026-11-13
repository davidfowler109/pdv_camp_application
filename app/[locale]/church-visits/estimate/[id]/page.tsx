import Link from "next/link";
import { notFound } from "next/navigation";
import { getDatabase } from "../../../../../lib/database";
import { isLocale,copy } from "../../../../../lib/copy";
import { currentRole } from "../../../../../lib/session";
import { visitIdPattern } from "../../../../../lib/church-visits";
import type { SharedVisitEstimate } from "../../../../../lib/visit-itinerary";
import { visitItineraryCopy } from "../../../../../lib/visit-itinerary-copy";
import { changeLanguage } from "../../../actions";
import { PublicRegistrationHeader } from "../../../public-registration-header";
import { BudgetSummary,CostTable } from "../../itinerary/budget-summary";
import { PrintEstimate } from "../print-button";

export default async function SharedEstimate({params}: {params:Promise<{locale:string;id:string}>}) {
  const {locale,id}=await params;
  if (!isLocale(locale) || !visitIdPattern.test(id)) notFound();
  const db=await getDatabase();
  const publication=(await db.query<{visit_id:string;payload:SharedVisitEstimate;version:number;date:string;cancelled_at:string|null;withdrawn_at:string|null}>(
    `SELECT p.visit_id,p.payload,p.version,p.withdrawn_at::text AS withdrawn_at,to_char(p.published_at AT TIME ZONE 'America/Panama','YYYY-MM-DD HH24:MI') AS date,v.cancelled_at::text AS cancelled_at
      FROM visit_budget_publication p JOIN church_visit v ON v.id=p.visit_id WHERE p.id=$1`,[id],
  )).rows[0];
  if (!publication) notFound();
  const t=visitItineraryCopy[locale], data=publication.payload;
  const staff=await currentRole()==="leadership";
  if (publication.withdrawn_at && !staff) notFound();
  return <div className="public-registration estimate-summary"><PublicRegistrationHeader>
    <form action={changeLanguage} className="no-print"><input name="locale" type="hidden" value={locale==="en" ? "es" : "en"} />
      <input name="section" type="hidden" value={"church-visits/estimate/"+id} /><button>{copy[locale].switch}</button>
    </form>
  </PublicRegistrationHeader><main>
    {staff && <p className="no-print"><Link href={"/"+locale+"/church-visits/itinerary?visit="+publication.visit_id}>{t.title}</Link></p>}
    <h1>{data.visit.name}</h1><p>{data.visit.church_name} · {data.visit.start} – {data.visit.end}</p>
    <p><strong>{t.estimate} · {t.version} {publication.version}</strong> · {t.publishedOn} {publication.date}</p>
    {publication.withdrawn_at && <p className="notice">{t.withdrawn}</p>}
    {publication.cancelled_at ? <p>{t.closed}</p> : <><PrintEstimate locale={locale} />
      <BudgetSummary locale={locale} budget={data.budget} countBasis={data.countBasis} extra={data.extra} shareGroupCosts={data.shareGroupCosts} />
      {data.activities.map(activity => <section className="card" key={activity.id}><h2>{activity.day} · {activity.title}</h2>
        <p>{activity.time} {activity.location}</p>{activity.notes && <p>{activity.notes}</p>}
        <CostTable locale={locale} lines={data.budget.lines.filter(line => line.activity_id===activity.id)} />
      </section>)}
      <section className="card"><h2>{t.wholeVisit}</h2><CostTable locale={locale} lines={data.budget.lines.filter(line => !line.activity_id)} /></section>
    </>}
  </main></div>;
}
