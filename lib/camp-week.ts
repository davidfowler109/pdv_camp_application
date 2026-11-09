import type { Locale } from "./copy";
import type { Database } from "./database";

export type CampWeekOption = {id:number;name:string;start:string|null;end:string|null};

export async function listCampWeeks(db: Database) {
  const {rows} = await db.query<CampWeekOption>(
    "SELECT id,name,starts_on::text AS start,ends_on::text AS end FROM camp_week ORDER BY starts_on NULLS LAST,id",
  );
  return rows;
}

export function campWeekOptions(weeks: CampWeekOption[], locale: Locale) {
  return weeks.map(week => ({id:week.id,label:campWeekLabel(week,locale)}));
}

export function campWeekLabel(week: CampWeekOption, locale: Locale) {
  if (!week.start || !week.end) return week.name;
  const dates = new Intl.DateTimeFormat(locale === "es" ? "es-PA" : "en-US", {
    dateStyle:"long",timeZone:"UTC",
  });
  return week.name+" · "+dates.formatRange(new Date(week.start+"T00:00:00Z"),new Date(week.end+"T00:00:00Z"));
}
