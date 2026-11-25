import {getDatabase} from '../../../lib/database';
import {currentRole} from '../../../lib/session';
import {reviewTarget,saveReview,loadReview} from '../../../lib/camp-reviews';

export const runtime='nodejs';
const reply=(body:unknown,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'private, no-store'}});
export async function POST(request:Request) {
 if(await currentRole()!=='leadership')return reply({status:'denied'},403);
 if(request.headers.get('origin')!==new URL(request.url).origin)return reply({status:'denied'},403);
 let input;
 try {const raw=await request.text();if(raw.length>256000)return reply({status:'invalid'},413);input=JSON.parse(raw);}catch{return reply({status:'invalid'},400);}
 if(!input||typeof input!=='object')return reply({status:'invalid'},400);
 const target=reviewTarget(input.week,input.season);
 if(!target)return reply({status:'invalid'},400);
 try{
  const db=await getDatabase();
  const status=await db.transaction(tx=>saveReview(tx,target,input));
  if(!['saved','reviewed','deleted'].includes(status))return reply({status},status==='stale'?409:400);
  return reply({status,record:status==='deleted'?null:await loadReview(db,target)});
 }catch{return reply({status:'unavailable'},503);}
}
