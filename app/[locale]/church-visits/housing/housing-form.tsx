"use client";

import { startTransition, useActionState, type ReactNode } from "react";
import type { Locale } from "../../../../lib/copy";
import type { HousingResult } from "../../../../lib/visit-housing";
import { visitHousingCopy } from "../../../../lib/visit-housing-copy";
import { submitVisitHousing } from "./actions";

export function HousingForm({locale,label,children}: {locale:Locale;label:string;children:ReactNode}) {
  const [result,dispatch,pending] = useActionState<HousingResult|null,FormData>(submitVisitHousing,null);
  const t = visitHousingCopy[locale];
  return <form action={dispatch} onSubmit={event => {
    event.preventDefault();
    if (pending) return;
    const data = new FormData(event.currentTarget);
    startTransition(() => dispatch(data));
  }}>
    {children}
    {result && <p className="notice" role="alert">{t[result.status]}{result.detail && " · "+result.detail}</p>}
    <button disabled={pending}>{label}</button>
  </form>;
}
