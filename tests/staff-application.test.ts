import {staffScreeningProblems} from '../lib/staff-screening.ts';
import {campRulesIdentity} from '../lib/camp-rules.ts';
import { staffApplicationStatus } from '../lib/staff-application-status.ts';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { randomUUID } from 'node:crypto';
import { readFile,readdir } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { applicationProblems,cleanApplicationData,newApplicationToken,tokenHash,hasApplicationToken,preparationProblems,reviewApplication,staffApplicationSearchWhere,canDeleteApplication,correctApplication,removeStaffDocument,type StaffApplication } from '../lib/staff-application.ts';
import { volunteerProblems,volunteerFollowup,volunteerScreeningFields } from '../lib/volunteer-application.ts';

const volunteerAnswers={believerYears:'4',volunteerConviction:'no',volunteerCharges:'no',volunteerRestrictions:'no',volunteerSafeguarding:'no',volunteerConduct:'yes',volunteerBelongings:'yes',volunteerAdmission:'yes'};

async function fixture(){
  const db=new PGlite();for(const file of (await readdir('db')).filter(n=>/^\d{3}-.+\.sql$/.test(n)).sort())await db.exec(await readFile('db/'+file,'utf8'));
  const week=(await db.query<{id:number}>("INSERT INTO camp_week(name,minimum_age,maximum_age,capacity,starts_on,ends_on) VALUES('Fictional week',7,11,200,'2027-01-12','2027-01-16') RETURNING id")).rows[0].id;
  const id=randomUUID(),token=newApplicationToken(),referenceToken=newApplicationToken();
  const data={believerYears:'5',volunteerConviction:'no',volunteerCharges:'no',volunteerRestrictions:'no',volunteerSafeguarding:'no',first:'Fictional',last:'Applicant',birth:'2000-01-01',gender:'female',email:'fictional@example.test',phone:'DEMO',address:'Fictional address',church:'Sample church',pastor:'Sample pastor',pastorPhone:'DEMO',testimony:'Fictional testimony',motivation:'Fictional motivation',experience:'None',skills:'Fictional skills',weeks:String(week),sharing:'yes',dataSigner:'Fictional Applicant',dataAuthority:'self',referencePermission:'yes',truth:'yes'};
  await db.query("INSERT INTO staff_application(id,season,requested_role,status,data,resume_hash,resume_expires,reference_hash,reference_expires) VALUES($1,2027,'guide','submitted',$2::jsonb,$3,'2099-01-01',$4,'2099-01-01')",[id,JSON.stringify(data),tokenHash(token),tokenHash(referenceToken)]);
  const get=async()=>(await db.query<StaffApplication>('SELECT * FROM staff_application WHERE id=$1',[id])).rows[0];
  return {db,id,week,data,token,referenceToken,get};
}
test('application cleaning excludes ID numbers and irrelevant health details; private links are purpose-bound and expiring',async()=>{
  assert.deepEqual(cleanApplicationData({first:' Demo ',governmentId:'PRIVATE',photo:'PRIVATE',food:'none',foodDetails:'PRIVATE'}),{first:'Demo',food:'none'});
  assert.equal(cleanApplicationData({first:'a'.repeat(3001)}),null);
  const f=await fixture();try{const app=await f.get();assert.ok(hasApplicationToken(app,f.token,'resume'));assert.ok(hasApplicationToken(app,f.referenceToken,'reference'));assert.equal(hasApplicationToken(app,f.token,'reference'),false);assert.equal(hasApplicationToken(app,f.referenceToken,'resume'),false);assert.equal(hasApplicationToken(app,f.token,'resume',new Date('2100-01-01')),false);assert.notEqual(app.resume_hash,f.token);}finally{await f.db.close();}
});
test('application submission enforces role age, current season weeks, explicit permissions and volunteer interests',async()=>{
  const f=await fixture();try{
    const app=await f.get();assert.deepEqual(await applicationProblems(f.db,app),[]);
    const child={...app,data:{...app.data,birth:'2011-01-12'}};
    assert.ok((await applicationProblems(f.db,child)).includes('age'));
    assert.deepEqual(await applicationProblems(f.db,{...child,requested_role:'equipante'}),[]);
    assert.ok((await applicationProblems(f.db,{...child,data:{...child.data,birth:'2013-01-12'},requested_role:'equipante'})).includes('age'));
    assert.ok((await applicationProblems(f.db,{...app,data:{...app.data,weeks:'999'}})).includes('weeks'));
    assert.ok((await applicationProblems(f.db,{...app,data:{...app.data,referencePermission:''}})).includes('referencePermission'));
    assert.ok((await applicationProblems(f.db,{...app,requested_role:'volunteer'})).includes('volunteerAreas'));
    assert.deepEqual(await applicationProblems(f.db,{...app,requested_role:'volunteer',data:{...app.data,...volunteerAnswers,volunteerAreas:'health,kitchen'}}),[]);
  }finally{await f.db.close();}
});
test('approval creates inactive staff, readiness requires reviewed preparation, and links preserve existing staff history',async()=>{
  const f=await fixture();try{
    assert.equal(await reviewApplication(f.db,await f.get(),'information','Ask for details'), 'invalid');
    assert.equal(await reviewApplication(f.db,await f.get(),'information','Private notes',undefined,'Please clarify your availability.'),'saved');
    assert.equal((await f.get()).public_note,'Please clarify your availability.');
    assert.equal(await reviewApplication(f.db,await f.get(),'approved','Leadership approved'),'saved');
    let app=await f.get();assert.ok(app.staff_id);
    assert.equal((await f.db.query<{active:boolean}>('SELECT active FROM staff_member WHERE id=$1',[app.staff_id])).rows[0].active,false);
    assert.equal(await reviewApplication(f.db,app,'ready','Ready review'),'incomplete');
    const data={...app.data,food:'none',diet:'none',medication:'none',medicationAllergy:'none',accommodation:'yes',accommodationDetails:'Fictional breaks',emergency:'Sample contact',emergencyPhone:'DEMO',shirt:'M',conduct:'yes'};
    const preparation={guideScreeningReview:'yes',reference:'yes',referenceSource:'Signed form supplied directly by sample pastor',screening:'yes',screeningNotes:'Sample document, issuer, issue date, reviewer and review date',training:'yes',policy:'yes',qualifications:'yes'};
    await f.db.query('UPDATE staff_application SET data=$2::jsonb,preparation=$3::jsonb WHERE id=$1',[app.id,JSON.stringify(data),JSON.stringify(preparation)]);app=await f.get();
    assert.deepEqual(await preparationProblems(f.db,app),[]);assert.ok((await preparationProblems(f.db,{...app,requested_role:'equipante'})).includes('fees'));assert.equal(await reviewApplication(f.db,app,'ready','All requirements reviewed'),'saved');
    assert.equal((await f.get()).ready,true);assert.equal((await f.db.query<{active:boolean}>('SELECT active FROM staff_member WHERE id=$1',[app.staff_id])).rows[0].active,true);
    assert.equal(await reviewApplication(f.db,await f.get(),'declined','Unsafe retroactive action'),'invalid');
    const id2=randomUUID();await f.db.query("INSERT INTO staff_application(id,season,requested_role,status,data,resume_hash,resume_expires) VALUES($1,2027,'guide','submitted',$2::jsonb,'test','2099-01-01')",[id2,JSON.stringify(f.data)]);
    const returning=(await f.db.query<StaffApplication>('SELECT * FROM staff_application WHERE id=$1',[id2])).rows[0];
    assert.equal(await reviewApplication(f.db,returning,'approved','Returning person',app.staff_id!), 'saved');
    assert.equal((await f.db.query<{n:number}>('SELECT count(*)::integer n FROM staff_member')).rows[0].n,1);
    assert.equal((await f.db.query<{active:boolean}>('SELECT active FROM staff_member WHERE id=$1',[app.staff_id])).rows[0].active,true);
  }finally{await f.db.close();}
});
test('application queue and count search JSON names together with status and season filters',async()=>{
  const f=await fixture();try{
    for(const name of ['', 'fictional', 'APPLICANT', 'Fictional Applicant']){
      const values=[null,null,name];
      const rows=(await f.db.query<{id:string}>('SELECT id FROM staff_application '+staffApplicationSearchWhere+' ORDER BY updated_at DESC,id LIMIT 25 OFFSET $4',[...values,0])).rows;
      const count=(await f.db.query<{n:number}>('SELECT count(*)::integer n FROM staff_application '+staffApplicationSearchWhere,values)).rows[0].n;
      assert.equal(rows.length,1);assert.equal(rows[0].id,f.id);assert.equal(count,1);
    }
    for(const values of [['draft',2027,'Fictional'],['submitted',2026,'Fictional'],[null,null,'Nobody']])assert.equal((await f.db.query('SELECT id FROM staff_application '+staffApplicationSearchWhere,values)).rows.length,0);
    assert.equal((await f.db.query('SELECT id FROM staff_application '+staffApplicationSearchWhere,['submitted',2027,'Applicant'])).rows.length,1);
    await f.db.query("UPDATE staff_application SET status='approved',data=data||$2::jsonb WHERE id=$1",[f.id,JSON.stringify({preparationSubmittedAt:'2026-11-17T12:00:00Z'})]);
    assert.equal(staffApplicationStatus(await f.get()),'preparationReceived');
    const filtered=async(stage:string)=>Number((await f.db.query<{n:number}>('SELECT count(*)::integer n FROM staff_application '+staffApplicationSearchWhere,[stage,2027,'Applicant'])).rows[0].n);
    assert.equal(await filtered('preparationReceived'),1);assert.equal(await filtered('approved'),0);assert.equal(await filtered('ready'),0);
    const readyStaff=(await f.db.query<{id:number}>("INSERT INTO staff_member(name,adult,active) VALUES('Fictional ready staff',true,true) RETURNING id")).rows[0].id;
    await f.db.query('UPDATE staff_application SET ready=true,staff_id=$2 WHERE id=$1',[f.id,readyStaff]);assert.equal(staffApplicationStatus(await f.get()),'ready');assert.equal(await filtered('ready'),1);assert.equal(await filtered('preparationReceived'),0);
    await f.db.query("UPDATE staff_application SET ready=false,data=data-'preparationSubmittedAt' WHERE id=$1",[f.id]);assert.equal(staffApplicationStatus(await f.get()),'approved');assert.equal(await filtered('approved'),1);assert.equal(await filtered('preparationReceived'),0);

  }finally{await f.db.close();}
});

