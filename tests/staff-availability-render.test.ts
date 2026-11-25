import {test} from 'node:test';
import assert from 'node:assert/strict';
import {registerHooks} from 'node:module';
import {readFileSync,existsSync} from 'node:fs';
import {readFile,readdir} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {randomUUID} from 'node:crypto';
import ts from 'typescript';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {PGlite} from '@electric-sql/pglite';

test('bilingual assignment and staff review forms honor availability and role-specific requirements',async()=>{
 const db=new PGlite(),globals=globalThis as unknown as {availabilityRenderDb?:PGlite};globals.availabilityRenderDb=db;
 const hook=registerHooks({resolve(specifier,context,next){
  if(context.parentURL?.startsWith('availability-render:'))return next(specifier,{...context,parentURL:new URL('../package.json',import.meta.url).href});
  if(['next/navigation','next/link','next/image','next/headers','next/cache'].includes(specifier))return {url:'availability-render:'+specifier,shortCircuit:true};
  if(specifier.startsWith('.')&&!/\.[a-z]+$/i.test(specifier)){for(const ext of ['.ts','.tsx']){const candidate=new URL(specifier+ext,context.parentURL);if(existsSync(fileURLToPath(candidate)))return next(candidate.href,context);}}return next(specifier,context);
 },load(url,context,next){
  const stub=(source:string)=>({format:'module' as const,shortCircuit:true,source});
  if(url==='availability-render:next/navigation')return stub('export const useRouter=()=>({refresh(){}});export function redirect(url){throw Error(url);}export function notFound(){throw Error("Not found");}');
  if(url==='availability-render:next/cache')return stub('export function revalidatePath(){}');
  if(url==='availability-render:next/headers')return stub('export const cookies=async()=>({set(){}});');
  if(url==='availability-render:next/link')return stub('import React from "react";export const useLinkStatus=()=>({pending:false});export default function Link({children,onNavigate,...props}){return React.createElement("a",props,children);}');
  if(url==='availability-render:next/image')return stub('import React from "react";export default function Image(props){return React.createElement("img",props);}');
  if(url.endsWith('/staff-nav.tsx'))return stub('export function StaffNav(){return null;}');
  if(url.endsWith('/lib/database.ts'))return stub('export async function getDatabase(){return globalThis.availabilityRenderDb;}');
  if(url.endsWith('/lib/session.ts'))return stub('export async function currentRole(){return "leadership";} export const roles=["leadership"];export const isRole=()=>false;export const setSession=async()=>{};export const validDemoPassword=()=>false;');
  if(url.endsWith('.ts')||url.endsWith('.tsx'))return stub(ts.transpileModule(readFileSync(fileURLToPath(url),'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext,jsx:ts.JsxEmit.ReactJSX}}).outputText);return next(url,context);
 }});
 try{
  for(const file of (await readdir('db')).filter(n=>/^\d{3}-.+\.sql$/.test(n)).sort())await db.exec(await readFile('db/'+file,'utf8'));
  const week=(await db.query<{id:number}>("INSERT INTO camp_week(name,minimum_age,maximum_age,capacity,starts_on,ends_on) VALUES('Fixture week',7,11,200,'2027-01-12','2027-01-16') RETURNING id")).rows[0].id;
  const other=(await db.query<{id:number}>("INSERT INTO camp_week(name,minimum_age,maximum_age,capacity,starts_on,ends_on) VALUES('Other fixture',7,11,200,'2027-01-18','2027-01-23') RETURNING id")).rows[0].id;
  const add=async(name:string,skills:string[])=>(await db.query<{id:number}>('INSERT INTO staff_member(name,adult,active,skills) VALUES($1,true,true,$2::text[]) RETURNING id',[name,skills])).rows[0].id;
  const available=await add('Available fixture',['program','guide']),unknown=await add('Unknown fixture',['program','guide']),outside=await add('Outside fixture',['program']);
  for(const [id,weeks] of [[available,[week]],[outside,[other]]] as const)await db.query("INSERT INTO staff_application(id,season,requested_role,status,data,staff_id,ready,resume_hash,resume_expires) VALUES($1,2027,'guide','approved',$2::jsonb,$3,true,'fixture','2099-01-01')",[randomUUID(),JSON.stringify({weeks:weeks.join(','),birth:'1990-01-01'}),id]);
  const building=(await db.query<{id:number}>("INSERT INTO building(name) VALUES('Fixture building') RETURNING id")).rows[0].id;
  await db.query("INSERT INTO dorm(building_id,name,physical_beds) VALUES($1,'Fixture cabin',16)",[building]);
  const {default:StaffPage}=await import('../app/[locale]/staff/page.tsx'),{default:WeekPage}=await import('../app/[locale]/page.tsx');
  for(const [name,status,arrived] of [['OverviewArrived','confirmed',true],['OverviewReleased','released',true],['OverviewExpected','confirmed',false]] as const){
   const id=randomUUID();await db.query("INSERT INTO registration(id,week_id,first_name,last_name,date_of_birth,gender_group,intake_channel,participation,notice_version,authorized_on,signer_role,signer_name,details,place_status) VALUES($1,$2,$3,'Fixture','2017-01-01','male','online','granted','pilot-2','2026-11-14','guardian','Sample guardian','{}',$4)",[id,week,name,status]);
   if(arrived)await db.query("INSERT INTO camper_arrival(registration_id,arrival_method,recorded_by) VALUES($1,'own','Sample staff')",[id]);
  }
  const {reviewTarget,emptyReview,saveReview}=await import('../lib/camp-reviews.ts');
  const reviewTargetWeek=reviewTarget(String(week),undefined)!,reviewBody=emptyReview(reviewTargetWeek).body;
  reviewBody.notes=[{id:randomUUID(),date:'2027-01-13',kind:'worked',text:'Fictional daily arrival observation',author:'Fictional leader'}];
  reviewBody.summary.worked='Fictional closing lesson from arrival';reviewBody.actions=[{id:randomUUID(),text:'Reuse fictional arrival signs',owner:'Sample owner',state:'open'}];
  await db.transaction(tx=>saveReview(tx,reviewTargetWeek,{revision:0,operation:'review',actor:'Fictional reviewer',body:reviewBody}));
  await db.query('UPDATE camp_week SET fee_cents=8000,award_limit=10 WHERE id=$1',[week]);
  for(const [code,expires]of [['ABCD1234','2099-01-01'],['ABCD5678','2000-01-01']]){
   const batch=randomUUID();await db.query("INSERT INTO scholarship_batch(id,week_id,distributor,distributor_role,issued_by,distributor_email,expires_on,fee_snapshot) VALUES($1,$2,'Fictional pastor','pastor','Fictional staff','sample@example.test',$3,$4::jsonb)",[batch,week,expires,JSON.stringify([{week,name:'Fixture week',fee:8000}])]);
   await db.query('INSERT INTO scholarship_code(code,batch_id,value_cents) VALUES($1,$2,3000)',[code,batch]);
  }
  for(const locale of ['en','es']){
   const props={params:Promise.resolve({locale}),searchParams:Promise.resolve({week:String(week)})};
   const html=renderToStaticMarkup(await StaffPage(props)),forms=html.match(/<form\b[\s\S]*?<\/form>/g)??[];
   const assignments=forms.filter(f=>f.includes('name="operation"')&&f.includes('value="assign"'));
   const normal=assignments.find(f=>!f.includes('name="overrideConfirmed"')),exception=assignments.find(f=>f.includes('name="overrideConfirmed"'));
   assert.ok(normal?.includes('Available fixture'));assert.ok(!normal?.includes('Unknown fixture'));assert.ok(!normal?.includes('Outside fixture'));assert.ok(exception?.includes('Unknown fixture'));assert.ok(exception?.includes('Outside fixture'));assert.ok(!exception?.includes('Available fixture'));
   const {default:HousingPage}=await import('../app/[locale]/housing/page.tsx');
   const housingHtml=renderToStaticMarkup(await HousingPage(props));
   assert.ok(housingHtml.includes(locale==='en'?'Delete room':'Eliminar habitación'));
   assert.ok(housingHtml.includes('name="confirmDelete"'));assert.ok(/<input(?=[^>]*name="confirmDelete")(?=[^>]*required)[^>]*>/.test(housingHtml));
   const weekHtml=renderToStaticMarkup(await WeekPage(props));const cabinForm=(weekHtml.match(/<form\b[\s\S]*?<\/form>/g)??[]).find(f=>f.includes('name="dorm"'));assert.ok(cabinForm);assert.ok(!cabinForm.includes('equipante:'));assert.ok(!weekHtml.includes(locale==='en'?'Camp Counselors':'Equipantes'));
   const {default:Overview}=await import('../app/[locale]/overview/page.tsx');
   const overviewHtml=renderToStaticMarkup(await Overview({...props,searchParams:Promise.resolve({season:'2027'})}));
   assert.ok(overviewHtml.includes(locale==='en'?'Currently at camp':'Actualmente en el campamento'));assert.ok(overviewHtml.includes('attendance=atCamp'));assert.ok(overviewHtml.includes('place=active'));assert.ok(overviewHtml.includes('/overview/review?week='));assert.ok(overviewHtml.includes('/overview/review?season=2027'));
   const {default:ReviewPage}=await import('../app/[locale]/overview/review/page.tsx');
   const weeklyReviewHtml=renderToStaticMarkup(await ReviewPage({...props,searchParams:Promise.resolve({week:String(week)})}));
   assert.ok(weeklyReviewHtml.includes('Fictional daily arrival observation'));assert.ok(weeklyReviewHtml.includes('Fictional closing lesson from arrival'));
   const seasonReviewHtml=renderToStaticMarkup(await ReviewPage({...props,searchParams:Promise.resolve({season:'2027'})}));
   assert.ok(seasonReviewHtml.includes('Fictional daily arrival observation'));assert.ok(seasonReviewHtml.includes('Fictional closing lesson from arrival'));assert.ok(seasonReviewHtml.includes('Reuse fictional arrival signs'));assert.ok(seasonReviewHtml.includes(locale==='en'?'Carry into season actions':'Llevar a las acciones de temporada'));
   const {default:Intake}=await import('../app/[locale]/intake/page.tsx');
   const intakeHtml=renderToStaticMarkup(await Intake({...props,searchParams:Promise.resolve({week:String(week),place:'confirmed'})}));
   assert.ok(intakeHtml.includes('OverviewArrived'));assert.ok(intakeHtml.includes('OverviewExpected'));assert.ok(!intakeHtml.includes('OverviewReleased'));
   const {default:Scholarships}=await import('../app/[locale]/intake/scholarships/page.tsx');
   const scholarshipHtml=renderToStaticMarkup(await Scholarships(props));
   assert.ok(scholarshipHtml.includes('name="expiresOn"'));assert.ok(scholarshipHtml.includes(locale==='en'?'Cost per camper':'Costo por campista'));
   const drafts=scholarshipHtml.match(/href="mailto:[^"]+"/g)??[];assert.equal(drafts.length,1);assert.ok(drafts[0].includes('ABCD1234'));assert.ok(!drafts[0].includes('ABCD5678'));
   const {formatMoney:scholarshipMoney}=await import('../lib/review-copy.ts');assert.ok(drafts[0].includes(encodeURIComponent(scholarshipMoney(5000,locale as 'en'|'es'))));assert.ok(!drafts[0].includes(encodeURIComponent(scholarshipMoney(3000,locale as 'en'|'es'))));
   const {default:CheckIn}=await import('../app/[locale]/check-in/page.tsx');
   const checkInHtml=renderToStaticMarkup(await CheckIn({...props,searchParams:Promise.resolve({week:String(week),attendance:'atCamp'})}));
   assert.ok(checkInHtml.includes('name="attendance"'));assert.ok(checkInHtml.includes('OverviewArrived'));assert.ok(checkInHtml.includes('OverviewReleased'));assert.ok(!checkInHtml.includes('OverviewExpected'));
   const {StaffApplicationForm}=await import('../app/[locale]/staff/apply/staff-application-form.tsx');
   for(const initialRole of ['guide','equipante','volunteer']){
    const applyHtml=renderToStaticMarkup(createElement(StaffApplicationForm,{locale:locale as 'en'|'es',weeks:[{id:week,name:'Fixture',start:'2027-01-12',end:'2027-01-16'}],seasons:[],initialRole}));
    assert.ok(/<form[^>]*noValidate/i.test(applyHtml));assert.ok(applyHtml.includes('data-application-field="email"'));assert.ok(applyHtml.includes('data-application-field="gender"'));
    assert.ok(!/name="sharing"[^>]*disabled/.test(applyHtml));
   }
   const {ApplicationReview}=await import('../app/[locale]/staff/applications/review.tsx');
   const {staffApplicationText}=await import('../lib/staff-application-copy.ts');
   const t=(key:string)=>staffApplicationText(locale as 'en'|'es',key);
   const counselorApp={id:'fixture',season:2027,role:'equipante',status:'approved',revision:1,data:{first:'Fictional',last:'Counselor'},preparation:{} as Record<string,string>,public_note:'',staff_id:1,ready:false,reference:null,canDelete:false,staff_review_required:false,minor:true};
   const reviewProps={locale:locale as 'en'|'es',members:[],missing:[],assignments:[]};
   const counselorHtml=renderToStaticMarkup(createElement(ApplicationReview,{...reviewProps,app:counselorApp}));
   for(const key of ['screening','trainingCheck','policy'])assert.ok(!counselorHtml.includes(t(key)));
   for(const key of ['counselorReview','counselorOrientation','campRulesRequired','guardianCheck'])assert.ok(counselorHtml.includes(t(key)));
   assert.ok(!counselorHtml.includes(t('counselorRules')));assert.ok(!counselorHtml.includes(t('campRulesTitle')));
   const rulesHtml=renderToStaticMarkup(createElement(ApplicationReview,{...reviewProps,app:{...counselorApp,preparation:{campRulesRequired:'yes',campRulesTitle:'Camp Rules Book',campRulesRevision:'5',campRulesSource:'link',campRulesUrl:'https://example.test/rules.pdf'}}}));
   for(const key of ['campRulesTitle','campRulesRevision','campRulesUrl','campRulesWaiting'])assert.ok(rulesHtml.includes(t(key)));
   assert.ok(!rulesHtml.includes(t('counselorRules')));
   const additionalHtml=renderToStaticMarkup(createElement(ApplicationReview,{...reviewProps,app:{...counselorApp,preparation:{backgroundDocumentRequired:'yes',trainingRequired:'yes',signedPolicyRequired:'yes',requiredPolicyName:'Named policy'}}}));
   for(const key of ['screening','trainingCheck','policy'])assert.ok(additionalHtml.includes(t(key)));
   const guideHtml=renderToStaticMarkup(createElement(ApplicationReview,{...reviewProps,app:{...counselorApp,role:'guide',minor:false,data:{...counselorApp.data,believerYears:'3',volunteerConviction:'yes',volunteerConvictionPrivate:'yes',volunteerCharges:'no',volunteerRestrictions:'no',volunteerSafeguarding:'no'}}}));
   for(const key of ['screening','trainingCheck','policy'])assert.ok(guideHtml.includes(t(key)));
   for(const key of ['guideScreening','guideScreeningReview','believerYears','volunteerConviction','volunteerCharges','volunteerRestrictions','volunteerSafeguarding','privateDiscussion'])assert.ok(guideHtml.includes(t(key)));
   assert.ok(!guideHtml.includes(t('volunteerConduct')));
   const split=cabinForm.indexOf('<details>');assert.ok(split>0);assert.ok(cabinForm.slice(0,split).includes('value="guide:'+available+'"'));assert.ok(!cabinForm.slice(0,split).includes('value="guide:'+unknown+'"'));assert.ok(cabinForm.slice(split).includes('value="guide:'+unknown+'"'));
  }
 }finally{hook.deregister();delete globals.availabilityRenderDb;await db.close();}
});
