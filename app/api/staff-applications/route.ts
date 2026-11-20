import {staffScreeningDataFields,staffScreeningFields,staffScreeningQuestions,staffScreeningVersion} from '../../../lib/staff-screening';
import {campRulesPreparationFields,campRulesIdentity,campRulesAcknowledged} from '../../../lib/camp-rules';
import {staffApplicationText} from '../../../lib/staff-application-copy';
import { randomUUID } from 'node:crypto';
import { getDatabase } from '../../../lib/database';
import { currentRole } from '../../../lib/session';
import { ageOn,panamaDate,dateParts } from '../../../lib/registration';
import { applicationId,applicationRoles,cleanApplicationData,hasApplicationToken,newApplicationToken,tokenHash,applicationProblems,applicantPreparationProblems,preparationProblems,campRulesDocumentProblems,applicationEvent,reviewApplication,applicationWeeks,correctApplication,type StaffApplication } from '../../../lib/staff-application';
import { applicationJson } from '../../../lib/staff-application-request';
import { volunteerFields,volunteerScreeningFields,volunteerAgreements,volunteerAgreementVersion,volunteerScreeningVersion } from '../../../lib/volunteer-application';

export const runtime='nodejs';
const headers={'Cache-Control':'private, no-store','Referrer-Policy':'no-referrer','X-Robots-Tag':'noindex, nofollow'};
const reply=(data:unknown,status=200)=>Response.json(data,{status,headers});
const publicRecord=(app:StaffApplication)=>({id:app.id,season:app.season,role:app.requested_role,status:app.status,data:app.data,note:app.public_note,revision:app.revision,ready:app.ready,requirements:app.requested_role!=='guide'?{reference:app.requested_role==='equipante'||app.preparation.referenceRequired==='yes',campRules:app.requested_role==='equipante'&&app.preparation.campRulesRequired==='yes'?{required:true,title:app.preparation.campRulesTitle??'',revision:app.preparation.campRulesRevision??'',source:app.preparation.campRulesSource??'',url:app.preparation.campRulesSource==='link'?app.preparation.campRulesUrl??'':'',file:app.preparation.campRulesSource==='file'?app.preparation.campRulesFile??'':'',identity:campRulesIdentity(app.preparation)}:undefined,backgroundDocument:app.preparation.backgroundDocumentRequired==='yes',signedPolicy:app.preparation.signedPolicyRequired==='yes',policyName:app.preparation.requiredPolicyName??'',training:app.preparation.trainingRequired==='yes'}:undefined});
export async function GET(request:Request){
  if(process.env.PDV_LOCAL_DEMO!=='1')return reply({},404);
  const q=new URL(request.url).searchParams,id=q.get('id')??'';
  if(!applicationId.test(id))return reply({},404);
  const db=await getDatabase(),app=(await db.query<StaffApplication>('SELECT * FROM staff_application WHERE id=$1',[id])).rows[0];
  if(!app||!hasApplicationToken(app,q.get('key')??'','resume'))return reply({},404);
  return reply(publicRecord(app));
}
export async function POST(request:Request){
  if(process.env.PDV_LOCAL_DEMO!=='1')return reply({},404);
  if(request.headers.get('origin')!==new URL(request.url).origin)return reply({},403);
  if(Number(request.headers.get('content-length'))>65536)return reply({},413);
  try{
    const body=await applicationJson(request,65536);if(!body||typeof body!=='object')return reply({},400);
    const db=await getDatabase(),leadership=await currentRole()==='leadership';
    if(body.op==='season'){
      if(!leadership)return reply({},403);
      const season=Number(body.season),fee=Number(body.fee_cents),shirt=Number(body.shirt_cents),dates=['due_on','training_start','training_end','celebration_on'].map(key=>body[key]||null);
      if(!Number.isInteger(season)||season<2020||season>2100||!Number.isInteger(fee)||fee<0||fee>1000000||!Number.isInteger(shirt)||shirt<0||shirt>1000000||dates.some(d=>d!==null&&(typeof d!=='string'||!dateParts(d)))||Boolean(dates[1])!==Boolean(dates[2])||(dates[1]&&dates[2]&&dates[1]>dates[2]))return reply({status:'invalid'},400);
      await db.query('INSERT INTO staff_application_season(season,fee_cents,shirt_cents,due_on,training_start,training_end,celebration_on) VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT(season) DO UPDATE SET fee_cents=excluded.fee_cents,shirt_cents=excluded.shirt_cents,due_on=excluded.due_on,training_start=excluded.training_start,training_end=excluded.training_end,celebration_on=excluded.celebration_on',[season,fee,shirt,...dates]);
      return reply({status:'saved'});
    }
    if(body.op==='start'){
      const data=cleanApplicationData(body.data),season=Number(body.season),role=body.role;
      const age=data?ageOn(data.birth,panamaDate()):null;
      if(!data||!data.first||!data.last||data.first.length+data.last.length>98||!data.email||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)||!data.dataSigner||data.sharing!=='yes'||age===null||age<0||age>110||data.dataAuthority!==(age<18?'guardian':'self')||!applicationRoles.includes(role)||!Number.isInteger(season)||season<2020||season>2100||!(await applicationWeeks(db,season)).length)return reply({status:'invalid'},400);
      if(data.gender&&!['female','male'].includes(data.gender))return reply({status:'invalid'},400);
      const initial=Object.fromEntries(['first','last','birth','gender','email','phone','address','dataSigner','dataAuthority','sharing'].filter(key=>data[key]!==undefined).map(key=>[key,data[key]]));
      const token=newApplicationToken(),id=randomUUID();
      await db.transaction(async tx=>{
        await tx.query('LOCK TABLE staff_application IN SHARE ROW EXCLUSIVE MODE');
        if(Number((await tx.query<{n:number}>("SELECT count(*)::integer n FROM staff_application WHERE created_at>CURRENT_TIMESTAMP-INTERVAL '1 day'")).rows[0].n)>=2000)throw Error('capacity');
        await tx.query("INSERT INTO staff_application(id,season,requested_role,data,resume_hash,resume_expires) VALUES($1,$2,$3,$4::jsonb,$5,CURRENT_TIMESTAMP+INTERVAL '90 days')",[id,season,role,JSON.stringify(initial),tokenHash(token)]);
        await applicationEvent(tx,id,'created',leadership?'Camp Leadership (local pilot)':'Applicant or authorized guardian','Data collection authorized',{notice:'staff-pilot-1',authority:data.dataAuthority,signer:data.dataSigner});
      });
      return reply({id,key:token},201);
    }
    if(!applicationId.test(body.id??''))return reply({},404);
    return await db.transaction(async tx=>{
      const app=(await tx.query<StaffApplication>('SELECT * FROM staff_application WHERE id=$1 FOR UPDATE',[body.id])).rows[0];
      if(!app)return reply({},404);
      const staffOp=['review','information','approved','declined','ready','saveReview','checklist','resumeLink','referenceLink','staffReviewComplete'].includes(body.op);
      if(staffOp?!leadership:!leadership&&!hasApplicationToken(app,body.key??'','resume'))return reply({},403);
      if(body.revision!==app.revision)return reply({status:'stale'},409);
      if(['delete','withdraw','staffReviewComplete'].includes(body.op)){
        if(body.confirmed!==true)return reply({status:'confirmationRequired'},400);
        const reason=typeof body.reason==='string'?body.reason.trim():'';
        if(reason.length>2000)return reply({status:'invalid'},400);
        const status=await correctApplication(tx,app,body.op,leadership,reason);
        return reply({status,revision:app.revision+1,applicationStatus:status==='withdrawn'?'withdrawn':app.status},['deleted','withdrawn','saved'].includes(status)?200:409);
      }
      if(body.op==='resumeLink'||body.op==='referenceLink'){
        const token=newApplicationToken(),resume=body.op==='resumeLink';
        if(body.op==='referenceLink'&&['draft','declined','withdrawn'].includes(app.status))return reply({status:'invalid'},400);
        await tx.query(resume?"UPDATE staff_application SET resume_hash=$2,resume_expires=CURRENT_TIMESTAMP+INTERVAL '90 days',revision=revision+1 WHERE id=$1":"UPDATE staff_application SET reference_hash=$2,reference_expires=CURRENT_TIMESTAMP+INTERVAL '30 days',revision=revision+1 WHERE id=$1",[app.id,tokenHash(token)]);
        await applicationEvent(tx,app.id,body.op,'Camp Leadership (local pilot)','Previous link replaced');
        return reply({status:'saved',key:token,revision:app.revision+1});
      }
      if(body.op==='save'||body.op==='submit'||body.op==='prepare'||body.op==='submitPreparation'){
        const data=cleanApplicationData(body.data);if(!data)return reply({status:'invalid'},400);
        const preparing=body.op==='prepare'||body.op==='submitPreparation';
        if(preparing?app.status!=='approved'||app.ready:!['draft','information'].includes(app.status))return reply({status:'locked'},403);
        const prep=['food','foodDetails','diet','dietDetails','medication','medicationDetails','medicationAllergy','medicationAllergyDetails','accommodation','accommodationDetails','emergency','emergencyPhone','shirt','guardian','guardianRelationship','guardianPermission','conduct','campRulesAcknowledgment','counselorRulesAccepted','feeAcknowledgment',...(app.requested_role==='volunteer'?volunteerFields:app.requested_role==='guide'?staffScreeningDataFields:[])];
        const merged={...app.data};for(const [key,value]of Object.entries(data))if(preparing?prep.includes(key):(!prep.includes(key)||volunteerFields.includes(key))&&!['birth','dataSigner','dataAuthority','sharing'].includes(key))merged[key]=value;
        if(app.requested_role!=='equipante'){delete merged.counselorRulesAccepted;delete merged.campRulesAcknowledgment;}
        if(app.requested_role==='equipante')for(const key of volunteerFields)delete merged[key];
        if(app.requested_role==='guide')for(const item of volunteerAgreements)delete merged[item.key];
        if(app.requested_role==='volunteer'){
          const first=(await applicationWeeks(tx,app.season)).find(week=>(merged.weeks??'').split(',').includes(String(week.id)));
          if(first&&ageOn(merged.birth,first.start)!<18)for(const key of volunteerScreeningFields){delete merged[key];delete merged[key+'Details'];delete merged[key+'Private'];}
        }
        for(const key of volunteerScreeningFields){if(merged[key]!=='yes'){delete merged[key+'Details'];delete merged[key+'Private'];}else if(merged[key+'Private']==='yes')delete merged[key+'Details'];}
        // Initial authorization and date of birth are retained as consent evidence.
        for(const key of ['food','diet','medication','medicationAllergy','accommodation'])if(merged[key]!=='yes')delete merged[key+'Details'];
        if(preparing&&app.requested_role==='equipante'){
          const identity=campRulesIdentity(app.preparation);
          if(identity&&merged.campRulesAcknowledgment===identity&&!campRulesAcknowledged(app.preparation,app.data)){
            const problems=await campRulesDocumentProblems(tx,app);if(problems.length)return reply({status:'invalid',problems},400);
            merged.campRulesAcknowledgedAt=new Date().toISOString();merged.campRulesTitleAcknowledged=app.preparation.campRulesTitle;merged.campRulesRevisionAcknowledged=app.preparation.campRulesRevision;
          }else if(merged.campRulesAcknowledgment===''){
            delete merged.campRulesAcknowledgedAt;delete merged.campRulesTitleAcknowledged;delete merged.campRulesRevisionAcknowledged;
          }
        }
        if(body.op==='submit'){
          const problems=await applicationProblems(tx,{...app,data:merged});if(problems.length)return reply({status:'invalid',problems},400);
        }
        if(body.op==='submitPreparation'){
          const problems=await applicantPreparationProblems(tx,{...app,data:merged});if(problems.length)return reply({status:'invalid',problems},400);
          merged.preparationSubmittedAt=new Date().toISOString();
        }else if(preparing&&prep.some(key=>merged[key]!==app.data[key]))delete merged.preparationSubmittedAt;
        const status=body.op==='submit'?'submitted':app.status;
        await tx.query("UPDATE staff_application SET data=$2::jsonb,status=$3,submitted_at=CASE WHEN $4 THEN CURRENT_TIMESTAMP ELSE submitted_at END,revision=revision+1,updated_at=CURRENT_TIMESTAMP WHERE id=$1",[app.id,JSON.stringify(merged),status,body.op==='submit']);
        let evidence:unknown={};
        if(app.requested_role==='volunteer'&&(body.op==='submit'||(preparing&&volunteerAgreements.some(item=>merged[item.key]!==app.data[item.key])&&volunteerAgreements.every(item=>merged[item.key]==='yes')))){
          const locale=body.locale==='en'?'en':'es';
          evidence={agreementVersion:volunteerAgreementVersion,screeningVersion:volunteerScreeningVersion,language:locale,recordedAt:new Date().toISOString(),applicationFor:merged.first+' '+merged.last,informationAuthorizedBy:merged.dataSigner,source:leadership?'Assisted application':'Private applicant link',statements:volunteerAgreements.map(item=>({key:item.key,text:item[locale],acknowledged:merged[item.key]==='yes'})),screening:Object.fromEntries(volunteerScreeningFields.map(key=>[key,{answer:merged[key],details:merged[key+'Details']??null,privateDiscussion:merged[key+'Private']==='yes'}]))};
          await tx.query('UPDATE staff_application SET volunteer_acknowledgment=$2::jsonb WHERE id=$1',[app.id,JSON.stringify(evidence)]);
        }
        if(app.requested_role==='guide'&&(body.op==='submit'||(preparing&&staffScreeningFields.some(key=>[key,key+'Details',key+'Private'].some(field=>merged[field]!==app.data[field]))))){
          const language=body.locale==='en'?'en':'es';
          evidence={applicantScreening:{role:'guide',version:staffScreeningVersion,language,questions:staffScreeningFields.map(key=>({key,text:staffScreeningQuestions[language][key],answer:merged[key],details:merged[key+'Details']??null,privateDiscussion:merged[key+'Private']==='yes'}))}};
        }
        if(app.requested_role==='equipante'&&preparing&&merged.campRulesAcknowledgedAt!==app.data.campRulesAcknowledgedAt&&campRulesAcknowledged(app.preparation,merged)){
          evidence={campRules:{title:app.preparation.campRulesTitle,revision:app.preparation.campRulesRevision,source:app.preparation.campRulesSource,document:app.preparation.campRulesSource==='file'?app.preparation.campRulesFile:app.preparation.campRulesUrl,acknowledged:true,at:merged.campRulesAcknowledgedAt,language:body.locale==='en'?'en':'es',acknowledgmentVersion:'camp-rules-2',text:staffApplicationText(body.locale==='en'?'en':'es','campRulesConsent')}};
        }
        // A changed screening answer cannot retain an earlier completed review.
        if(app.requested_role==='guide'&&staffScreeningFields.some(key=>[key,key+'Details',key+'Private'].some(field=>merged[field]!==app.data[field])))await tx.query("UPDATE staff_application SET preparation=preparation-'guideScreeningReview'-'screening',staff_review_required=staff_review_required OR staff_id IS NOT NULL WHERE id=$1",[app.id]);
        if(app.requested_role==='volunteer'&&volunteerScreeningFields.some(key=>[key,key+'Details',key+'Private'].some(field=>merged[field]!==app.data[field]))){
          await tx.query("UPDATE staff_application SET preparation=preparation-'volunteerScreeningReview'-'screening',staff_review_required=staff_review_required OR staff_id IS NOT NULL WHERE id=$1",[app.id]);
        }
        await applicationEvent(tx,app.id,body.op,leadership?'Camp Leadership (local pilot)':'Applicant or authorized guardian','',evidence);
        return reply({...publicRecord({...app,data:merged,status,revision:app.revision+1}),status:'saved',applicationStatus:status});
      }
      if(body.op==='saveReview'){
        if(['draft','withdrawn'].includes(app.status)||app.ready||!body.preparation||typeof body.preparation!=='object'||Array.isArray(body.preparation))return reply({status:'invalid'},400);
        const reason=typeof body.reason==='string'?body.reason.trim():'';
        const publicNote=typeof body.publicNote==='string'?body.publicNote.trim():'';
        const decision=body.decision??'keep',existing=body.existing?Number(body.existing):undefined;
        if(!reason||reason.length>2000||publicNote.length>2000||!['keep','review','information','approved','declined','ready'].includes(decision)||(existing!==undefined&&(!Number.isInteger(existing)||existing<1)))return reply({status:'invalid'},400);
        const preparation:Record<string,string>={};
        for(const key of ['reference','screening','training','policy','qualifications','fees','guardian','referenceSource','screeningNotes','guideScreeningReview','volunteerScreeningReview','referenceRequired','backgroundDocumentRequired','signedPolicyRequired','requiredPolicyName','trainingRequired','counselorReview','counselorOrientation','counselorRules','counselorRulesName',...campRulesPreparationFields]){
          const value=body.preparation[key];if(value!==undefined){if(typeof value!=='string'||value.length>2000)return reply({status:'invalid'},400);preparation[key]=value.trim();}
        }
        const rulesProblems=await campRulesDocumentProblems(tx,{...app,preparation});if(rulesProblems.length)return reply({status:'invalid',problems:rulesProblems},400);
        preparation.reviewNotes=reason;
        const proposed={...app,preparation};
        // Validate the decision against the proposed checklist before writing either.
        // reviewApplication returns failures before mutating; SQL failures roll back this transaction.
        if(decision==='ready'&&app.requested_role==='equipante'&&preparation.campRulesRequired==='yes'&&!campRulesAcknowledged(preparation,app.data))return reply({status:'campRulesWaiting',problems:['campRulesWaiting']},400);
        if(decision!=='keep'){
          const result=await reviewApplication(tx,proposed,decision,reason,existing,publicNote);
          if(result!=='saved')return reply({status:result,problems:decision==='ready'?await preparationProblems(tx,proposed):[]},400);
        }
        await tx.query('UPDATE staff_application SET preparation=$2::jsonb,public_note=$3,revision=revision+$4,updated_at=CURRENT_TIMESTAMP WHERE id=$1',[app.id,JSON.stringify(preparation),publicNote,decision==='keep'?1:0]);
        if(app.requested_role==='equipante'&&preparation.campRulesRequired==='yes'&&campRulesIdentity(preparation)!==campRulesIdentity(app.preparation))await tx.query("UPDATE staff_application SET data=data-'preparationSubmittedAt' WHERE id=$1",[app.id]);
        await applicationEvent(tx,app.id,'saveReview','Camp Leadership (local pilot)',reason,{decision,previous:app.preparation,resulting:preparation});
        const updated=(await tx.query<StaffApplication>('SELECT * FROM staff_application WHERE id=$1',[app.id])).rows[0];
        return reply({status:'saved',revision:updated.revision,application:{data:updated.data,status:updated.status,ready:updated.ready,staff_id:updated.staff_id,revision:updated.revision,preparation:updated.preparation,public_note:updated.public_note,staff_review_required:updated.staff_review_required},missing:await preparationProblems(tx,updated)});
      }
      if(body.op==='checklist'){
        if(['draft','withdrawn'].includes(app.status)||app.ready||!body.preparation||typeof body.preparation!=='object')return reply({status:'invalid'},400);
        const preparation:Record<string,string>={};
        for(const key of ['reference','screening','training','policy','qualifications','fees','guardian','referenceSource','screeningNotes','guideScreeningReview','volunteerScreeningReview','referenceRequired','backgroundDocumentRequired','signedPolicyRequired','requiredPolicyName','trainingRequired',...campRulesPreparationFields]){
          const value=body.preparation[key];if(typeof value==='string'&&value.length<=2000)preparation[key]=value.trim();
        }
        if(app.requested_role==='equipante'&&preparation.counselorRulesName!==app.preparation.counselorRulesName)delete preparation.counselorRules;
        if(typeof body.reason!=='string'||!body.reason.trim()||body.reason.length>2000)return reply({status:'invalid'},400);
        await tx.query('UPDATE staff_application SET preparation=$2::jsonb,revision=revision+1,updated_at=CURRENT_TIMESTAMP WHERE id=$1',[app.id,JSON.stringify(preparation)]);
        if(app.requested_role==='equipante'&&preparation.counselorRulesName!==app.preparation.counselorRulesName)await tx.query("UPDATE staff_application SET data=data-'preparationSubmittedAt' WHERE id=$1",[app.id]);
        await applicationEvent(tx,app.id,'checklist','Camp Leadership (local pilot)',body.reason,{previous:app.preparation,resulting:preparation});
        return reply({status:'saved',revision:app.revision+1});
      }
      const existing=body.existing?Number(body.existing):undefined;
      if(existing!==undefined&&(!Number.isInteger(existing)||existing<1))return reply({status:'invalid'},400);
      const reason=typeof body.reason==='string'?body.reason.trim():'';
      if(reason.length>2000)return reply({status:'invalid'},400);
      const publicNote=typeof body.publicNote==='string'?body.publicNote.trim():'';if(publicNote.length>2000)return reply({status:'invalid'},400);
      const result=await reviewApplication(tx,app,body.op,reason,existing,publicNote);
      return reply({status:result},result==='saved'?200:400);
    });
  }catch(error){return reply({status:error instanceof RangeError?'invalid':'unavailable'},error instanceof RangeError?413:error instanceof SyntaxError?400:503);}
}
