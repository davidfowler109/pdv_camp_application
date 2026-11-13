"use server";

import { redirect } from "next/navigation";
import { currentRole } from "../../../../lib/session";
import { getDatabase } from "../../../../lib/database";
import { saveVisitPlan, type ItineraryResult } from "../../../../lib/visit-itinerary";

export async function submitVisitPlan(_:ItineraryResult|null,form:FormData):Promise<ItineraryResult> {
  const locale=form.get("locale")==="es" ? "es" : "en";
  if (await currentRole()!=="leadership") redirect("/"+locale);
  let result:ItineraryResult;
  try { const db=await getDatabase(); result=await db.transaction(tx => saveVisitPlan(tx,form)); }
  catch { return {status:"unavailable"}; }
  if (result.status!=="saved") return result;
  const query=new URLSearchParams({visit:String(form.get("visit")),status:"saved"});
  if (result.day) query.set("day",result.day);
  redirect("/"+locale+"/church-visits/itinerary?"+query);
}
