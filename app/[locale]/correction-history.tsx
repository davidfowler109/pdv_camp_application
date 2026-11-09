import { getDatabase } from "../../lib/database";
import type { Locale } from "../../lib/copy";
import { checkInCopy } from "../../lib/check-in-copy";
import { departureCopy } from "../../lib/departure-copy";

export async function CorrectionHistory({ id, locale, kind }: { id:string; locale:Locale; kind:"arrival"|"departure" }) {
  const db = await getDatabase();
  const { rows } = await db.query<{id:string;operation:"correctArrival"|"undoArrival"|"undoBoarding"|"correctDeparture";reason:string;recorded_by:string;recorded_at:Date}>(
    "SELECT id,operation,reason,recorded_by,recorded_at FROM camper_operation_correction WHERE registration_id=$1 AND operation=ANY($2::text[]) ORDER BY id DESC",
    [id,kind === "arrival" ? ["correctArrival","undoArrival"] : ["undoBoarding","correctDeparture"]],
  );
  if (!rows.length) return null;
  const labels = {...checkInCopy[locale],...departureCopy[locale]};
  const format = new Intl.DateTimeFormat(locale,{dateStyle:"medium",timeStyle:"short",timeZone:"America/Panama"});
  return <details><summary>{locale === "en" ? "Correction history" : "Historial de correcciones"}</summary>
    <ul>{rows.map(row => <li key={row.id}>{labels[row.operation]} · {row.recorded_by} · {format.format(new Date(row.recorded_at))} · {row.reason}</li>)}</ul>
  </details>;
}
