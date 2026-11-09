import { randomUUID } from "node:crypto";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getDatabase } from "../../../../../lib/database";
import { copy,isLocale } from "../../../../../lib/copy";
import { eventRegistrationCopy } from "../../../../../lib/event-registration-copy";
import { currentRole } from "../../../../../lib/session";
import { eventUuid } from "../../../../../lib/event-registration";
import { changeLanguage } from "../../../actions";
import { PublicRegistrationHeader } from "../../../public-registration-header";
import { AttendeeForm } from "../../attendee-form";

export default async function EventRegistration({params}:{params:Promise<{locale:string;id:string}>}) {
  const {locale,id}=await params;
  if(!isLocale(locale) || !eventUuid.test(id)) notFound();
  const t=eventRegistrationCopy[locale], c=copy[locale];
  const db=await getDatabase();
  const event=(await db.query<{name:string;start:string;end:string;day_attendance:boolean;overnight_attendance:boolean;cancelled_at:Date|null}>(
    `SELECT name,starts_at::date::text AS start,ends_at::date::text AS end,day_attendance,overnight_attendance,cancelled_at
     FROM special_event WHERE id=$1`,[id],
  )).rows[0];
  if(!event) notFound();
  const staff = await currentRole() === "leadership";
  const dates = new Intl.DateTimeFormat(locale === "es" ? "es-PA" : "en-US", {
    dateStyle:"long", timeZone:"UTC",
  }).formatRange(new Date(event.start+"T00:00:00Z"),new Date(event.end+"T00:00:00Z"));
  return <div className="public-registration">
    <PublicRegistrationHeader>
      <form action={changeLanguage}><input type="hidden" name="locale" value={locale==="en"?"es":"en"} />
        <input type="hidden" name="section" value={"events/register/"+id} /><button lang={locale==="en"?"es":"en"}>{c.switch}</button>
      </form>
    </PublicRegistrationHeader>
    <main>
      {staff && <p><Link href={"/"+locale+"/events?event="+id}>{t.backToEvent}</Link></p>}
      <p className="registration-eyebrow">{t.registration}</p>
      <h1>{event.name}</h1>
      <p className="muted">{dates}</p>
      {event.cancelled_at || process.env.PDV_LOCAL_DEMO!=="1" ? <p>{t.closed}</p> :
        <AttendeeForm locale={locale} event={id} id={randomUUID()} source="online" day={event.day_attendance} overnight={event.overnight_attendance} />}
    </main>
  </div>;
}
