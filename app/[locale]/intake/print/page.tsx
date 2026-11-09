import { getDatabase } from "../../../../lib/database";
import { campBusStops, campPickupLabel, healthFields, noticeVersion } from "../../../../lib/registration";
import { registrationCopy } from "../../../../lib/registration-copy";
import { rosterCopy } from "../../../../lib/roster-copy";
import { requireReview, ReviewFrame } from "../review-frame";
import { PrintButton } from "./print-button";

export default async function Printable({ params, searchParams }: {
  params:Promise<{locale:string}>; searchParams:Promise<{week?:string}>;
}) {
  const { locale } = await requireReview((await params).locale);
  const { week:requested } = await searchParams;
  const t = rosterCopy[locale], f = registrationCopy[locale];
  const db = await getDatabase();
  const weeks = (await db.query<{id:number;name:string;start:string|null;end:string|null}>(
    "SELECT id,name,starts_on::text AS start,ends_on::text AS end FROM camp_week ORDER BY starts_on NULLS LAST,id",
  )).rows;
  const week = weeks.find(item => String(item.id) === requested) ?? weeks[0];
  const line = (label:string, required=false) => <div className="print-field">{label}{required ? " *" : ""}<div className="write-line" /></div>;
  const choices = (...labels:string[]) => <span>{labels.map(label => <span className="print-choice" key={label}>□ {label}</span>)}</span>;

  return <ReviewFrame locale={locale} section="intake/print" title={t.printed} week={week?.id}>
    {week && <>
      <div className="print-actions"><PrintButton label={t.printButton} /></div>
      <article className="print-registration">
        <div className="print-heading"><img src="/palabra-de-vida.png" width={100} height={48} alt="Palabra de Vida Panamá" />
          <div><strong>Palabra de Vida Panamá</strong><br />{t.printed}<br />{f.week}: {week.name}{week.start && week.end && <> · {week.start} – {week.end}</>}</div>
        </div>
        <p>{t.paperHelp} · {t.version}: {noticeVersion}</p>
        <section><h2>{t.data}</h2><p>{f.noticeBody}</p>
          <p>{choices(locale === "en" ? "I authorize the collection of information for these purposes. *" : "Autorizo la recolección de datos para estos fines. *")}</p>
          <div className="paper-grid">{line(f.signer,true)}<div>{f.signerRole} *<br />{choices(f.guardian,f.self)}</div>
            {line(f.signerRelationship+" ("+t.conditional+")")}{line(t.signature,true)}{line(t.date,true)}
          </div>
        </section>
        <section><h2>{f.camper}</h2><div className="paper-grid">
          {line(f.first,true)}{line(f.last,true)}{line(f.birth,true)}
          <div>{f.group} *<br />{choices(f.female,f.male)}</div>
          {line(f.home,true)}{line(f.contact,true)}{line(f.relationship,true)}
          {line(f.contactRoute,true)}{line(f.additionalContact)}{line(f.homeChurch)}
          <div>{f.helperRole} *<br />{choices(f.noneHelper,f.family,f.pastor,f.staff)}</div>
          {line(f.helper+" ("+t.conditional+")")}
        </div></section>
        <section><h2>{f.health}</h2><div className="paper-grid">
          {healthFields.map(key => <div key={key}>{f[key]} *<br />{choices(f.none,f.yes,f.unknown)}
            {line(f.details+" ("+(locale === "en" ? "if yes" : "si respondió sí")+")")}</div>)}
          {line(f.notes)}
        </div></section>
        <section><h2>{f.transport}</h2><div className="paper-grid">
          <div>{f.arrival} *<br />{choices(f.bus,f.own)}</div><div>{f.arrivalStop} ({t.conditional})<br />{choices(...campBusStops.map(stop=>campPickupLabel(stop,locale)))}</div>
          <div>{f.departure} *<br />{choices(f.bus,f.own)}</div><div>{f.departureStop} ({t.conditional})<br />{choices(...campBusStops.map(stop=>stop.name))}</div>
          {line(f.pickup)}
        </div></section>
        <section><h2>{f.permissions}</h2><div className="paper-grid">
          <div>{f.participation}<br />{choices(f.pending,f.granted,f.declined)}</div>
          {line(f.scholarship)}
        </div></section>
        <section><h2>{f.photoPermission}</h2><p>{f.photoQuestion} *</p>
          <p>{choices(f.yes,f.no)} · {f.photoHelp}</p>
        </section>
      </article>
    </>}
  </ReviewFrame>;
}
