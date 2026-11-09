"use client";

import { useState } from "react";
import type { Locale } from "../../../../lib/copy";
import { reviewCopy } from "../../../../lib/review-copy";

export function FollowUpFields({ locale, date, reason }: { locale: Locale; date: string | null; reason: string | null }) {
  const t = reviewCopy[locale];
  const [required, setRequired] = useState(Boolean(date || reason));

  return <>
    <label className="check">
      <input name="followupRequired" type="checkbox" checked={required} onChange={event => setRequired(event.currentTarget.checked)} />
      {t.followupRequired}
    </label>
    <label hidden={!required}>{t.followupReason}
      <input name="detail" defaultValue={reason ?? ""} maxLength={500} disabled={!required} required={required} />
    </label>
    <label hidden={!required}>{t.followup}
      <input type="date" name="followup" defaultValue={date ?? ""} disabled={!required} />
    </label>
  </>;
}
