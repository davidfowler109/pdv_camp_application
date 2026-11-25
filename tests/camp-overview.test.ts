import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFile,readdir} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {PGlite} from '@electric-sql/pglite';
import {campOverview,overviewSeasons,defaultOverviewSeason,attendanceFilterSql,attendanceViews,attendanceView} from '../lib/camp-overview.ts';

test('overview counts physical departures, valid arrivals and released registrations consistently',async()=>{
 const db=new PGlite();
 try{
  for(const file of (await readdir('db')).filter(n=>/^\d{3}-.+\.sql$/.test(n)).sort())await db.exec(await readFile('db/'+file,'utf8'));
  await db.exec("INSERT INTO camp_week(id,name,minimum_age,maximum_age,capacity,starts_on,ends_on) VALUES(1,'Fixture current',7,11,200,'2027-01-12','2027-01-16'),(2,'Fixture empty',7,11,200,'2028-01-12','2028-01-16'),(3,'Fixture undated',7,11,200,NULL,NULL)");
  const register=async(status='confirmed',arrival=false)=>{
   const id=randomUUID();await db.query("INSERT INTO registration(id,week_id,first_name,last_name,date_of_birth,gender_group,intake_channel,participation,notice_version,authorized_on,signer_role,signer_name,details,place_status) VALUES($1,1,'Fictional','Camper','2017-01-01','male','online','granted','pilot-2','2026-11-14','guardian','Sample guardian','{}',$2)",[id,status]);
   if(arrival)await db.query("INSERT INTO camper_arrival(registration_id,arrival_method,recorded_by) VALUES($1,'own','Sample staff')",[id]);return id;
  };
  await register();await register('pending');await register('released');
  const voided=await register('confirmed',true);await db.query('UPDATE camper_arrival SET voided_at=CURRENT_TIMESTAMP WHERE registration_id=$1',[voided]);
  await register('confirmed',true);await register('released',true);
  const pickup=await register('confirmed',true),boarded=await register('confirmed',true),busLeft=await register('confirmed',true);
  await db.query("INSERT INTO camper_departure(registration_id,week_id,method,pickup_name,recorded_by) VALUES($1,1,'pickup','Sample guardian','Sample staff')",[pickup]);
  await db.exec("INSERT INTO return_bus(week_id,bus_key,name,departed_at) VALUES(1,'waiting','Fixture boarding',NULL),(1,'left','Fixture departed',CURRENT_TIMESTAMP)");
  for(const [id,key]of [[boarded,'waiting'],[busLeft,'left']])await db.query("INSERT INTO camper_departure(registration_id,week_id,method,bus_key,recorded_by,handoff_required) VALUES($1,1,'bus',$2,'Sample staff',true)",[id,key]);
  const weeks=await campOverview(db),w=weeks[0];
  assert.deepEqual([w.registered,w.confirmed,w.released,w.arrived,w.atCamp,w.departed,w.expected,w.remaining],[7,6,2,5,3,2,2,194]);
  assert.equal(w.arrived,w.atCamp+w.departed);
  assert.deepEqual([weeks[1].registered,weeks[1].arrived,weeks[1].remaining],[0,0,200]);
  for(const view of attendanceViews){
   const count=(await db.query<{n:number}>(`SELECT count(*)::integer AS n FROM registration r
    LEFT JOIN camper_arrival a ON a.registration_id=r.id AND a.voided_at IS NULL
    LEFT JOIN camper_departure departure ON departure.registration_id=a.registration_id
    LEFT JOIN return_bus bus ON bus.week_id=departure.week_id AND bus.bus_key=departure.bus_key
    WHERE r.week_id=1 AND (${attendanceFilterSql(view)})`)).rows[0].n;
   assert.equal(count,w[view]);
  }
  assert.deepEqual(overviewSeasons(weeks),['2027','2028','undated']);
  assert.equal(defaultOverviewSeason(overviewSeasons(weeks),'2026-11-21'),'2027');
  assert.equal(defaultOverviewSeason(overviewSeasons(weeks),'2029-01-01'),'2028');
  assert.equal(attendanceView('unexpected'),'');
 }finally{await db.close();}
});
