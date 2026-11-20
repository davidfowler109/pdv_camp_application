import { getDatabase } from '../../../../lib/database';
import { applicationId,hasApplicationToken,applicationEvent,type StaffApplication } from '../../../../lib/staff-application';
import { applicationJson } from '../../../../lib/staff-application-request';
const headers={'Cache-Control':'private, no-store','Referrer-Policy':'no-referrer'};
export async function POST(request:Request){
  if(process.env.PDV_LOCAL_DEMO!=='1'||request.headers.get('origin')!==new URL(request.url).origin)return new Response(null,{status:403,headers});
  try{
    if(Number(request.headers.get('content-length'))>20000)return new Response(null,{status:413,headers});
    const body=await applicationJson(request,20000),data:Record<string,string>={};
    if(!applicationId.test(body.id??''))return new Response(null,{status:404,headers});
    for(const key of ['refName','refContact','refRelationship','refExperience','refReliability','refConcerns','refRecommend','refSignature']){
      const value=body.data?.[key];if(typeof value!=='string'||!value.trim()||value.length>2000)return new Response(null,{status:400,headers});data[key]=value.trim();
    }
    if(!['yes','no','unknown'].includes(data.refRecommend))return new Response(null,{status:400,headers});
    const db=await getDatabase();const status=await db.transaction(async tx=>{
      const app=(await tx.query<StaffApplication>('SELECT * FROM staff_application WHERE id=$1 FOR UPDATE',[body.id])).rows[0];
      if(!app||!hasApplicationToken(app,body.key??'','reference')||['draft','declined','withdrawn'].includes(app.status)||app.ready)return 404;
      await tx.query("UPDATE staff_application SET reference=$2::jsonb,reference_received_at=CURRENT_TIMESTAMP,reference_hash=NULL,reference_expires=NULL,revision=revision+1,updated_at=CURRENT_TIMESTAMP WHERE id=$1",[app.id,JSON.stringify(data)]);
      await applicationEvent(tx,app.id,'referenceReceived',data.refName,'Direct private reference response',{contact:data.refContact,previous:app.reference});return 204;
    });return new Response(null,{status,headers});
  }catch(error){return new Response(null,{status:error instanceof RangeError?413:error instanceof SyntaxError?400:503,headers});}
}