test('minor preparation requires parental permission and a staff review of the signed permission',async()=>{
  const f=await fixture();try{
    const app=await f.get();app.requested_role='equipante';app.data={...app.data,birth:'2011-01-12',food:'yes',foodDetails:'Fictional nuts',diet:'none',medication:'none',medicationAllergy:'none',accommodation:'none',emergency:'Demo',emergencyPhone:'DEMO',shirt:'S',conduct:'yes'};
    app.data.counselorRulesAccepted='Counselor camp rules v1';
    app.preparation={reference:'yes',referenceSource:'Demo pastor',counselorReview:'yes',screeningNotes:'Age-appropriate review recorded by demo reviewer',counselorOrientation:'yes',counselorRules:'yes',counselorRulesName:'Counselor camp rules v1',qualifications:'yes',fees:'yes'};
    const missing=await preparationProblems(f.db,app);assert.ok(missing.includes('guardian'));assert.ok(missing.includes('guardianPermission'));
    app.data.guardian='Fictional Guardian';app.data.guardianRelationship='Parent';app.data.guardianPermission='yes';app.preparation.guardian='yes';
    assert.deepEqual(await preparationProblems(f.db,app),[]);
  }finally{await f.db.close();}
});

test('deleting an unused draft removes answers, documents and private history while retaining only a minimal receipt',async()=>{
  const f=await fixture();try{
    await f.db.query("UPDATE staff_application SET status='draft' WHERE id=$1",[f.id]);
    await f.db.query("INSERT INTO staff_application_document(id,application_id,category,content_type,content,source,recorded_by) VALUES($1,$2,'guardian','application/pdf',$3,'Fictional source','Camp Leadership (local pilot)')",[randomUUID(),f.id,Buffer.from('%PDF-1.4')]);
    const app=await f.get();assert.equal(await canDeleteApplication(f.db,app,false),true);
    assert.equal(await f.db.transaction(tx=>correctApplication(tx,app,'delete',false,'')),'deleted');
    for(const table of ['staff_application','staff_application_document','staff_application_event'])assert.equal((await f.db.query<{n:number}>('SELECT count(*)::integer n FROM '+table)).rows[0].n,0);
    const receipt=(await f.db.query('SELECT * FROM staff_application_deletion')).rows[0];assert.ok(receipt);assert.ok(!JSON.stringify(receipt).includes('Fictional Applicant'));
  }finally{await f.db.close();}
});

