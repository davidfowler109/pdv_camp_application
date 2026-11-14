"use client";

import type { Locale } from "../../../lib/copy";
import { checkInCopy } from "../../../lib/check-in-copy";

export function CheckInRosterFilters({locale,week,weeks,stop,stops,search}: {
  locale:Locale;week:number;weeks:{id:number;label:string}[];stop:string;stops:{stop:string}[];search:string;
}) {
  const t=checkInCopy[locale];
  return <form method="get">
    <div className="grid">
      <label>{t.week}<select name="week" defaultValue={week}
        onChange={event => event.currentTarget.form?.requestSubmit()}>
        {weeks.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}
      </select></label>
      <label>{t.planned}<select name="stop" defaultValue={stop}
        onChange={event => event.currentTarget.form?.requestSubmit()}>
        <option value="">{t.all}</option>
        {stops.map(item => <option key={item.stop} value={item.stop}>{item.stop}</option>)}
      </select></label>
      <label>{t.search}<input type="search" name="q" defaultValue={search} maxLength={100} /></label>
    </div>
    <button type="submit">{t.filter}</button>
  </form>;
}
