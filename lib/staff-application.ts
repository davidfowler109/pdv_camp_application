import {staffScreeningProblems} from './staff-screening.ts';
import {campRulesAcknowledged,campRulesConfigurationProblems} from './camp-rules.ts';
import { createHash,randomBytes } from "node:crypto";
import type { Database } from "./database.ts";
import { ageOn,dateParts } from "./registration.ts";
import { volunteerFields,volunteerScreeningFields,volunteerProblems } from './volunteer-application.ts';

export const applicationId=/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i;
export const staffApplicationSearchWhere="WHERE ($1::text IS NULL OR (CASE WHEN ready THEN 'ready' WHEN status='approved' AND NULLIF(data->>'preparationSubmittedAt','') IS NOT NULL THEN 'preparationReceived' ELSE status END)=$1) AND ($2::integer IS NULL OR season=$2) AND concat_ws(' ',data->>'first',data->>'last') ILIKE '%'||$3||'%'";
export const applicationRoles=['guide','equipante','volunteer'] as const;
export const tokenHash=(token:string)=>createHash('sha256').update(token).digest('hex');
export const newApplicationToken=()=>randomBytes(32).toString('base64url');
export const applicationFields=['first','last','birth','gender','email','phone','address','church','pastor','pastorEmail','pastorPhone','testimony','motivation','experience','skills','volunteerAreas','weeks','training','celebration','sharing','dataSigner','dataAuthority','referencePermission','truth','food','foodDetails','diet','dietDetails','medication','medicationDetails','medicationAllergy','medicationAllergyDetails','accommodation','accommodationDetails','emergency','emergencyPhone','shirt','guardian','guardianRelationship','guardianPermission','conduct','campRulesAcknowledgment','counselorRulesAccepted','feeAcknowledgment',...volunteerFields] as const;
export type ApplicationData=Record<string,string>;
export type ApplicationSeason={season:number;fee_cents:number;shirt_cents:number;due_on:string|null;training_start:string|null;training_end:string|null;celebration_on:string|null};
export async function applicationSeasons(db:Database){
  return (await db.query<ApplicationSeason>("SELECT season,fee_cents,shirt_cents,due_on::text,training_start::text,training_end::text,celebration_on::text FROM staff_application_season ORDER BY season")).rows;
}
export type StaffApplication={id:string;season:number;requested_role:typeof applicationRoles[number];status:string;data:ApplicationData;public_note:string;preparation:ApplicationData;revision:number;resume_hash:string;resume_expires:Date|string;reference_hash:string|null;reference_expires:Date|string|null;reference:ApplicationData|null;reference_received_at:Date|null;staff_id:number|null;ready:boolean;staff_review_required?:boolean;updated_at:Date};
export function cleanApplicationData(input:unknown):ApplicationData|null {
  if(!input||typeof input!=='object'||Array.isArray(input))return null;
  const result:ApplicationData={};
  for(const key of applicationFields){const value=(input as Record<string,unknown>)[key];if(value!==undefined){if(typeof value!=='string'||value.length>3000)return null;result[key]=value.trim();}}
  for(const key of ['food','diet','medication','medicationAllergy','accommodation'])if(result[key]!=='yes')delete result[key+'Details'];
  for(const key of volunteerScreeningFields){if(result[key]!=='yes'){delete result[key+'Details'];delete result[key+'Private'];}else if(result[key+'Private']==='yes')delete result[key+'Details'];}
  return result;
}
export function hasApplicationToken(app:StaffApplication,token:string,kind:'resume'|'reference',now=new Date()){
  const expiry=kind==='resume'?app.resume_expires:app.reference_expires;
  const hash=kind==='resume'?app.resume_hash:app.reference_hash;
  return /^[a-zA-Z0-9_-]{43}$/.test(token)&&Boolean(expiry&&hash&&new Date(expiry)>now&&tokenHash(token)===hash);
}
export async function applicationWeeks(db:Database,season:number){
  return (await db.query<{id:number;name:string;start:string;end:string}>("SELECT id,name,starts_on::text AS start,ends_on::text AS end FROM camp_week WHERE extract(year FROM starts_on)=$1 ORDER BY starts_on,id",[season])).rows;
}
export async function applicationProblems(db:Database,app:Pick<StaffApplication,'data'|'season'|'requested_role'>){
  const d=app.data,missing:string[]=[];
  for(const key of ['first','last','birth','email','phone','address','church','pastor','testimony','motivation','experience','skills'])if(!d[key])missing.push(key);
  if(d.email&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(d.email))missing.push('email');
  if((d.first?.length??0)+(d.last?.length??0)>98)missing.push('name');
  if(!['female','male'].includes(d.gender))missing.push('gender');
  if(!d.pastorEmail&&!d.pastorPhone)missing.push('pastorContact');
  if(d.pastorEmail&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(d.pastorEmail))missing.push('pastorEmail');
  for(const key of ['sharing','referencePermission','truth'])if(d[key]!=='yes')missing.push(key);
  const available=await applicationWeeks(db,app.season),selected=(d.weeks??'').split(',').filter(Boolean);
  if(!selected.length||selected.some(id=>!available.some(w=>String(w.id)===id)))missing.push('weeks');
  const start=available.find(w=>selected.includes(String(w.id)))?.start;
  const age=start?ageOn(d.birth,start):null;
  if(!dateParts(d.birth??'')||age===null||age<0||age>110||(app.requested_role==='guide'&&age<18)||(app.requested_role==='equipante'&&age<15))missing.push('age');
  if(app.requested_role==='volunteer'&&(!(d.volunteerAreas??'').split(',').some(x=>['health','kitchen','program'].includes(x))||(d.volunteerAreas??'').split(',').some(x=>!['health','kitchen','program'].includes(x))))missing.push('volunteerAreas');
  if(app.requested_role==='guide')missing.push(...staffScreeningProblems(d,age!==null&&age>=18));
  if(app.requested_role==='volunteer')missing.push(...volunteerProblems(d,age!==null&&age>=18));
  return [...new Set(missing)];
}
export async function applicantPreparationProblems(db:Database,app:Pick<StaffApplication,'data'|'season'|'requested_role'>&{preparation?:ApplicationData}){
  const d=app.data,required:string[]=[],volunteer=app.requested_role==='volunteer';
  const first=(await applicationWeeks(db,app.season)).find(w=>(d.weeks??'').split(',').includes(String(w.id)));
  const age=first?ageOn(d.birth,first.start):null;
  if(age===null)return ['weeks'];
  if(volunteer)required.push(...volunteerProblems(d,age>=18));
  if(app.requested_role==='guide')required.push(...staffScreeningProblems(d,age>=18));
  if(age<18&&(!d.guardian||!d.guardianRelationship||d.guardianPermission!=='yes'))required.push('guardianPermission');
  for(const key of ['food','diet','medication','medicationAllergy','accommodation'])if(!['none','yes','unknown'].includes(d[key])||(d[key]==='yes'&&!d[key+'Details']))required.push(key);
  for(const key of ['emergency','emergencyPhone','shirt'])if(!d[key])required.push(key);
  if(app.requested_role==='guide'&&d.conduct!=='yes')required.push('conduct');
  if(app.requested_role==='equipante'&&app.preparation?.campRulesRequired==='yes'&&!campRulesAcknowledged(app.preparation,d))required.push('campRulesWaiting');
  return required;
}
export async function campRulesDocumentProblems(db:Database,app:Pick<StaffApplication,'id'|'requested_role'|'preparation'>){
 if(app.requested_role!=='equipante'||app.preparation.campRulesRequired!=='yes')return [];
 const problems=campRulesConfigurationProblems(app.preparation);
 if(!problems.length&&app.preparation.campRulesSource==='file'&&!(await db.query("SELECT 1 FROM staff_application_document WHERE id=$1 AND application_id=$2 AND category='rules' AND content_type='application/pdf' AND removed_at IS NULL",[app.preparation.campRulesFile,app.id])).rows.length)problems.push('campRulesFile');
 return problems;
}
export async function preparationProblems(db:Database,app:StaffApplication){
  const d=app.data,p=app.preparation,volunteer=app.requested_role==='volunteer';
  const required=volunteer?['volunteerScreeningReview','qualifications']:app.requested_role==='equipante'?['reference','counselorReview','counselorOrientation','qualifications']:['reference','guideScreeningReview','screening','training','policy','qualifications'];
  if(app.requested_role==='equipante')required.push('fees');
  required.push(...await campRulesDocumentProblems(db,app));
  if(volunteer||app.requested_role==='equipante'){
    if(p.referenceRequired==='yes')required.push('reference');
    if(p.backgroundDocumentRequired==='yes'){
      required.push('screening');
      if(!(await db.query("SELECT 1 FROM staff_application_document WHERE application_id=$1 AND category='background' AND removed_at IS NULL LIMIT 1",[app.id])).rows.length)required.push('backgroundDocumentRequired');
    }
    if(p.signedPolicyRequired==='yes'){required.push('policy');if(!p.requiredPolicyName)required.push('requiredPolicyName');}
    if(p.trainingRequired==='yes')required.push('training');
  }
  const weeks=await applicationWeeks(db,app.season),first=weeks.find(w=>(d.weeks??'').split(',').includes(String(w.id)));
  if(!first||ageOn(d.birth,first.start)===null)return ['weeks'];
  required.push(...await applicantPreparationProblems(db,app));
  if(ageOn(d.birth,first.start)!<18)required.push('guardian');
  if(!p.screeningNotes)required.push(volunteer?'volunteerScreeningNotes':app.requested_role==='equipante'?'counselorReviewNotes':'screeningNotes');
  if((!volunteer||p.referenceRequired==='yes')&&!app.reference&&p.reference==='yes'&&!p.referenceSource)required.push('referenceSource');
  return required.filter(key=>!['reference','screening','training','policy','qualifications','fees','guardian','volunteerScreeningReview','counselorReview','counselorOrientation','counselorRules','guideScreeningReview'].includes(key)||p[key]!=='yes');
}
export async function applicationEvent(db:Database,id:string,operation:string,actor:string,reason='',detail:unknown={}){
  await db.query("INSERT INTO staff_application_event(application_id,operation,actor,reason,detail) VALUES($1,$2,$3,$4,$5::jsonb)",[id,operation,actor,reason,JSON.stringify(detail)]);
}
export async function canDeleteApplication(db:Database,app:StaffApplication,leadership:boolean){
  if(app.staff_id||app.ready||app.reference||app.reference_received_at||Object.keys(app.preparation).length)return false;
  if(app.status!=='draft'&&!(leadership&&app.status==='submitted'))return false;
  const history=(await db.query(`SELECT 1 FROM staff_application_event WHERE application_id=$1
    AND operation NOT IN ('created','save','submit','documentUploaded','documentRemoved','resumeLink') LIMIT 1`,[app.id])).rows.length;
  const reference=(await db.query("SELECT 1 FROM staff_application_document WHERE application_id=$1 AND category='reference' LIMIT 1",[app.id])).rows.length;
  return !history&&!reference;
}
// Call inside a transaction after locking the application, as for all review actions.
export async function correctApplication(db:Database,app:StaffApplication,operation:string,leadership:boolean,reason:string){
  const actor=leadership?'Camp Leadership (local pilot)':'Applicant or authorized guardian';
  if(operation==='delete'){
    if(!await canDeleteApplication(db,app,leadership))return 'historyProtected';
    await db.query('INSERT INTO staff_application_deletion(application_id,season,requested_role,actor) VALUES($1,$2,$3,$4)',[app.id,app.season,app.requested_role,actor]);
    await db.query('DELETE FROM staff_application_document WHERE application_id=$1',[app.id]);
    await db.query('DELETE FROM staff_application_event WHERE application_id=$1',[app.id]);
    await db.query('DELETE FROM staff_application WHERE id=$1',[app.id]);
    return 'deleted';
  }
  if(operation==='withdraw'){
    if(!reason||!['submitted','review','information',...(leadership?['approved','declined']:[])].includes(app.status))return 'invalid';
    await db.query("UPDATE staff_application SET status='withdrawn',ready=false,reference_hash=NULL,reference_expires=NULL,staff_review_required=staff_review_required OR staff_id IS NOT NULL,revision=revision+1,updated_at=CURRENT_TIMESTAMP WHERE id=$1",[app.id]);
    await applicationEvent(db,app.id,'withdrawn',actor,reason,{previousStatus:app.status,staff:app.staff_id});
    return 'withdrawn';
  }
  if(operation==='staffReviewComplete'&&leadership&&app.staff_review_required&&reason){
    await db.query('UPDATE staff_application SET staff_review_required=false,revision=revision+1,updated_at=CURRENT_TIMESTAMP WHERE id=$1',[app.id]);
    await applicationEvent(db,app.id,operation,actor,reason,{staff:app.staff_id});return 'saved';
  }
  return 'invalid';
}
export async function removeStaffDocument(db:Database,app:StaffApplication,file:string,leadership:boolean,reason:string){
  const doc=(await db.query<{category:string;recorded_by:string;removed_at:Date|null}>('SELECT category,recorded_by,removed_at FROM staff_application_document WHERE id=$1 AND application_id=$2 FOR UPDATE',[file,app.id])).rows[0];
  if(!doc||doc.removed_at)return 'notFound';
  if(!leadership&&(app.status!=='approved'||app.ready||doc.category==='reference'||doc.recorded_by!=='Applicant or authorized guardian'))return 'forbidden';
  if(!reason)return 'invalid';
  const flag=({reference:'reference',guardian:'guardian',policy:'policy',background:'screening'} as Record<string,string>)[doc.category];
  const selectedRules=doc.category==='rules'&&app.requested_role==='equipante'&&app.preparation.campRulesRequired==='yes'&&app.preparation.campRulesSource==='file'&&app.preparation.campRulesFile===file;
  const reviewed=selectedRules||app.preparation[flag]==='yes',preparation={...app.preparation};
  if(reviewed&&flag)preparation[flag]='';
  if(doc.category==='background'&&reviewed){if(app.requested_role==='volunteer')preparation.volunteerScreeningReview='';if(app.requested_role==='equipante')preparation.counselorReview='';}
  const actor=leadership?'Camp Leadership (local pilot)':'Applicant or authorized guardian';
  await db.query('UPDATE staff_application_document SET content=NULL,removed_at=CURRENT_TIMESTAMP,removed_by=$3,removal_reason=$4 WHERE id=$1 AND application_id=$2',[file,app.id,actor,reason]);
  await db.query('UPDATE staff_application SET preparation=$2::jsonb,ready=CASE WHEN $3 THEN false ELSE ready END,staff_review_required=staff_review_required OR $4,revision=revision+1,updated_at=CURRENT_TIMESTAMP WHERE id=$1',[app.id,JSON.stringify(preparation),reviewed,reviewed&&app.staff_id!==null]);
  await applicationEvent(db,app.id,'documentRemoved',actor,reason,{file,category:doc.category,reviewInvalidated:reviewed,previousReady:app.ready});
  return 'saved';
}
export async function reviewApplication(db:Database,app:StaffApplication,operation:string,reason:string,existing?:number,publicNote=''){
  if(!reason)return 'invalid';
  const actor='Camp Leadership (local pilot)';
  if(operation==='review'||operation==='information'||operation==='declined'){
    if(app.status==='draft'||app.status==='approved'||app.status==='withdrawn'||(operation==='information'&&!publicNote))return 'invalid';
    await db.query("UPDATE staff_application SET status=$2,public_note=$3,revision=revision+1,updated_at=CURRENT_TIMESTAMP WHERE id=$1",[app.id,operation,publicNote]);
  }else if(operation==='approved'){
    if(!['submitted','review','information'].includes(app.status)||(await applicationProblems(db,app)).length)return 'invalid';
    const weeks=await applicationWeeks(db,app.season),first=weeks.find(w=>(app.data.weeks??'').split(',').includes(String(w.id)))!;
    const adult=ageOn(app.data.birth,first.start)!>=18;
    const skills=app.requested_role==='volunteer'?app.data.volunteerAreas.split(','):[app.requested_role];
    let staff=existing;
    if(staff){
      const row=(await db.query<{id:number;adult:boolean}>("SELECT id,adult FROM staff_member WHERE id=$1 FOR UPDATE",[staff])).rows[0];
      if(!row||row.adult!==adult)return 'invalid';
      // Linking never overwrites the existing person's name, active state or history.
    }else{
      staff=(await db.query<{id:number}>("INSERT INTO staff_member(name,adult,active,skills,qualifications) VALUES($1,$2,false,$3::text[],$4) RETURNING id",[(app.data.first+' '+app.data.last).slice(0,100),adult,skills,'Staff application '+app.season])).rows[0].id;
    }
    await db.query("UPDATE staff_application SET status='approved',staff_id=$2,revision=revision+1,updated_at=CURRENT_TIMESTAMP WHERE id=$1",[app.id,staff]);
  }else if(operation==='ready'){
    if(app.status!=='approved'||!app.staff_id||app.staff_review_required||(await preparationProblems(db,app)).length)return 'incomplete';
    // Skills are added only after role-specific preparation is reviewed.
    const skills=app.requested_role==='volunteer'?app.data.volunteerAreas.split(','):[app.requested_role];
    await db.query("UPDATE staff_member SET active=true,skills=ARRAY(SELECT DISTINCT unnest(COALESCE(skills,ARRAY_REMOVE(ARRAY[team_role],NULL))||$2::text[])) WHERE id=$1",[app.staff_id,skills]);
    await db.query("UPDATE staff_application SET ready=true,revision=revision+1,updated_at=CURRENT_TIMESTAMP WHERE id=$1",[app.id]);
  }else return 'invalid';
  await applicationEvent(db,app.id,operation,actor,reason,{staff:existing??null});return 'saved';
}
