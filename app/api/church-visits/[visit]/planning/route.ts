import { currentRole } from "../../../../../lib/session";
import { getDatabase } from "../../../../../lib/database";
import { visitIdPattern } from "../../../../../lib/church-visits";
import { buildVisitPlanningWorkbook,getVisitPlanningInput } from "../../../../../lib/visit-planning-export";

export const runtime="nodejs";
export async function GET(request:Request,{params}:{params:Promise<{visit:string}>}){
  if(await currentRole()!=="leadership")return new Response("Forbidden",{status:403,headers:{"Cache-Control":"private, no-store"}});
  const {visit}=await params,locale=new URL(request.url).searchParams.get("locale")??"es";
  if(!visitIdPattern.test(visit)||!(["en","es"].includes(locale)))return new Response("Invalid request",{status:400});
  try{
    const db=await getDatabase(),data=await db.transaction(tx=>getVisitPlanningInput(tx,visit));
    if(!data)return new Response("Visit unavailable",{status:404,headers:{"Cache-Control":"private, no-store"}});
    const book=buildVisitPlanningWorkbook(data,locale as "en"|"es");
    const buffer=await book.xlsx.writeBuffer();
    return new Response(new Uint8Array(buffer),{headers:{
      "Content-Type":"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition":`attachment; filename="pdv-trip-planning-${data.visit.start}-${locale}.xlsx"`,
      "Cache-Control":"private, no-store","X-Content-Type-Options":"nosniff",
    }});
  }catch{return new Response("Unable to create workbook",{status:500,headers:{"Cache-Control":"private, no-store"}});}
}
