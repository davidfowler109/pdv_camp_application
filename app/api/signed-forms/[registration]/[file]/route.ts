import { getDatabase } from "../../../../../lib/database";
import { currentRole } from "../../../../../lib/session";
import { panamaDate } from "../../../../../lib/registration";
import { isSignedFormType, signedFormId, signedFormMaxBytes, signedFormMaxFiles, signedFormTypes } from "../../../../../lib/signed-form";

type Context = {params:Promise<{registration:string;file:string}>};
const headers = {"Cache-Control":"private, no-store","X-Content-Type-Options":"nosniff"};

async function authorized() {
  const role = await currentRole();
  return role === "leadership" || role === "registration";
}

async function readFile(request:Request) {
  const reader = request.body?.getReader();
  if (!reader) return null;
  const chunks:Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const {done,value} = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > signedFormMaxBytes) {
        await reader.cancel();
        return null;
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  return Buffer.concat(chunks,size);
}

export async function PUT(request:Request,{params}:Context) {
  if (!await authorized()) return new Response(null,{status:403,headers});
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) return new Response(null,{status:403,headers});
  const {registration,file} = await params;
  if (!signedFormId.test(registration) || !signedFormId.test(file)) return new Response(null,{status:404,headers});
  const type = request.headers.get("content-type") ?? "";
  if (!isSignedFormType(type)) return new Response(null,{status:415,headers});
  if (Number(request.headers.get("content-length")) > signedFormMaxBytes) return new Response(null,{status:413,headers});
  try {
    const bytes = await readFile(request);
    if (!bytes) return new Response(null,{status:413,headers});
    if (!signedFormTypes[type].signature.every((value,index) => bytes[index] === value)) {
      return new Response(null,{status:415,headers});
    }
    const db = await getDatabase();
    const status = await db.transaction(async tx => {
      await tx.query("SELECT purge_expired_signed_forms()");
      const eligible = (await tx.query(
        `SELECT r.id FROM registration r JOIN camp_week w ON w.id=r.week_id
         WHERE r.id=$1 AND r.intake_channel='paper' AND signed_form_expires_on(w.ends_on,r.received_at)>$2 FOR UPDATE OF r`,
        [registration,panamaDate()],
      )).rows.length;
      if (!eligible) return 404;
      const prior = (await tx.query<{matches:boolean}>(
        "SELECT registration_id=$2 AND content_type=$3 AND content=$4 AS matches FROM registration_signed_form WHERE id=$1",
        [file,registration,type,bytes],
      )).rows[0];
      if (prior) return prior.matches ? 204 : 409;
      const count = (await tx.query<{count:number}>(
        "SELECT count(*)::integer AS count FROM registration_signed_form WHERE registration_id=$1",[registration],
      )).rows[0].count;
      if (count >= signedFormMaxFiles) return 409;
      await tx.query("INSERT INTO registration_signed_form(id,registration_id,content_type,content) VALUES($1,$2,$3,$4)",
        [file,registration,type,bytes]);
      return 204;
    });
    return new Response(null,{status,headers});
  } catch {
    return new Response(null,{status:503,headers});
  }
}

export async function GET(_:Request,{params}:Context) {
  if (!await authorized()) return new Response(null,{status:403,headers});
  const {registration,file} = await params;
  if (!signedFormId.test(registration) || !signedFormId.test(file)) return new Response(null,{status:404,headers});
  const db = await getDatabase();
  const result = (await db.query<{content:Uint8Array;content_type:string}>(
    `SELECT f.content,f.content_type FROM registration_signed_form f JOIN registration r ON r.id=f.registration_id
     JOIN camp_week w ON w.id=r.week_id WHERE f.id=$1 AND r.id=$2 AND r.intake_channel='paper'
       AND signed_form_expires_on(w.ends_on,r.received_at)>$3`,[file,registration,panamaDate()],
  )).rows[0];
  if (!result || !isSignedFormType(result.content_type)) return new Response(null,{status:404,headers});
  return new Response(new Uint8Array(result.content),{headers:{
    ...headers,"Content-Type":result.content_type,
    "Content-Disposition":'attachment; filename="signed-form.'+signedFormTypes[result.content_type].extension+'"',
  }});
}
