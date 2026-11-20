"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { currentRole } from "../../../lib/session";
import { getDatabase } from "../../../lib/database";
import { saveCampTransport,type TransportResult } from "../../../lib/camp-transport";
export async function submitCampTransport(_:TransportResult|null,form:FormData):Promise<TransportResult>{
  const locale=form.get("locale")==="es"?"es":"en";
  if(await currentRole()!=="leadership")redirect("/"+locale);
  let result:TransportResult;
  try{const db=await getDatabase();result=await db.transaction(tx=>saveCampTransport(tx,form));}catch{return {status:"unavailable"};}
  if(result.status!=="saved")return result;
  revalidatePath("/[locale]/register","page");revalidatePath("/[locale]/check-in","page");revalidatePath("/[locale]/departure","page");
  redirect("/"+locale+"/transport?"+new URLSearchParams({week:String(form.get("week")),status:"saved"}));
}
