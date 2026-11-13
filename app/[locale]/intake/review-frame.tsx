import type { ReactNode } from "react";
import Link from "next/link";
import { StaffNav } from "../staff-nav";
import { notFound, redirect } from "next/navigation";
import { copy, isLocale, type Locale } from "../../../lib/copy";
import { reviewCopy } from "../../../lib/review-copy";
import { currentRole } from "../../../lib/session";
import { changeLanguage, logout } from "../actions";

export async function requireReview(locale: string) {
  if (!isLocale(locale)) notFound();
  const role = await currentRole();
  if (role !== "leadership" && role !== "registration") redirect("/" + locale);
  return { locale, role };
}

export function ReviewFrame({ locale, section, title, status, week, paper, backQuery, month, day, event, visit, scholarshipSeason, followups, children }: {
  locale: Locale; section: string; title: string; status?: string; week?: number; paper?:boolean; backQuery?:string; month?:string; day?:string; event?:string; visit?:string; scholarshipSeason?:boolean; followups?:string; children: ReactNode;
}) {
  const t = reviewCopy[locale];
  const messages = {
    saved:t.saved, invalid:t.invalid, full:t.full, codeError:t.codeError, allocationExceeded:t.allocationExceeded,
    feeNeeded:t.feeNeeded, exceptionNeeded:t.exceptionNeeded, alreadyArrived:t.alreadyArrived, unavailable:t.unavailable,
  };
  return <>
    <header><div><div className="brand"><img src="/palabra-de-vida.png" width={118} height={54} alt="Palabra de Vida Panamá" /></div>
      <div className="actions">
        <form action={changeLanguage}>
          <input type="hidden" name="locale" value={locale === "en" ? "es" : "en"} />
          <input type="hidden" name="section" value={section} />
          {week && <input type="hidden" name="week" value={week} />}
          {month && <input type="hidden" name="month" value={month} />}
          {day && <input type="hidden" name="day" value={day} />}
          {event && <input type="hidden" name="event" value={event} />}
          {visit && <input type="hidden" name="visit" value={visit} />}
          {followups && <input type="hidden" name="followups" value={followups} />}
          {scholarshipSeason && <input type="hidden" name="scope" value="season" />}
          {paper && <input type="hidden" name="method" value="paper" />}
          {backQuery && <input type="hidden" name="from" value={backQuery} />}
          <button lang={locale === "en" ? "es" : "en"}>{locale === "en" ? "Español" : "English"}</button>
        </form>
        <form action={logout}><input type="hidden" name="locale" value={locale} /><button>{copy[locale].logout}</button></form>
      </div>
    </div></header>
    <main><StaffNav locale={locale} week={week} active={section.startsWith("church-visits") ? "church-visits" : section.startsWith("events") ? "events" : section === "facilities" ? "facilities" : section === "departure" ? "departure" : section.startsWith("check-in") ? "check-in" : section === "intake/scholarships" ? "scholarships" : "registrations"} />
      {section.startsWith("intake/") && section !== "intake/scholarships" && <Link href={"/" + locale + "/intake" + (backQuery ? "?"+backQuery : week ? "?week="+week : "")}>{t.back}</Link>}<h1>{title}</h1>
      {status && Object.hasOwn(messages,status) && <p className="notice" role={status === "saved" ? "status" : "alert"}>{messages[status as keyof typeof messages]}</p>}
      {children}
    </main>
  </>;
}