test('review history protects submissions from deletion; withdrawal preserves answers and disables references and processing',async()=>{
  const f=await fixture();try{
    const app=await f.get();assert.equal(await canDeleteApplication(f.db,app,false),false);assert.equal(await canDeleteApplication(f.db,app,true),true);
    await f.db.query("INSERT INTO staff_application_event(application_id,operation,actor) VALUES($1,'review','Demo leadership')",[app.id]);
    assert.equal(await canDeleteApplication(f.db,app,true),false);assert.equal(await correctApplication(f.db,app,'delete',true,''),'historyProtected');
    assert.equal(await f.db.transaction(tx=>correctApplication(tx,app,'withdraw',false,'Fictional change of plans')),'withdrawn');
    const withdrawn=await f.get();assert.equal(withdrawn.status,'withdrawn');assert.equal(withdrawn.reference_hash,null);assert.equal(withdrawn.data.first,app.data.first);
    assert.equal(await reviewApplication(f.db,withdrawn,'review','Trying to resume processing'),'invalid');assert.equal(await canDeleteApplication(f.db,withdrawn,true),false);
  }finally{await f.db.close();}
});

test('leadership withdrawal of approved staff preserves staff and assignments and flags a separate review',async()=>{
  const f=await fixture();try{
    assert.equal(await reviewApplication(f.db,await f.get(),'approved','Fictional approval'),'saved');let app=await f.get();
    await f.db.query('UPDATE staff_member SET active=true WHERE id=$1',[app.staff_id]);
    await f.db.query("INSERT INTO weekly_staff_assignment(week_id,staff_id,assignment_role) VALUES($1,$2,'program')",[f.week,app.staff_id]);
    assert.equal(await correctApplication(f.db,app,'withdraw',false,'Applicant cannot withdraw approval'),'invalid');
    assert.equal(await f.db.transaction(tx=>correctApplication(tx,app,'withdraw',true,'Fictional withdrawal')),'withdrawn');app=await f.get();
    assert.equal(app.staff_review_required,true);assert.equal(app.ready,false);
    assert.equal((await f.db.query<{active:boolean}>('SELECT active FROM staff_member WHERE id=$1',[app.staff_id])).rows[0].active,true);
    assert.equal((await f.db.query<{n:number}>('SELECT count(*)::integer n FROM weekly_staff_assignment WHERE staff_id=$1',[app.staff_id])).rows[0].n,1);
    assert.equal(await correctApplication(f.db,app,'staffReviewComplete',false,'No authority'),'invalid');
    assert.equal(await correctApplication(f.db,app,'staffReviewComplete',true,'Reviewed existing assignments; retained for other duties'),'saved');assert.equal((await f.get()).staff_review_required,false);
  }finally{await f.db.close();}
});

