import { randomUUID } from "node:crypto";
import Link from "next/link";
import { campWeekOptions, listCampWeeks } from "../../../../lib/camp-week";
import { getDatabase } from "../../../../lib/database";
import { rosterCopy } from "../../../../lib/roster-copy";
import { RegistrationForm } from "../../registration-form";
import { requireReview, ReviewFrame } from "../review-frame";

export default async function NewRegistration({ params, searchParams }: {
  params: Promise<{locale:string}>; searchParams: Promise<{week?:string; method?:string}>;
}) {
  const { locale } = await requireReview((await params).locale);
  const query = await searchParams;
  const t = rosterCopy[locale], paper = query.method === "paper";
  const db = await getDatabase();
  const weeks = await listCampWeeks(db);
  const week = weeks.find(item => String(item.id) === query.week) ?? weeks[0];
  const base = "/" + locale + "/intake/new?week=" + (week?.id ?? "");
  return <ReviewFrame locale={locale} section="intake/new" title={t.add} week={week?.id} paper={paper}>
    {week && <>
      <section className="card">
        <h2>{t.method}</h2><div className="actions">
          <Link aria-current={!paper ? "page" : undefined} className={!paper ? "action-link" : "action-link secondary"} href={base}>{t.desk}</Link>
          <Link aria-current={paper ? "page" : undefined} className={paper ? "action-link" : "action-link secondary"} href={base+"&method=paper"}>{t.paper}</Link>
        </div>
      </section>
      <RegistrationForm key={paper ? "paper" : "desk"} locale={locale} channel={paper ? "paper" : "desk"} weeks={campWeekOptions(weeks,locale)} id={randomUUID()} selectedWeek={week.id} />
    </>}
  </ReviewFrame>;
}
