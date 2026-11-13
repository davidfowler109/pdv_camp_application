"use client";

import type { Locale } from "../../../../lib/copy";
import { visitItineraryCopy } from "../../../../lib/visit-itinerary-copy";

export function PrintEstimate({locale}: {locale:Locale}) {
  return <button type="button" className="no-print" onClick={() => window.print()}>{visitItineraryCopy[locale].print}</button>;
}
