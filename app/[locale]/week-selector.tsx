"use client";

import type { ReactNode } from "react";

export function WeekSelector({ weeks, selected, label, submitLabel, children }: {
  weeks: {id:number;label:string}[];
  selected: number;
  label: string;
  submitLabel: string;
  children?: ReactNode;
}) {
  return <form method="get">
    {children}
    <label>{label}
      <select name="week" defaultValue={selected} onChange={event => event.currentTarget.form?.requestSubmit()}>
        {weeks.map(week => <option key={week.id} value={week.id}>{week.label}</option>)}
      </select>
    </label>
    <noscript><button type="submit">{submitLabel}</button></noscript>
  </form>;
}
