import assert from 'node:assert/strict';
import {test} from 'node:test';
import {registerHooks} from 'node:module';
import {readFile,readdir} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';

test('room deletion requires leadership and confirmation and preserves linked records',async()=>{
 const db=new PGlite();
 const globals=globalThis as unknown as {inventoryDb?:PGlite;inventoryRole?:string};
 globals.inventoryDb=db;globals.inventoryRole='leadership';
 const hooks=registerHooks({resolve(specifier,context,next){
  if(specifier==='next/navigation'||specifier==='next/headers')return {url:'inventory-test:'+specifier,shortCircuit:true};
  if(specifier.startsWith('.')&&!/\.[a-z]+$/i.test(specifier))return next(specifier+'.ts',context);
  return next(specifier,context);
 },load(url,context,next){
  const stub=(source:string)=>({format:'module' as const,shortCircuit:true,source});
  if(url==='inventory-test:next/navigation')return stub('export function redirect(url){throw Object.assign(new Error("Redirect"),{url});}');
  if(url==='inventory-test:next/headers')return stub('export async function cookies(){return {set(){}};}');
  if(url.endsWith('/lib/database.ts'))return stub('export async function getDatabase(){return globalThis.inventoryDb;}');
  if(url.endsWith('/lib/session.ts'))return stub('export async function currentRole(){return globalThis.inventoryRole;} export const isRole=()=>false;export const setSession=async()=>{};export const validDemoPassword=()=>false;');
  return next(url,context);
 }});
 try{
  for(const file of (await readdir('db')).filter(n=>/^\d{3}-.+\.sql$/.test(n)).sort())await db.exec(await readFile('db/'+file,'utf8'));
  const {deleteRoom}=await import('../app/[locale]/actions.ts');
  const building=(await db.query<{id:number}>("INSERT INTO building(name) VALUES('Fictional inventory') RETURNING id")).rows[0].id;
  let roomNumber=0;
  const room=async(kind='camper')=>(await db.query<{id:number}>("INSERT INTO dorm(building_id,name,physical_beds,room_kind) VALUES($1,$2,10,$3) RETURNING id",[building,'Fixture room '+(++roomNumber),kind])).rows[0].id;
  const exists=async(id:number)=>(await db.query('SELECT 1 FROM dorm WHERE id=$1',[id])).rows.length===1;
  const remove=async(id:number,confirmed=true)=>{
   const form=new FormData();form.set('locale','en');form.set('dorm',String(id));if(confirmed)form.set('confirmDelete','yes');
   try{await deleteRoom(form);assert.fail('Expected redirect');}catch(error){assert.ok((error as {url?:string}).url);return (error as {url:string}).url;}
  };
  const unused=await room();
  assert.equal(await remove(unused,false),'/en/housing?status=invalid');assert.ok(await exists(unused));
  for(const role of ['registration','health','guide',undefined]){
   globals.inventoryRole=role;assert.equal(await remove(unused),'/en/housing?status=denied');assert.ok(await exists(unused));
  }
  globals.inventoryRole='leadership';
  assert.equal(await remove(unused),'/en/housing?status=deleted');assert.ok(!await exists(unused));
  assert.equal(await remove(unused),'/en/housing?status=invalid');
  const hotel=await room('hotel');assert.equal(await remove(hotel),'/en/housing?status=deleted');assert.ok(!await exists(hotel));
  const configured=await room();
  const week=(await db.query<{id:number}>("INSERT INTO camp_week(name,minimum_age,maximum_age,capacity) VALUES('Fixture week',7,11,200) RETURNING id")).rows[0].id;
  await db.query("INSERT INTO weekly_dorm(week_id,dorm_id,minimum_age,maximum_age,usable_beds,guest_beds,gender_group,in_service) VALUES($1,$2,7,11,10,0,'female',true)",[week,configured]);
  assert.equal(await remove(configured),'/en/housing?status=roomInUse');assert.ok(await exists(configured));
  assert.equal((await db.query('SELECT 1 FROM weekly_dorm WHERE dorm_id=$1',[configured])).rows.length,1);
  const history=await room();
  const staff=(await db.query<{id:number}>("INSERT INTO staff_member(name,adult,team_role) VALUES('Fictional leader',true,'guide') RETURNING id")).rows[0].id;
  await db.query("INSERT INTO staff_availability_event(staff_id,dorm_id,operation,actor,reason) VALUES($1,$2,'assignmentOverride','Fictional reviewer','Historical fixture')",[staff,history]);
  assert.equal(await remove(history),'/en/housing?status=roomInUse');assert.ok(await exists(history));
  assert.equal((await db.query('SELECT 1 FROM staff_availability_event WHERE dorm_id=$1',[history])).rows.length,1);
 }finally{hooks.deregister();delete globals.inventoryDb;delete globals.inventoryRole;await db.close();}
});
