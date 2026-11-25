import assert from 'node:assert/strict';
import {test} from 'node:test';
import {registerHooks} from 'node:module';
import {randomUUID} from 'node:crypto';
import {readFile,readdir} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';

test('weekly observations feed independent season reviews with guarded completion and snapshots',async()=>{
 const db=new PGlite(),globals=globalThis as unknown as {reviewTestDb?:PGlite;reviewTestRole?:string};globals.reviewTestDb=db;globals.reviewTestRole='leadership';
 const hooks=registerHooks({resolve(specifier,context,next){if(specifier.startsWith('.')&&!/\.[a-z]+$/i.test(specifier))return next(specifier+'.ts',context);return next(specifier,context);},load(url,context,next){
  if(url.endsWith('/lib/session.ts'))return {format:'module',shortCircuit:true,source:'export async function currentRole(){return globalThis.reviewTestRole;}'};
  if(url.endsWith('/lib/database.ts'))return {format:'module',shortCircuit:true,source:'export async function getDatabase(){return globalThis.reviewTestDb;}'};
  return next(url,context);
 }});
 try{
  for(const file of (await readdir('db')).filter(n=>/^\d{3}-.+\.sql$/.test(n)).sort())await db.exec(await readFile('db/'+file,'utf8'));
  await db.exec("INSERT INTO camp_week(id,name,minimum_age,maximum_age,capacity,starts_on,ends_on) VALUES(1,'Fixture one',7,11,200,'2027-01-12','2027-01-16'),(2,'Fixture next season',7,11,200,'2028-01-12','2028-01-16')");
  const {reviewTarget,emptyReview,loadReview,saveReview,reviewMetrics}=await import('../lib/camp-reviews.ts');
  const weekly=reviewTarget('1',undefined)!,season=reviewTarget(undefined,'2027')!;
  assert.equal(reviewTarget('1','2027'),null);assert.equal(reviewTarget('1 OR true',undefined),null);
  assert.equal((await loadReview(db,weekly)).revision,0);assert.equal((await db.query('SELECT 1 FROM camp_after_action_review')).rows.length,0);
  const body=emptyReview(weekly).body;body.notes.push({id:randomUUID(),date:'2027-01-13',kind:'worked',text:'Clear bus signs helped arrival',author:'Fictional leader'});body.actions.push({id:randomUUID(),text:'Reuse signs next season',owner:'Fictional team',state:'open'});
  const save=(target:typeof weekly,revision:number,operation:string,answers:unknown=body,confirmed=false)=>db.transaction(tx=>saveReview(tx,target,{revision,operation,actor:'Fictional reviewer',body:answers,confirmed}));
  assert.equal(await save(weekly,0,'save'),'saved');let record=await loadReview(db,weekly);
  assert.equal(record.body.notes[0].text,body.notes[0].text);assert.equal(record.state,'draft');
  assert.equal(await save(weekly,0,'save'),'stale');
  assert.equal(await save(weekly,record.revision,'review'),'summaryRequired');
  const invalid=structuredClone(body);invalid.notes[0].date='2027-02-30';assert.equal(await save(weekly,record.revision,'save',invalid),'invalid');
  body.summary.worked='Reuse the clear bus signage.';assert.equal(await save(weekly,record.revision,'review'),'reviewed');record=await loadReview(db,weekly);assert.ok(record.reviewed_at);assert.equal(record.reviewed_by,'Fictional reviewer');assert.equal(record.metrics?.registered,0);
  const registration=randomUUID();await db.query("INSERT INTO registration(id,week_id,first_name,last_name,date_of_birth,gender_group,intake_channel,participation,notice_version,authorized_on,signer_role,signer_name,details) VALUES($1,1,'Fictional','Camper','2017-01-01','male','online','granted','pilot-2','2026-11-14','guardian','Sample guardian','{}')",[registration]);
  assert.equal((await reviewMetrics(db,weekly)).registered,1);assert.equal((await loadReview(db,weekly)).metrics?.registered,0);
  assert.equal(await save(weekly,record.revision,'save'),'reopenRequired');assert.equal(await save(weekly,record.revision,'delete',body,true),'invalid');
  const seasonBody=emptyReview(season).body;seasonBody.summary.worked=record.body.summary.worked;seasonBody.actions=[{...record.body.actions[0],id:randomUUID()}];
  assert.equal(await save(season,0,'review',seasonBody),'reviewed');assert.equal((await loadReview(db,season)).metrics?.registered,1);assert.equal((await loadReview(db,weekly)).body.actions[0].state,'open');
  assert.equal((await loadReview(db,reviewTarget(undefined,'2028')!)).revision,0);
  assert.equal(await save(weekly,record.revision,'reopen'),'saved');record=await loadReview(db,weekly);assert.equal(record.state,'draft');
  assert.equal(await save(weekly,record.revision,'delete',body,false),'invalid');assert.equal(await save(weekly,record.revision,'delete',body,true),'deleted');
  assert.equal(await save(weekly,0,'save'),'saved');assert.equal(await save(weekly,record.revision,'save'),'stale');assert.equal((await loadReview(db,season)).state,'reviewed');
  const api=await import('../app/api/camp-reviews/route.ts');
  const request=(origin='http://localhost')=>new Request('http://localhost/api/camp-reviews',{method:'POST',headers:{origin,'Content-Type':'application/json'},body:JSON.stringify({week:'1',revision:0,operation:'save',actor:'Fictional staff',body})});
  for(const role of ['registration','health','guide',undefined]){globals.reviewTestRole=role;assert.equal((await api.POST(request())).status,403);}
  globals.reviewTestRole='leadership';assert.equal((await api.POST(request('https://other.test'))).status,403);assert.equal((await api.POST(request())).status,409);
 }finally{hooks.deregister();delete globals.reviewTestDb;delete globals.reviewTestRole;await db.close();}
});
