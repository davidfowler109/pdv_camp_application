"use client";

import type { ReactNode } from "react";

export function HealthFilterForm({children}: {children:ReactNode}) {
  return <form method="get" className="roster-filters" onChange={event => {
    if (event.target instanceof HTMLSelectElement) event.currentTarget.requestSubmit();
  }}>
    {children}
  </form>;
}
