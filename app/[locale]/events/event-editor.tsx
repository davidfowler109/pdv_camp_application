"use client";

import { startTransition, useActionState, type ReactNode } from "react";
import type { Locale } from "../../../lib/copy";
import { facilitiesCopy } from "../../../lib/facilities-copy";
import { submitEvent, type EventSaveError } from "./actions";

export function EventEditor({ locale, children }: {locale:Locale;children:ReactNode}) {
  const t = facilitiesCopy[locale];
  const [result, dispatch, pending] = useActionState<EventSaveError|null,FormData>(submitEvent,null);
  return <form action={dispatch} onSubmit={event => {
    event.preventDefault();
    if (pending) return;
    const data = new FormData(event.currentTarget);
    startTransition(() => dispatch(data));
  }}>
    {children}
    {result && <p className="notice" role="alert">{t[result.status]}{result.detail ? " · "+result.detail : ""}</p>}
    <button disabled={pending}>{t.save}</button>
  </form>;
}
