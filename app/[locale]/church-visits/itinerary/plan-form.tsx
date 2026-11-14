"use client";

import { startTransition,useActionState,useState,type ReactNode } from "react";
import type { Locale } from "../../../../lib/copy";
import type { ItineraryResult } from "../../../../lib/visit-itinerary";
import { visitItineraryCopy } from "../../../../lib/visit-itinerary-copy";
import { submitVisitPlan } from "./actions";

export function MealFields({locale,meal="",source="",description=""}: {locale:Locale;meal?:string|null;source?:string|null;description?:string}) {
  const t=visitItineraryCopy[locale];
  const [selected,setSelected]=useState(meal ?? "");
  const [expenseDescription,setExpenseDescription]=useState(meal ? "" : description);
  return <><label><span>{t.meal} *</span><select name="meal" value={selected} onChange={event => setSelected(event.currentTarget.value)}>
    <option value="">{t.noMeal}</option>{(["breakfast","lunch","dinner"] as const).map(value => <option key={value} value={value}>{t[value]}</option>)}
  </select></label>{!selected && <label><span>{t.description} *</span><input name="description" maxLength={200} required
    value={expenseDescription} onChange={event => setExpenseDescription(event.currentTarget.value)} /></label>}
  {selected && <label><span>{t.mealSource} *</span><select name="mealSource" required defaultValue={source ?? ""}>
    <option value="">—</option><option value="camp">{t.mealCamp}</option><option value="packed">{t.packed}</option><option value="outside">{t.outside}</option>
  </select></label>}{selected && <p className="muted">{t.campMealHelp}</p>}</>;
}

export function PlanForm({locale,label,children,reason=false}: {locale:Locale;label:string;children:ReactNode;reason?:boolean}) {
  const [result,dispatch,pending]=useActionState<ItineraryResult|null,FormData>(submitVisitPlan,null);
  const t=visitItineraryCopy[locale];
  return <form action={dispatch} onSubmit={event => {
    event.preventDefault(); if (pending) return;
    const data=new FormData(event.currentTarget); startTransition(() => dispatch(data));
  }}>
    {children}<div className="grid">
      <label><span>{t.actor} *</span><input name="actor" maxLength={160} required /></label>
      <label><span>{reason ? t.reason : t.changeNotes}{reason && " *"}</span><input name="changeNotes" maxLength={1000} required={reason} /></label>
    </div>
    {result && <p className="notice" role="alert">{t[result.status]}</p>}
    <button disabled={pending}>{label}</button>
  </form>;
}