test('removing reviewed evidence removes its bytes and invalidates the checklist without silently removing operational staff',async()=>{
  const f=await fixture();try{
    assert.equal(await reviewApplication(f.db,await f.get(),'approved','Fictional approval'),'saved');let app=await f.get();
    await f.db.query("UPDATE staff_application SET ready=true,preparation='{\"screening\":\"yes\"}' WHERE id=$1",[app.id]);
    await f.db.query('UPDATE staff_member SET active=true WHERE id=$1',[app.staff_id]);
    const file=randomUUID();await f.db.query("INSERT INTO staff_application_document(id,application_id,category,content_type,content,source,recorded_by) VALUES($1,$2,'background','application/pdf',$3,'Wrong fictional file','Applicant or authorized guardian')",[file,app.id,Buffer.from('%PDF-1.4')]);
    app=await f.get();assert.equal(await removeStaffDocument(f.db,app,file,false,'Cannot undo a completed review as applicant'),'forbidden');
    assert.equal(await f.db.transaction(tx=>removeStaffDocument(tx,app,file,true,'Wrong file uploaded')),'saved');
    app=await f.get();assert.equal(app.preparation.screening,'');assert.equal(app.ready,false);assert.equal(app.staff_review_required,true);
    const doc=(await f.db.query<{content:unknown;removed_at:Date}>('SELECT content,removed_at FROM staff_application_document WHERE id=$1',[file])).rows[0];assert.equal(doc.content,null);assert.ok(doc.removed_at);
    assert.equal((await f.db.query<{active:boolean}>('SELECT active FROM staff_member WHERE id=$1',[app.staff_id])).rows[0].active,true);
    assert.equal(await reviewApplication(f.db,app,'ready','Needs new screening'),'incomplete');
  }finally{await f.db.close();}
});

