import { randomUUID } from "node:crypto";
import { notFound } from "next/navigation";
import { getDatabase } from "../../lib/database";
import { isLocale } from "../../lib/copy";
import { registrationCopy } from "../../lib/registration-copy";
import { changeLanguage } from "./actions";
import { campWeekLabel, type CampWeekOption } from "../../lib/camp-week";
import { campPaymentCopy } from "../../lib/camp-payment-copy";
import { formatMoney } from "../../lib/review-copy";
import { RegistrationForm } from "./registration-form";
import { CampPaymentReceipt } from "./camp-payment-receipt";
import { panamaDate } from "../../lib/registration";
import { PublicRegistrationHeader } from "./public-registration-header";

type RegistrationWeek = CampWeekOption & {fee_cents:number|null;early_bird_cents:number|null;early_deadline:string|null};

export async function RegistrationScreen({ locale, requestedWeek, receipt }: { locale: string; requestedWeek?:string; receipt?:string }) {
  if (!isLocale(locale)) notFound();
  const t = registrationCopy[locale];
  let weeks: RegistrationWeek[] = [];
  if (!receipt && process.env.PDV_LOCAL_DEMO === "1") {
    try {
      const db = await getDatabase();
      weeks = (await db.query<RegistrationWeek>(`SELECT id,name,starts_on::text AS start,ends_on::text AS end,fee_cents,early_bird_cents,early_bird_ends_on::text AS early_deadline
        FROM camp_week ORDER BY starts_on NULLS LAST,id`)).rows;
    } catch {}
  }
  const selected = weeks.find(week => String(week.id) === requestedWeek)?.id;
  const today = panamaDate(), payment = campPaymentCopy[locale];
  const dates = new Intl.DateTimeFormat(locale === "es" ? "es-PA" : "en-US",{dateStyle:"long",timeZone:"UTC"});
  const options = weeks.map(week => {
    const deadline = week.early_deadline;
    const priceLabel = deadline && deadline >= today && week.early_bird_cents !== null
      ? payment.earlyDisplay(formatMoney(week.early_bird_cents,locale),dates.format(new Date(deadline+"T00:00:00Z")))
      : week.fee_cents !== null ? payment.regularDisplay(formatMoney(week.fee_cents,locale)) : payment.feePending;
    return {id:week.id,label:campWeekLabel(week,locale),priceLabel};
  });
  return <div className="public-registration">
    <PublicRegistrationHeader>
      <form action={changeLanguage}>
        <input type="hidden" name="locale" value={locale === "es" ? "en" : "es"} />
        <input type="hidden" name="section" value="register" />
        {receipt && <input type="hidden" name="receipt" value={receipt} />}
        {selected && <input type="hidden" name="week" value={selected} />}
        <button lang={locale === "es" ? "en" : "es"}>{locale === "es" ? "English" : "Español"}</button>
      </form>
    </PublicRegistrationHeader>
    <main>
      <p className="registration-eyebrow">{t.pilot}</p>
      {receipt ? <CampPaymentReceipt id={receipt} locale={locale} /> : <>
        <h1>{t.title}</h1>
        {weeks.length ? <RegistrationForm locale={locale} channel="online" weeks={options} selectedWeek={selected} id={randomUUID()} /> : <p>{t.unavailable}</p>}
      </>}
    </main>
  </div>;
}
