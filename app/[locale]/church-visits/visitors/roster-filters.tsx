"use client";

import type { Locale } from "../../../../lib/copy";
import { churchVisitorCopy } from "../../../../lib/church-visitor-copy";

export function VisitorRosterFilters({locale,visit,search,role,status}: {
  locale:Locale;visit:string;search:string;role:string;status:string;
}) {
  const t=churchVisitorCopy[locale];
  return <form method="get">
    <input name="visit" type="hidden" value={visit} />
    <div className="grid">
      <label><span>{t.search}</span><input name="q" maxLength={100} defaultValue={search} /></label>
      <label><span>{t.role}</span><select name="role" defaultValue={role}
        onChange={event => event.currentTarget.form?.requestSubmit()}>
        <option value="">{t.allRoles}</option><option value="student">{t.student}</option>
        <option value="adult">{t.adult}</option><option value="leader">{t.leader}</option>
      </select></label>
      <label><span>{t.status}</span><select name="status" defaultValue={status}
        onChange={event => event.currentTarget.form?.requestSubmit()}>
        <option value="active">{t.active}</option><option value="withdrawn">{t.withdrawn}</option>
        <option value="all">{t.allStatuses}</option>
      </select></label>
    </div>
    <button type="submit">{t.searchButton}</button>
  </form>;
}
