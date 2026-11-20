"use client";
import { startTransition,useActionState,type ReactNode } from "react";
import type { Locale } from "../../../lib/copy";
import type { TransportResult } from "../../../lib/camp-transport-options";
import { campTransportCopy } from "../../../lib/camp-transport-copy";
import { AppForm } from "../app-form";
import { submitCampTransport } from "./actions";
export function TransportForm({locale,label,children}:{locale:Locale;label:string;children:ReactNode}){
  const [result,dispatch,pending]=useActionState<TransportResult|null,FormData>(submitCampTransport,null),t=campTransportCopy[locale];
  return <AppForm busy={pending} action={dispatch} onSubmit={event=>{event.preventDefault();if(pending)return;const data=new FormData(event.currentTarget);startTransition(()=>dispatch(data));}}>
    {children}<div className="grid"><label><span>{t.actor} *</span><input name="actor" maxLength={160} required/></label>
      <label><span>{t.reason} *</span><input name="reason" maxLength={1000} required/></label></div>
    {result&&<p className="notice" role="alert">{t[result.status]}</p>}<button disabled={pending}>{label}</button>
  </AppForm>;
}
