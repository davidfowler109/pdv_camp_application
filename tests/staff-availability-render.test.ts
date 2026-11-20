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
  if(['next/navigation','next/link','next/image','next/headers'].includes(specifier))return {url:'availability-render:'+specifier,shortCircuit:true};
  if(specifier.startsWith('.')&&!/\.[a-z]+$/i.test(specifier)){for(const ext of ['.ts','.tsx']){const candidate=new URL(specifier+ext,context.parentURL);if(existsSync(fileURLToPath(candidate)))return next(candidate.href,context);}}return next(specifier,context);
 },load(url,context,next){
  const stub=(source:string)=>({format:'module' as const,shortCircuit:true,source});
  if(url==='availability-render:next/navigation')return stub('export const useRouter=()=>({refresh(){}});export function redirect(url){throw Error(url);}export function notFound(){throw Error("Not found");}');
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
  for(const locale of ['en','es']){
   const props={params:Promise.resolve({locale}),searchParams:Promise.resolve({week:String(week)})};
   const html=renderToStaticMarkup(await StaffPage(props)),forms=html.match(/<form\b[\s\S]*?<\/form>/g)??[];
   const assignments=forms.filter(f=>f.includes('name="operation"')&&f.includes('value="assign"'));
   const normal=assignments.find(f=>!f.includes('name="overrideConfirmed"')),exception=assignments.find(f=>f.includes('name="overrideConfirmed"'));
   assert.ok(normal?.includes('Available fixture'));assert.ok(!normal?.includes('Unknown fixture'));assert.ok(!normal?.includes('Outside fixture'));assert.ok(exception?.includes('Unknown fixture'));assert.ok(exception?.includes('Outside fixture'));assert.ok(!exception?.includes('Available fixture'));
   const weekHtml=renderToStaticMarkup(await WeekPage(props));const cabinForm=(weekHtml.match(/<form\b[\s\S]*?<\/form>/g)??[]).find(f=>f.includes('name="dorm"'));assert.ok(cabinForm);
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