test('Volunteer answers require explicit choices, a private discussion or explanation after Yes, and separate acknowledgments',()=>{
  const empty=volunteerProblems({});for(const key of volunteerScreeningFields)assert.ok(empty.includes(key));
  assert.deepEqual(volunteerProblems(volunteerAnswers),[]);assert.equal(volunteerFollowup(volunteerAnswers),false);
  const yes={...volunteerAnswers,volunteerConviction:'yes'};
  assert.ok(volunteerProblems(yes).includes('volunteerConvictionDetails'));
  assert.deepEqual(volunteerProblems({...yes,volunteerConvictionPrivate:'yes'}),[]);assert.equal(volunteerFollowup(yes),true);
  assert.deepEqual(volunteerProblems({...yes,volunteerConvictionDetails:'Fictional matter to discuss'}),[]);
  assert.ok(volunteerProblems({...volunteerAnswers,volunteerBelongings:''}).includes('volunteerBelongings'));
  assert.ok(volunteerProblems({...volunteerAnswers,believerYears:'-1'}).includes('believerYears'));
  assert.deepEqual(cleanApplicationData({volunteerConviction:'no',volunteerConvictionDetails:'PRIVATE_OLD',volunteerConvictionPrivate:'yes'}),{volunteerConviction:'no'});
  assert.deepEqual(cleanApplicationData({volunteerConviction:'yes',volunteerConvictionDetails:'PRIVATE_OLD',volunteerConvictionPrivate:'yes'}),{volunteerConviction:'yes',volunteerConvictionPrivate:'yes'});
  assert.deepEqual(volunteerProblems({believerYears:'0',volunteerConduct:'yes',volunteerBelongings:'yes',volunteerAdmission:'yes'},false),[]);
});

test('Volunteer Yes responses permit human approval; readiness uses explicit Volunteer requirements instead of generic signed uploads',async()=>{
  const f=await fixture();try{
    const data={...f.data,...volunteerAnswers,volunteerAreas:'program',volunteerConviction:'yes',volunteerConvictionPrivate:'yes',food:'none',diet:'none',medication:'none',medicationAllergy:'none',accommodation:'none',emergency:'Demo contact',emergencyPhone:'DEMO',shirt:'M'};
    await f.db.query("UPDATE staff_application SET requested_role='volunteer',data=$2::jsonb WHERE id=$1",[f.id,JSON.stringify(data)]);
    assert.deepEqual(await applicationProblems(f.db,await f.get()),[]);
    assert.equal(await reviewApplication(f.db,await f.get(),'approved','Leadership judgment after review'),'saved');
    let app=await f.get();assert.ok((await preparationProblems(f.db,app)).includes('volunteerScreeningReview'));
    const preparation={volunteerScreeningReview:'yes',screeningNotes:'Fictional private conversation completed; duty-appropriate checks reviewed by demo leader on demo date',qualifications:'yes'};
    await f.db.query('UPDATE staff_application SET preparation=$2::jsonb WHERE id=$1',[f.id,JSON.stringify(preparation)]);
    app=await f.get();assert.deepEqual(await preparationProblems(f.db,app),[]);
    app.preparation={...preparation,referenceRequired:'yes'};assert.ok((await preparationProblems(f.db,app)).includes('reference'));
    app.preparation={...preparation,signedPolicyRequired:'yes'};const policyMissing=await preparationProblems(f.db,app);assert.ok(policyMissing.includes('policy'));assert.ok(policyMissing.includes('requiredPolicyName'));
    app.preparation={...preparation,backgroundDocumentRequired:'yes',screening:'yes'};assert.ok((await preparationProblems(f.db,app)).includes('backgroundDocumentRequired'));
    await f.db.query("INSERT INTO staff_application_document(id,application_id,category,content_type,content,source,recorded_by) VALUES($1,$2,'background','application/pdf',$3,'Fictional certificate','Camp Leadership (local pilot)')",[randomUUID(),f.id,Buffer.from('%PDF-1.4')]);
    assert.deepEqual(await preparationProblems(f.db,app),[]);
    app=await f.get();assert.equal(await reviewApplication(f.db,app,'ready','Volunteer requirements reviewed'),'saved');
  }finally{await f.db.close();}
});


