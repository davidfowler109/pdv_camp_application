"use server";

import { redirect } from "next/navigation";
import { currentRole } from "../../../../lib/session";
import { getDatabase } from "../../../../lib/database";
import { saveEventHousing,type EventHousingResult } from "../../../../lib/event-housing";

export async function submitEventHousing(_:EventHousingResult|null,form:FormData):Promise<EventHousingResult>{
  const locale=form.get("locale")==="es" ? "es" : "en";
  if(await currentRole()!=="leadership")redirect("/"+locale);
  let result:EventHousingResult;
  try{const db=await getDatabase();result=await db.transaction(tx=>saveEventHousing(tx,form));}catch{return {status:"unavailable"};}
  if(result.status!=="saved")return result;
  redirect("/"+locale+"/events/housing?"+new URLSearchParams({event:String(form.get("event")),status:"saved"}));
}
