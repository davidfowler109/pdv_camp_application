"use client";

import { startTransition, useActionState } from "react";
import type { Locale } from "../../../lib/copy";
import type { VisitorResult } from "../../../lib/church-visitors";
import { churchVisitorCopy } from "../../../lib/church-visitor-copy";
import { updateVisitorStatus } from "./registration-actions";

export function VisitorStatusForm({locale,visit,id,revision,withdrawn}: {
  locale:Locale; visit:string; id:string; revision:number; withdrawn:boolean;
}) {
  const t = churchVisitorCopy[locale];
  const [result,dispatch,pending] = useActionState<VisitorResult,FormData>(updateVisitorStatus,null);
  if (result === "saved") return <p role="status">{t.saved}{" "}<a href={"/"+locale+"/church-visits/visitors?visit="+visit+"&visitor="+id}>{t.review}</a></p>;
  return <form action={dispatch} onSubmit={event => {
    event.preventDefault();
    if (pending) return;
    const data = new FormData(event.currentTarget);
    startTransition(() => dispatch(data));
  }}>
    <input name="visit" type="hidden" value={visit} /><input name="id" type="hidden" value={id} />
    <input name="revision" type="hidden" value={revision} /><input name="operation" type="hidden" value={withdrawn ? "restore" : "withdraw"} />
    <div className="grid">
      <label><span>{t.recorder} *</span><input name="recorder" maxLength={160} required /></label>
      <label><span>{t.reason} *</span><input name="reason" maxLength={1000} required /></label>
    </div>
    {result && <p className="notice" role="alert">{t[result]}</p>}
    <button disabled={pending}>{withdrawn ? t.restore : t.withdraw}</button>
  </form>;
}
