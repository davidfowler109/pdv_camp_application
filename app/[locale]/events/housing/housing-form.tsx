"use client";

import { startTransition,useActionState,type ReactNode } from "react";
import type { Locale } from "../../../../lib/copy";
import type { EventHousingResult } from "../../../../lib/event-housing";
import { eventHousingCopy } from "../../../../lib/event-housing-copy";
import { submitEventHousing } from "./actions";

export function EventHousingForm({locale,label,children}:{locale:Locale;label:string;children:ReactNode}){
  const [result,dispatch,pending]=useActionState<EventHousingResult|null,FormData>(submitEventHousing,null);
  const t=eventHousingCopy[locale];
  return <form action={dispatch} onSubmit={event=>{
    event.preventDefault();if(pending)return;
    const form=new FormData(event.currentTarget);startTransition(()=>dispatch(form));
  }}>{children}
    <div className="grid"><label><span>{t.actor} *</span><input name="actor" maxLength={160} required /></label>
      <label><span>{t.reason} *</span><input name="reason" maxLength={1000} required /></label></div>
    {result && <p role="alert" className="notice">{t[result.status]}{result.detail && " · "+result.detail}</p>}
    <button disabled={pending}>{label}</button>
  </form>;
}
