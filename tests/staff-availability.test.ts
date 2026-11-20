import assert from 'node:assert/strict';
import {test} from 'node:test';
import {registerHooks} from 'node:module';
import {randomUUID} from 'node:crypto';
import {readFile,readdir} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {staffAvailability,saveStaffAvailability,assignWeeklyStaff} from '../lib/staff-availability.ts';

test('availability governs weekly and cabin assignments with confirmed audited exceptions',async t=>{
 const db=new PGlite();const globals=globalThis as unknown as {availabilityDb?:PGlite;availabilityRole?:string};globals.availabilityDb=db;globals.availabilityRole='leadership';
 const hooks=registerHooks({resolve(specifier,context,next){if(specifier==='next/navigation')return {url:'availability-test:navigation',shortCircuit:true};if(specifier==='next/headers')return {url:'availability-test:headers',shortCircuit:true};if(specifier.startsWith('.')&&!/\.[a-z]+$/i.test(specifier))return next(specifier+'.ts',context);return next(specifier,context);},load(url,context,next){
  if(url==='availability-test:navigation')return {format:'module',shortCircuit:true,source:'export function redirect(url){throw Object.assign(new Error("Redirect"),{url});}'};
  if(url==='availability-test:headers')return {format:'module',shortCircuit:true,source:'export async function cookies(){return {set(){}};}'};
  if(url.endsWith('/lib/database.ts'))return {format:'module',shortCircuit:true,source:'export async function getDatabase(){return globalThis.availabilityDb;}'};
  if(url.endsWith('/lib/session.ts'))return {format:'module',shortCircuit:true,source:'export async function currentRole(){return globalThis.availabilityRole;} export const isRole=()=>false;export const setSession=async()=>{};export const validDemoPassword=()=>false;'};
  return next(url,context);
 }});
 try{
  for(const file of (await readdir('db')).filter(n=>/^\d{3}-.+\.sql$/.test(n)).sort())await db.exec(await readFile('db/'+file,'utf8'));
  const first=(await db.query<{id:number}>("INSERT INTO camp_week(name,minimum_age,maximum_age,capacity,starts_on,ends_on) VALUES('First',7,11,200,'2027-01-12','2027-01-16') RETURNING id")).rows[0].id;
  const second=(await db.query<{id:number}>("INSERT INTO camp_week(name,minimum_age,maximum_age,capacity,starts_on,ends_on) VALUES('Second',7,11,200,'2027-01-18','2027-01-23') RETURNING id")).rows[0].id;
  const nextYear=(await db.query<{id:number}>("INSERT INTO camp_week(name,minimum_age,maximum_age,capacity,starts_on,ends_on) VALUES('Next year',7,11,200,'2028-01-12','2028-01-16') RETURNING id")).rows[0].id;
  const member=async(name:string,skills:string[],adult=true)=>(await db.query<{id:number}>('INSERT INTO staff_member(name,adult,active,skills) VALUES($1,$2,true,$3::text[]) RETURNING id',[name,adult,skills])).rows[0].id;
  const health=await member('Fictional health',['health']),direct=await member('Fictional direct',['program']),guide=await member('Fictional leader',['guide']),counselor=await member('Fictional counselor',['equipante'],false);
  const app=randomUUID();await db.query("INSERT INTO staff_application(id,season,requested_role,status,data,staff_id,ready,resume_hash,resume_expires) VALUES($1,2027,'volunteer','approved',$2::jsonb,$3,false,'fixture','2099-01-01')",[app,JSON.stringify({weeks:String(first)}),health]);
  const read=async(week:number,id:number)=>(await staffAvailability(db,week,[id])).get(id)!;
  const override={confirmed:true,reason:'Confirmed directly with this fictional staff member'};
  await t.test('only ready applications supply availability; weeks and seasons stay separate',async()=>{
   assert.equal((await read(first,health)).state,'unknown');await db.query('UPDATE staff_application SET ready=true WHERE id=$1',[app]);
   assert.equal((await read(first,health)).state,'available');assert.equal((await read(second,health)).state,'unavailable');assert.equal((await read(nextYear,health)).state,'unknown');assert.equal((await read(first,direct)).state,'unknown');
  });
  await t.test('weekly assignment cannot bypass availability through a forged request',async()=>{
   assert.equal(await db.transaction(tx=>assignWeeklyStaff(tx,second,health,'health',{confirmed:false,reason:''})),'availabilityRequired');
   assert.equal(await db.transaction(tx=>assignWeeklyStaff(tx,second,health,'health',{confirmed:true,reason:''})),'availabilityRequired');
   assert.equal((await db.query('SELECT 1 FROM weekly_staff_assignment')).rows.length,0);
   assert.equal(await db.transaction(tx=>assignWeeklyStaff(tx,first,health,'health',{confirmed:false,reason:''})),'saved');
   assert.equal(await db.transaction(tx=>assignWeeklyStaff(tx,second,health,'health',override)),'saved');
   assert.equal(await db.transaction(tx=>assignWeeklyStaff(tx,second,health,'health',override)),'saved');
   const events=(await db.query<{detail:{availability:{state:string}}}>("SELECT detail FROM staff_availability_event WHERE operation='assignmentOverride'")).rows;assert.equal(events.length,1);assert.equal(events[0].detail.availability.state,'unavailable');
   assert.equal(await db.transaction(tx=>assignWeeklyStaff(tx,first,direct,'health',override)),'invalid');
   await db.query('UPDATE staff_member SET active=false WHERE id=$1',[direct]);assert.equal(await db.transaction(tx=>assignWeeklyStaff(tx,first,direct,'program',override)),'invalid');await db.query('UPDATE staff_member SET active=true WHERE id=$1',[direct]);
  });
  await t.test('staff can confirm direct-entry availability, including none; edits are audited and revision checked',async()=>{
   const input={staff:direct,week:first,weeks:[first],revision:0,application:'',reason:'Availability confirmed by phone'};
   assert.equal(await db.transaction(tx=>saveStaffAvailability(tx,{...input,weeks:[nextYear]})),'invalid');assert.equal((await read(first,direct)).state,'unknown');
   assert.equal(await db.transaction(tx=>saveStaffAvailability(tx,input)),'saved');assert.equal((await read(first,direct)).source,'staff');assert.equal((await read(first,direct)).state,'available');
   assert.equal(await db.transaction(tx=>saveStaffAvailability(tx,{...input,weeks:[second]})),'stale');assert.equal((await read(first,direct)).state,'available');
   assert.equal(await db.transaction(tx=>assignWeeklyStaff(tx,first,direct,'program',{confirmed:false,reason:''})),'saved');
   assert.equal(await db.transaction(tx=>saveStaffAvailability(tx,{...input,revision:1,weeks:[]})),'saved');assert.equal((await read(first,direct)).state,'unavailable');assert.equal((await read(first,direct)).source,'staff');assert.equal((await read(nextYear,direct)).state,'unknown');
   assert.equal((await db.query('SELECT 1 FROM weekly_staff_assignment WHERE staff_id=$1 AND week_id=$2',[direct,first])).rows.length,1);
  });
  await t.test('confirmed staff changes override application weeks without rewriting the application',async()=>{
   const prior=await read(first,health);assert.equal(await db.transaction(tx=>saveStaffAvailability(tx,{staff:health,week:first,weeks:[second],revision:0,application:prior.application,reason:'Changed availability confirmed'})),'saved');
   assert.equal((await read(first,health)).state,'unavailable');assert.equal((await read(second,health)).state,'available');assert.equal((await db.query<{data:{weeks:string}}>('SELECT data FROM staff_application WHERE id=$1',[app])).rows[0].data.weeks,String(first));
   assert.equal((await db.query('SELECT 1 FROM weekly_staff_assignment WHERE staff_id=$1',[health])).rows.length,2);
  });
  const actions=await import('../app/[locale]/actions.ts'),staffActions=await import('../app/[locale]/staff/actions.ts');
  const building=(await db.query<{id:number}>("INSERT INTO building(name) VALUES('Fixture building') RETURNING id")).rows[0].id;
  const dorm=(await db.query<{id:number}>("INSERT INTO dorm(building_id,name,physical_beds) VALUES($1,'Fixture cabin',16) RETURNING id",[building])).rows[0].id;
  const form=(extra:Record<string,string>={})=>{const f=new FormData();for(const [key,value]of Object.entries({locale:'en',week:String(first),dorm:String(dorm),usable:'16',guests:'0',min:'7',max:'11',group:'male',active:'on',...extra}))f.set(key,value);f.append('staff','guide:'+guide);f.append('staff','equipante:'+counselor);return f;};
  const redirected=async(run:()=>Promise<unknown>)=>{try{await run();assert.fail('Expected redirect');}catch(error){assert.ok((error as {url?:string}).url);return (error as {url:string}).url;}};
  await t.test('cabin assignment enforces availability atomically and records each confirmed exception',async()=>{
   assert.ok((await redirected(()=>actions.saveDorm(form()))).includes('availabilityRequired'));assert.equal((await db.query('SELECT 1 FROM weekly_dorm')).rows.length,0);
   assert.ok((await redirected(()=>actions.saveDorm(form({overrideConfirmed:'on',overrideReason:override.reason})))).includes('status=saved'));
   assert.equal((await db.query('SELECT 1 FROM weekly_dorm_staff WHERE week_id=$1 AND dorm_id=$2',[first,dorm])).rows.length,2);
   const events=(await db.query<{dorm_id:number;reason:string}>("SELECT dorm_id,reason FROM staff_availability_event WHERE operation='assignmentOverride' AND dorm_id=$1",[dorm])).rows;assert.equal(events.length,2);assert.ok(events.every(event=>event.reason===override.reason));
   assert.ok((await redirected(()=>actions.saveDorm(form()))).includes('status=saved'));assert.equal((await db.query("SELECT 1 FROM staff_availability_event WHERE operation='assignmentOverride' AND dorm_id=$1",[dorm])).rows.length,2);
  });
  await t.test('availability exceptions do not bypass adult cabin leadership or authorization',async()=>{
   const minor=await member('Fictional minor',['guide'],false),invalid=form({overrideConfirmed:'on',overrideReason:override.reason});invalid.delete('staff');invalid.append('staff','guide:'+minor);
   assert.ok((await redirected(()=>actions.saveDorm(invalid))).includes('status=invalid'));assert.equal((await db.query('SELECT 1 FROM weekly_dorm_staff WHERE dorm_id=$1',[dorm])).rows.length,2);
   const birthdayGuide=await member('Fictional January birthday',['guide']);
   await db.query("INSERT INTO staff_application(id,season,requested_role,status,data,staff_id,ready,resume_hash,resume_expires) VALUES($1,2027,'guide','approved',$2::jsonb,$3,true,'fixture','2099-01-01')",[randomUUID(),JSON.stringify({weeks:String(second),birth:'2009-01-15'}),birthdayGuide]);
   const early=form({overrideConfirmed:'on',overrideReason:override.reason});early.delete('staff');early.append('staff','guide:'+birthdayGuide);
   assert.ok((await redirected(()=>actions.saveDorm(early))).includes('status=invalid'));assert.equal((await db.query('SELECT 1 FROM weekly_dorm_staff WHERE dorm_id=$1',[dorm])).rows.length,2);
   globals.availabilityRole='registration';assert.ok((await redirected(()=>actions.saveDorm(form({overrideConfirmed:'on',overrideReason:override.reason})))).includes('status=denied'));
   const weekly=new FormData();for(const [key,value]of Object.entries({locale:'en',operation:'assign',week:String(second),staff:String(direct),role:'program',overrideConfirmed:'on',overrideReason:override.reason}))weekly.set(key,value);
   assert.equal(await redirected(()=>staffActions.saveStaff(weekly)),'/en');assert.equal((await db.query('SELECT 1 FROM weekly_staff_assignment WHERE staff_id=$1 AND week_id=$2',[direct,second])).rows.length,0);
  });
 }finally{hooks.deregister();delete globals.availabilityDb;delete globals.availabilityRole;await db.close();}
});
