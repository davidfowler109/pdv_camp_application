import assert from 'node:assert/strict';
import {test} from 'node:test';
import {registerHooks} from 'node:module';
import {randomUUID} from 'node:crypto';
import {readFile,readdir} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {camperCost,awardPreview} from '../lib/scholarship-pricing.ts';

test('scholarship allocations quote camper cost and enforce inclusive Panama expiration',async()=>{
 const db=new PGlite(),globals=globalThis as unknown as {scholarshipTestDb?:PGlite};globals.scholarshipTestDb=db;
 const hooks=registerHooks({resolve(specifier,context,next){
  if(specifier==='next/navigation'||specifier==='next/cache')return {url:'scholarship-test:'+specifier,shortCircuit:true};
  if(specifier.startsWith('.')&&!/\.[a-z]+$/i.test(specifier))return next(specifier+'.ts',context);return next(specifier,context);
 },load(url,context,next){
  const stub=(source:string)=>({format:'module' as const,shortCircuit:true,source});
  if(url==='scholarship-test:next/navigation')return stub('export function redirect(url){throw Object.assign(new Error("Redirect"),{url});}');
  if(url==='scholarship-test:next/cache')return stub('export function revalidatePath(){}');
  if(url.endsWith('/lib/database.ts'))return stub('export async function getDatabase(){return globalThis.scholarshipTestDb;}');
  if(url.endsWith('/lib/session.ts'))return stub('export async function currentRole(){return "leadership";}');
  return next(url,context);
 }});
 try{
  for(const file of (await readdir('db')).filter(n=>/^\d{3}-.+\.sql$/.test(n)).sort())await db.exec(await readFile('db/'+file,'utf8'));
  await db.exec("INSERT INTO camp_week(id,name,minimum_age,maximum_age,capacity,award_limit,fee_cents,starts_on,ends_on) VALUES(1,'Fixture one',7,11,200,20,8000,'2027-01-12','2027-01-16'),(2,'Fixture two',7,11,200,20,10000,'2027-01-18','2027-01-23'); INSERT INTO scholarship_season(year,award_limit) VALUES(2027,20)");
  const {manageScholarships}=await import('../app/[locale]/review-actions.ts');
  const {redeemCode,finance}=await import('../lib/review.ts');
  const {scholarshipEmail}=await import('../lib/scholarship-email.ts');
  const {today,yesterday}=(await db.query<{today:string;yesterday:string}>("SELECT (CURRENT_TIMESTAMP AT TIME ZONE 'America/Panama')::date::text AS today,((CURRENT_TIMESTAMP AT TIME ZONE 'America/Panama')::date-1)::text AS yesterday")).rows[0];
  const allocate=async(batch:string,expiresOn:string,season=false)=>{
   const form=new FormData();for(const[k,v]of Object.entries({locale:'en',week:'1',operation:'issue',batchId:batch,count:'2',value:'30.00',actor:'Fictional staff',distributor:'Fictional pastor',distributorRole:'pastor',email:'fictional@example.test',expiresOn}))form.set(k,v);if(season)form.set('scope','season');
   try{await manageScholarships(form);assert.fail('Expected redirect');}catch(error){assert.ok((error as {url?:string}).url);return (error as {url:string}).url;}
  };
  assert.ok((await allocate(randomUUID(),'')).includes('status=invalid'));
  assert.ok((await allocate(randomUUID(),yesterday)).includes('status=invalid'));
  assert.equal((await db.query('SELECT 1 FROM scholarship_batch')).rows.length,0);
  const batch=randomUUID();assert.ok((await allocate(batch,today)).includes('status=saved'));
  type Batch={distributor:string;instructions:string|null;expires_on:string|null;fee_snapshot:{week:number;name:string;fee:number|null}[]|null};
  const issued=(await db.query<Batch>('SELECT distributor,instructions,expires_on::text,fee_snapshot FROM scholarship_batch WHERE id=$1',[batch])).rows[0];
  const codes=(await db.query<{code:string;value_cents:number}>('SELECT code,value_cents FROM scholarship_code WHERE batch_id=$1 ORDER BY code',[batch])).rows;
  await db.exec('UPDATE camp_week SET fee_cents=9000 WHERE id=1');
  for(const locale of ['en','es'] as const){
   const email=scholarshipEmail(locale,'Fixture one',issued,codes,[]);
   const {formatMoney}=await import('../lib/review-copy.ts');
   assert.ok(email.includes(formatMoney(5000,locale)),email);assert.ok(!email.includes(formatMoney(3000,locale)));assert.ok(!email.includes(formatMoney(6000,locale)));assert.ok(email.includes('Panam'));assert.ok(email.includes(codes[0].code));
  }
  const register=async()=>{const id=randomUUID();await db.query("INSERT INTO registration(id,week_id,first_name,last_name,date_of_birth,gender_group,intake_channel,participation,notice_version,authorized_on,signer_role,signer_name,details) VALUES($1,1,'Fictional','Camper','2017-01-01','male','online','granted','pilot-2','2026-11-14','guardian','Sample guardian','{}')",[id]);return id;};
  const first=await register();assert.equal(await redeemCode(db,1,first,codes[0].code),true);
  await db.query('UPDATE scholarship_batch SET expires_on=$2 WHERE id=$1',[batch,yesterday]);
  assert.equal(await redeemCode(db,1,await register(),codes[1].code),false);assert.equal((await finance(db,first)).award,3000);
  await db.query('UPDATE scholarship_batch SET expires_on=NULL WHERE id=$1',[batch]);assert.equal(await redeemCode(db,1,await register(),codes[1].code),true);
  const seasonBatch=randomUUID();assert.ok((await allocate(seasonBatch,'2099-12-31',true)).includes('status=saved'));
  const seasonal=(await db.query<Batch>('SELECT distributor,instructions,expires_on::text,fee_snapshot FROM scholarship_batch WHERE id=$1',[seasonBatch])).rows[0];
  const seasonEmail=scholarshipEmail('en','2027',seasonal,[{code:'DEMO1234',value_cents:3000}],[]);assert.ok(seasonEmail.includes('Fixture one'));assert.ok(seasonEmail.includes('Fixture two'));assert.ok(seasonEmail.includes('$60.00'));assert.ok(seasonEmail.includes('$70.00'));assert.ok(!seasonEmail.includes('$30.00'));
  assert.equal(camperCost(2000,3000),0);assert.equal(camperCost(null,3000),null);assert.equal(awardPreview('30,50'),3050);assert.equal(awardPreview('bad'),null);
 }finally{hooks.deregister();delete globals.scholarshipTestDb;await db.close();}
});
