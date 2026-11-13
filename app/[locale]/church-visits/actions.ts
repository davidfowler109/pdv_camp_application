"use server";

import { redirect } from "next/navigation";
import { getDatabase } from "../../../lib/database";
import { currentRole } from "../../../lib/session";
import { visitIdPattern, writeChurchVisit, type VisitSaveResult } from "../../../lib/church-visits";

export async function submitVisit(_: VisitSaveResult|null, form: FormData): Promise<VisitSaveResult> {
  const locale = form.get("locale") === "en" ? "en" : "es";
  if (await currentRole() !== "leadership") redirect("/"+locale);
  let result: VisitSaveResult;
  try {
    const db = await getDatabase();
    result = await db.transaction(tx => writeChurchVisit(tx,form));
  } catch {
    return {status:"unavailable"};
  }
  if (result.status !== "saved") return result;
  const id = String(form.get("id") ?? "");
  const query = new URLSearchParams({status:"saved"});
  if (visitIdPattern.test(id)) query.set("visit",id);
  redirect("/"+locale+"/church-visits?"+query);
}
