import { randomUUID } from "node:crypto";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getDatabase } from "../../../../../lib/database";
import { copy, isLocale } from "../../../../../lib/copy";
import { visitIdPattern } from "../../../../../lib/church-visits";
import { churchVisitorCopy } from "../../../../../lib/church-visitor-copy";
import { currentRole } from "../../../../../lib/session";
import { panamaDate } from "../../../../../lib/registration";
import { changeLanguage } from "../../../actions";
import { PublicRegistrationHeader } from "../../../public-registration-header";
import { VisitorForm } from "../../visitor-form";

export default async function PublicChurchRegistration({params}: {params:Promise<{locale:string;id:string}>}) {
  const {locale,id} = await params;
  if (!isLocale(locale) || !visitIdPattern.test(id)) notFound();
  const db = await getDatabase();
  const visit = (await db.query<{name:string;church_name:string;start:string;end:string;cancelled_at:string|null}>(
    "SELECT name,church_name,starts_at::date::text AS start,ends_at::date::text AS end,cancelled_at FROM church_visit WHERE id=$1",[id],
  )).rows[0];
  if (!visit) notFound();
  const t = churchVisitorCopy[locale];
  const staff = await currentRole() === "leadership";
  return <div className="public-registration">
    <PublicRegistrationHeader><form action={changeLanguage}>
      <input name="locale" type="hidden" value={locale === "en" ? "es" : "en"} />
      <input name="section" type="hidden" value={"church-visits/register/"+id} />
      <button lang={locale === "en" ? "es" : "en"}>{copy[locale].switch}</button>
    </form></PublicRegistrationHeader>
    <main>{staff && <p><Link href={"/"+locale+"/church-visits/visitors?visit="+id}>{t.back}</Link></p>}
      <p className="registration-eyebrow">{t.registration}</p><h1>{visit.name}</h1>
      <p>{visit.church_name} · {visit.start} – {visit.end}</p>
      {visit.cancelled_at || process.env.PDV_LOCAL_DEMO !== "1" ? <p>{t.closed}</p> :
        <VisitorForm locale={locale} visit={id} id={randomUUID()} mode="online" today={panamaDate()} />}
    </main>
  </div>;
}
