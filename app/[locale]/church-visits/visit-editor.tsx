"use client";

import { startTransition, useActionState, type ReactNode } from "react";
import type { Locale } from "../../../lib/copy";
import type { VisitSaveResult } from "../../../lib/church-visits";
import { churchVisitsCopy } from "../../../lib/church-visits-copy";
import { submitVisit } from "./actions";

export function VisitEditor({locale, cancel = false, children}: {locale: Locale; cancel?: boolean; children: ReactNode}) {
  const [result, dispatch, pending] = useActionState<VisitSaveResult|null,FormData>(submitVisit,null);
  const t = churchVisitsCopy[locale];
  return <form action={dispatch} onSubmit={event => {
    event.preventDefault();
    if (pending) return;
    const data = new FormData(event.currentTarget);
    startTransition(() => dispatch(data));
  }}>
    {children}
    {result && <p className="notice" role="alert">{t[result.status]}{result.detail && " · "+result.detail}</p>}
    <button disabled={pending}>{cancel ? t.cancel : t.save}</button>
  </form>;
}
