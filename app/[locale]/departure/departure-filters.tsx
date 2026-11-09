"use client";

import type { ReactNode } from "react";

export function DepartureFilters({ children }: { children: ReactNode }) {
  return <form method="get" onChange={event => {
    const field = event.target;
    if ((field instanceof HTMLSelectElement && field.name === "week") ||
        (field instanceof HTMLInputElement && field.name === "open")) event.currentTarget.requestSubmit();
  }}>{children}</form>;
}
