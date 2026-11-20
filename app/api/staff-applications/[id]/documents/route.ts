import { randomUUID } from 'node:crypto';
import { getDatabase } from '../../../../../lib/database';
import { currentRole } from '../../../../../lib/session';
import { applicationId,hasApplicationToken,applicationEvent,removeStaffDocument,applicationWeeks,type StaffApplication } from '../../../../../lib/staff-application';
import { ageOn } from '../../../../../lib/registration';
import { applicationJson } from '../../../../../lib/staff-application-request';
import { isSignedFormType,signedFormTypes,signedFormMaxBytes } from '../../../../../lib/signed-form';
type Context={params:Promise<{id:string}>};
const headers={'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'};
export async function GET(request:Request,{params}:Context){
  const {id}=await params,q=new URL(request.url).searchParams,file=q.get('file');if(!applicationId.test(id)||(file&&!applicationId.test(file)))return new Response(null,{status:404,headers});
  const staff=await currentRole()==='leadership',db=await getDatabase(),app=(await db.query<StaffApplication>('SELECT * FROM staff_application WHERE id=$1',[id])).rows[0];
  if(!app)return new Response(null,{status:404,headers});
  if(!staff&&(process.env.PDV_LOCAL_DEMO!=='1'||!hasApplicationToken(app,q.get('key')??'','resume')))return new Response(null,{status:403,headers});
  if(!file){
    const docs=(await db.query<{id:string;category:string;source:string;filename:string}>("SELECT id,category,source,filename FROM staff_application_document WHERE application_id=$1 AND removed_at IS NULL AND ($2 OR (category<>'reference' AND recorded_by='Applicant or authorized guardian')) ORDER BY recorded_at,id",[id,staff])).rows;
    return Response.json({docs,revision:app.revision},{headers});
  }
  const selectedRules=app.requested_role==='equipante'&&app.preparation.campRulesRequired==='yes'&&app.preparation.campRulesSource==='file'?app.preparation.campRulesFile:null;
  const doc=(await db.query<{content:Uint8Array;content_type:string;category:string}>("SELECT content,content_type,category FROM staff_application_document WHERE id=$1 AND application_id=$2 AND removed_at IS NULL AND ($3 OR (category<>'reference' AND recorded_by='Applicant or authorized guardian') OR (id=$4::uuid AND category='rules'))",[file,id,staff,selectedRules])).rows[0];
  if(!doc||!isSignedFormType(doc.content_type))return new Response(null,{status:404,headers});
  return new Response(new Uint8Array(doc.content),{headers:{...headers,'Content-Type':doc.content_type,'Content-Disposition':(doc.category==='rules'?'inline':'attachment')+'; filename="staff-document.'+signedFormTypes[doc.content_type].extension+'"'}});
}
export async function POST(request:Request,{params}:Context){
  if(process.env.PDV_LOCAL_DEMO!=='1'||request.headers.get('origin')!==new URL(request.url).origin)return new Response(null,{status:403,headers});
  const {id}=await params;if(!applicationId.test(id))return new Response(null,{status:404,headers});
  // Bound the entire multipart request before parsing any file contents.
  const reader=request.body?.getReader();if(!reader)return new Response(null,{status:400,headers});
  const chunks:Uint8Array[]=[];let size=0;
  try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>signedFormMaxBytes+65536){await reader.cancel();return new Response(null,{status:413,headers});}chunks.push(value);}}finally{reader.releaseLock();}
  try{
    const form=await new Response(new Uint8Array(Buffer.concat(chunks)),{headers:{'Content-Type':request.headers.get('content-type')??''}}).formData();
    const file=form.get('file'),category=String(form.get('category')??''),source=String(form.get('source')??'').trim();
    if(!(file instanceof File)||!isSignedFormType(file.type)||file.size<1||file.size>signedFormMaxBytes||!source||source.length>500||!['reference','guardian','policy','background','rules'].includes(category))return new Response(null,{status:400,headers});
    if(category==='rules'&&file.type!=='application/pdf')return new Response(null,{status:415,headers});
    const type=file.type,content=Buffer.from(await file.arrayBuffer());if(!signedFormTypes[type].signature.every((byte,index)=>content[index]===byte))return new Response(null,{status:415,headers});
    const staff=await currentRole()==='leadership',db=await getDatabase();
    const uploadedId=randomUUID();
    const status=await db.transaction(async tx=>{
      const app=(await tx.query<StaffApplication>('SELECT * FROM staff_application WHERE id=$1 FOR UPDATE',[id])).rows[0];
      if(!app)return 404;
      if(app.status==='withdrawn')return 409;
      if(category==='rules'&&(!staff||app.requested_role!=='equipante'))return 403;
      if(!staff&&(!hasApplicationToken(app,String(form.get('key')??''),'resume')||category==='reference'||app.status!=='approved'||app.ready))return 403;
      if(!staff&&app.requested_role!=='guide'){
        if(category==='background'&&app.preparation.backgroundDocumentRequired!=='yes')return 403;
        if(category==='policy'&&app.preparation.signedPolicyRequired!=='yes')return 403;
        if(category==='guardian'){
          const first=(await applicationWeeks(tx,app.season)).find(week=>(app.data.weeks??'').split(',').includes(String(week.id)));
          if(!first||ageOn(app.data.birth,first.start)===null||ageOn(app.data.birth,first.start)!>=18)return 403;
        }
      }
      if(Number((await tx.query<{n:number}>('SELECT count(*)::integer n FROM staff_application_document WHERE application_id=$1 AND removed_at IS NULL',[id])).rows[0].n)>=12)return 409;
      const filename=file.name.replace(/[\\/\u0000-\u001f\u007f]/g,'').slice(0,160);
      await tx.query('INSERT INTO staff_application_document(id,application_id,category,content_type,content,source,recorded_by,filename) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',[uploadedId,id,category,type,content,source,staff?'Camp Leadership (local pilot)':'Applicant or authorized guardian',filename]);
      await applicationEvent(tx,id,'documentUploaded',staff?'Camp Leadership (local pilot)':'Applicant or authorized guardian',source,{category});return 204;
    });return category==='rules'&&status===204?Response.json({id:uploadedId},{status:201,headers}):new Response(null,{status,headers});
  }catch{return new Response(null,{status:503,headers});}
}
export async function DELETE(request:Request,{params}:Context){
  if(process.env.PDV_LOCAL_DEMO!=='1'||request.headers.get('origin')!==new URL(request.url).origin)return new Response(null,{status:403,headers});
  const {id}=await params;if(!applicationId.test(id))return new Response(null,{status:404,headers});
  try{
    const body=await applicationJson(request,8192);
    if(!applicationId.test(body.file??'')||body.confirmed!==true||typeof body.reason!=='string'||body.reason.length>2000)return Response.json({status:'invalid'},{status:400,headers});
    const staff=await currentRole()==='leadership',db=await getDatabase();
    return await db.transaction(async tx=>{
      const app=(await tx.query<StaffApplication>('SELECT * FROM staff_application WHERE id=$1 FOR UPDATE',[id])).rows[0];
      if(!app)return new Response(null,{status:404,headers});
      if(!staff&&!hasApplicationToken(app,body.key??'','resume'))return new Response(null,{status:403,headers});
      if(app.revision!==body.revision)return Response.json({status:'stale'},{status:409,headers});
      const status=await removeStaffDocument(tx,app,body.file,staff,body.reason.trim()||'Removed incorrect or unwanted upload');
      return Response.json({status,revision:app.revision+1},{status:status==='saved'?200:status==='forbidden'?403:status==='notFound'?404:400,headers});
    });
  }catch(error){return Response.json({status:'unavailable'},{status:error instanceof RangeError?413:503,headers});}
}
