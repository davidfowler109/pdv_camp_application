import type {Database} from './database';
import {campOverview} from './camp-overview';

export const summaryFields=['worked','improve','changes','nextYear'] as const;
export type SummaryField=typeof summaryFields[number];
export type ReviewNote={id:string;date:string;kind:'worked'|'improve'|'idea';text:string;author:string};
export type ReviewAction={id:string;text:string;owner:string;state:'open'|'done'};
export type ReviewBody={summary:Record<SummaryField,string>;notes:ReviewNote[];actions:ReviewAction[]};
export type ReviewTarget={scope:string;week:number|null;season:number|null};
export type CampReview={scope:string;revision:number;state:'draft'|'reviewed';body:ReviewBody;metrics:Record<string,number>|null;updated_by:string;updated_at:string|null;reviewed_by:string|null;reviewed_at:string|null};
export function reviewTarget(week:unknown,season:unknown):ReviewTarget|null {
 if(week&&season)return null;
 if(typeof week==='string'&&/^[1-9]\d{0,9}$/.test(week)&&Number(week)<=2147483647)return {scope:'week:'+Number(week),week:Number(week),season:null};
 if(typeof season==='string'&&/^20\d\d$/.test(season))return {scope:'season:'+season,week:null,season:Number(season)};
 return null;
}
export function emptyReview(target:ReviewTarget):CampReview {
 return {scope:target.scope,revision:0,state:'draft',body:{summary:{worked:'',improve:'',changes:'',nextYear:''},notes:[],actions:[]},metrics:null,updated_by:'',updated_at:null,reviewed_by:null,reviewed_at:null};
}
const uuid=(s:unknown)=>typeof s==='string'&&/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(s);
const text=(s:unknown,max:number)=>typeof s==='string'&&s.length<=max;
const date=(s:unknown)=>typeof s==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(s)&&!Number.isNaN(Date.parse(s))&&new Date(s).toISOString().slice(0,10)===s;
export function validReviewBody(body:unknown):body is ReviewBody {
 if(!body||typeof body!=='object')return false;
 const b=body as ReviewBody;
 return !!b.summary&&summaryFields.every(k=>text(b.summary[k],8000))&&Array.isArray(b.notes)&&b.notes.length<=100&&Array.isArray(b.actions)&&b.actions.length<=100&&
  b.notes.every(n=>n&&uuid(n.id)&&date(n.date)&&['worked','improve','idea'].includes(n.kind)&&text(n.text,4000)&&n.text.trim()&&text(n.author,100)&&n.author.trim())&&
  b.actions.every(a=>a&&uuid(a.id)&&text(a.text,2000)&&a.text.trim()&&text(a.owner,100)&&['open','done'].includes(a.state))&&
  new Set(b.notes.map(n=>n.id)).size===b.notes.length&&new Set(b.actions.map(a=>a.id)).size===b.actions.length;
}
export async function targetExists(db:Database,t:ReviewTarget) {
 return (await db.query(t.week?'SELECT 1 FROM camp_week WHERE id=$1':"SELECT 1 FROM camp_week WHERE extract(year FROM starts_on)=$1 LIMIT 1",[t.week??t.season])).rows.length>0;
}
export async function loadReview(db:Database,t:ReviewTarget):Promise<CampReview> {
 return (await db.query<CampReview>('SELECT scope,revision,state,body,metrics,updated_by,updated_at::text,reviewed_by,reviewed_at::text FROM camp_after_action_review WHERE scope=$1',[t.scope])).rows[0]??emptyReview(t);
}
export async function reviewMetrics(db:Database,t:ReviewTarget) {
 const weeks=(await campOverview(db)).filter(w=>t.week?w.id===t.week:w.start?.slice(0,4)===String(t.season));
 return Object.fromEntries(['registered','confirmed','arrived','atCamp','departed'].map(key=>[key,weeks.reduce((n,w)=>n+w[key as 'arrived'],0)]));
}
export async function saveReview(db:Database,t:ReviewTarget,input:{revision:number;operation:string;actor:string;body?:unknown;confirmed?:boolean}) {
 if(!Number.isSafeInteger(input.revision)||input.revision<0||typeof input.actor!=='string'||!input.actor.trim()||input.actor.length>100||!['save','review','reopen','delete'].includes(input.operation))return 'invalid';
 if(!await targetExists(db,t))return 'invalid';
 // Serialize both first creation and subsequent edits, without creating a record on a GET.
 if(t.week)await db.query('SELECT id FROM camp_week WHERE id=$1 FOR UPDATE',[t.week]);
 else await db.query('SELECT id FROM camp_week WHERE extract(year FROM starts_on)=$1 ORDER BY id FOR UPDATE',[t.season]);
 const existing=await loadReview(db,t);
 if(existing.revision!==input.revision)return 'stale';
 if(input.operation==='delete'){
  if(!input.confirmed||!existing.revision||existing.state!=='draft')return 'invalid';
  await db.query('DELETE FROM camp_after_action_review WHERE scope=$1',[t.scope]);return 'deleted';
 }
 if(input.operation==='reopen'){
  if(existing.state!=='reviewed')return 'invalid';
  await db.query("UPDATE camp_after_action_review SET state='draft',revision=nextval('camp_review_revision'),reviewed_at=NULL,reviewed_by=NULL,updated_by=$2,updated_at=CURRENT_TIMESTAMP WHERE scope=$1",[t.scope,input.actor.trim()]);return 'saved';
 }
 if(existing.state==='reviewed')return 'reopenRequired';
 if(!validReviewBody(input.body))return 'invalid';
 const b=input.body;
 if(input.operation==='review'&&!summaryFields.some(k=>b.summary[k].trim()))return 'summaryRequired';
 const body:ReviewBody={summary:Object.fromEntries(summaryFields.map(k=>[k,b.summary[k].trim()])) as ReviewBody['summary'],notes:b.notes.map(n=>({id:n.id,date:n.date,kind:n.kind,text:n.text.trim(),author:n.author.trim()})),actions:b.actions.map(a=>({id:a.id,text:a.text.trim(),owner:a.owner.trim(),state:a.state}))};
 const reviewed=input.operation==='review',metrics=reviewed?await reviewMetrics(db,t):existing.metrics;
 await db.query(`INSERT INTO camp_after_action_review(scope,week_id,season,revision,state,body,metrics,updated_by,reviewed_by,reviewed_at)
  VALUES($1,$2,$3,nextval('camp_review_revision'),$4,$5::jsonb,$6::jsonb,$7,CASE WHEN $8 THEN $7 ELSE NULL END,CASE WHEN $8 THEN CURRENT_TIMESTAMP ELSE NULL END)
  ON CONFLICT(scope) DO UPDATE SET revision=excluded.revision,state=excluded.state,body=excluded.body,metrics=excluded.metrics,updated_by=excluded.updated_by,updated_at=CURRENT_TIMESTAMP,reviewed_by=excluded.reviewed_by,reviewed_at=excluded.reviewed_at`,
 [t.scope,t.week,t.season,reviewed?'reviewed':'draft',JSON.stringify(body),JSON.stringify(metrics),input.actor.trim(),reviewed]);
 return reviewed?'reviewed':'saved';
}