test('Camp Counselor rules are optional and acknowledgments track the exact document and revision automatically',async()=>{
 const f=await fixture();try{
  const app=await f.get();app.requested_role='equipante';app.data={...app.data,food:'none',diet:'none',medication:'none',medicationAllergy:'none',accommodation:'none',emergency:'Demo contact',emergencyPhone:'DEMO',shirt:'M'};
  app.preparation={reference:'yes',referenceSource:'Direct pastor reference',counselorReview:'yes',counselorOrientation:'yes',screeningNotes:'Age-appropriate discussion, reviewer and date',qualifications:'yes',fees:'yes'};
  assert.deepEqual(await preparationProblems(f.db,app),[]);
  for(const key of ['counselorReview','counselorOrientation']){const p={...app.preparation};delete p[key];assert.ok((await preparationProblems(f.db,{...app,preparation:p})).includes(key));}
  const rules={...app.preparation,campRulesRequired:'yes',campRulesTitle:'Camp Rules Book',campRulesRevision:'5',campRulesSource:'link',campRulesUrl:'https://example.test/rules.pdf'};
  assert.ok((await preparationProblems(f.db,{...app,preparation:rules})).includes('campRulesWaiting'));
  const acknowledged={...app.data,campRulesAcknowledgment:campRulesIdentity(rules),campRulesAcknowledgedAt:'2026-11-18T12:00:00Z'};
  assert.deepEqual(await preparationProblems(f.db,{...app,preparation:rules,data:acknowledged}),[]);
  for(const field of ['campRulesTitle','campRulesRevision'])assert.ok((await preparationProblems(f.db,{...app,preparation:{...rules,[field]:'Changed'},data:acknowledged})).includes('campRulesWaiting'));
  assert.deepEqual(await preparationProblems(f.db,{...app,preparation:{...rules,campRulesRequired:''},data:{...app.data}}),[]);
  const extra={...app.preparation,signedPolicyRequired:'yes'};const missing=await preparationProblems(f.db,{...app,preparation:extra});assert.ok(missing.includes('policy'));assert.ok(missing.includes('requiredPolicyName'));
  assert.ok((await preparationProblems(f.db,{...app,preparation:{...app.preparation,trainingRequired:'yes'}})).includes('training'));
  assert.ok((await preparationProblems(f.db,{...app,preparation:{...app.preparation,backgroundDocumentRequired:'yes'}})).includes('backgroundDocumentRequired'));
  const legacy={reference:'yes',referenceSource:'Demo',screening:'yes',training:'yes',policy:'yes',qualifications:'yes',fees:'yes',screeningNotes:'Old generic review',counselorRulesName:'Old title'};
  const legacyMissing=await preparationProblems(f.db,{...app,preparation:legacy});assert.ok(legacyMissing.includes('counselorReview'));assert.ok(legacyMissing.includes('counselorOrientation'));assert.ok(!legacyMissing.includes('campRulesWaiting'));
 }finally{await f.db.close();}
});

test('Cabin Leaders require shared screening answers and whole believer-years without Volunteer-only agreements',async()=>{
 const f=await fixture();try{
  const app=await f.get();assert.deepEqual(await applicationProblems(f.db,app),[]);
  for(const field of ['believerYears',...volunteerScreeningFields]){const data={...app.data};delete data[field];assert.ok((await applicationProblems(f.db,{...app,data})).includes(field));}
  assert.ok(staffScreeningProblems({...app.data,believerYears:'2.5'}).includes('believerYears'));assert.deepEqual(staffScreeningProblems({...app.data,believerYears:'0'}),[]);
  const yes={...app.data,volunteerConviction:'yes'};assert.ok((await applicationProblems(f.db,{...app,data:yes})).includes('volunteerConvictionDetails'));
  assert.deepEqual(await applicationProblems(f.db,{...app,data:{...yes,volunteerConvictionPrivate:'yes'}}),[]);
  assert.deepEqual(await applicationProblems(f.db,{...app,data:{...yes,volunteerConvictionDetails:'Fictional circumstances to review'}}),[]);
  const prep={reference:'yes',referenceSource:'Pastor response',screening:'yes',training:'yes',policy:'yes',qualifications:'yes',screeningNotes:'Checks and private conversation recorded by leadership'};
  const prepared={...app,data:{...app.data,food:'none',diet:'none',medication:'none',medicationAllergy:'none',accommodation:'none',emergency:'Fictional contact',emergencyPhone:'DEMO',shirt:'M',conduct:'yes'},preparation:prep};
  assert.ok((await preparationProblems(f.db,prepared)).includes('guideScreeningReview'));
  assert.deepEqual(await preparationProblems(f.db,{...prepared,preparation:{...prep,guideScreeningReview:'yes'}}),[]);
  assert.ok((await preparationProblems(f.db,{...prepared,preparation:{...prep,guideScreeningReview:'yes',screening:''}})).includes('screening'));
 }finally{await f.db.close();}
});
