"use server";

import { redirect } from "next/navigation";
import { getDatabase } from "../../../../lib/database";
import { currentRole } from "../../../../lib/session";
import { saveVisitHousing, type HousingResult } from "../../../../lib/visit-housing";

export async function submitVisitHousing(_:HousingResult|null,form:FormData):Promise<HousingResult> {
  const locale = form.get("locale") === "es" ? "es" : "en";
  if (await currentRole() !== "leadership") redirect("/"+locale);
  let result:HousingResult;
  try {
    const db = await getDatabase();
    result = await db.transaction(tx => saveVisitHousing(tx,form));
  } catch {
    return {status:"unavailable"};
  }
  if (result.status !== "saved") return result;
  redirect("/"+locale+"/church-visits/housing?"+new URLSearchParams({visit:String(form.get("visit")),status:"saved"}));
}
