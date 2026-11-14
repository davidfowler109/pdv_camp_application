import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile,readdir } from "node:fs/promises";
import { test } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { getEventHousing,saveEventHousing,eventHousingIssues,releaseEventHousing,suggestEventHousing } from "../lib/event-housing.ts";

test("special-event housing shares rooms, honors requests and audits reviewed assignments",async t=>{
  const db=new PGlite(),event=randomUUID(),other=randomUUID();
  const people:string[]=Array.from({length:9},()=>randomUUID());
  try{
    const folder=new URL("../db/",import.meta.url);
    for(const file of (await readdir(folder)).filter(f=>/^\d{3}-.+\.sql$/.test(f)).sort())await db.exec(await readFile(new URL(file,folder),"utf8"));
    await db.exec(await readFile(new URL("025-event-housing.sql",folder),"utf8"));
    await db.exec(`INSERT INTO building(id,name) VALUES(1,'Fictional hotel');
      INSERT INTO dorm(id,building_id,name,physical_beds,default_usable_beds,room_kind) VALUES(1,1,'Room 1',2,2,'hotel'),(2,1,'Room 2',2,2,'hotel'),(3,1,'Cabin 10',4,4,'camper'),(4,1,'Unreserved room',2,2,'hotel')`);
    for(const id of [event,other])await db.query(`INSERT INTO special_event(id,name,starts_at,ends_at,capacity,day_attendance,overnight_attendance)
      VALUES($1,'Fictional adult event','2027-03-01T12:00','2027-03-03T12:00',20,true,true)`,[id]);
    for(const room of [1,2,3])await db.query("INSERT INTO event_room_reservation(event_id,dorm_id) VALUES($1,$2)",[event,room]);
    for(let i=0;i<people.length;i++)await db.query(`INSERT INTO event_attendee(id,event_id,first_name,last_name,contact,attendance,rooming,rooming_code,church,source,authorization_date,notice_version,place_status)
      VALUES($1,$2,$3,'Sample','Fictional contact',$4,$5,$6,$7,'online','2026-11-13','event-pilot-1','confirmed')`,
      [people[i],event,"Sample "+i,i===8?"day":"overnight",i===8?null:i<3?"group":i<5?"church":"none",i<3?"FRIENDS":null,i>=3&&i<5?"Sample Church":null]);
    const snapshot=async()=>(await getEventHousing(db,event))!;
    const command=async(operation:string,values:Record<string,string>={})=>{
      const form=new FormData();for(const[k,v]of Object.entries({event,operation,revision:String((await snapshot()).event.housing_revision),actor:"Sample staff",reason:"Reviewed fictional arrangement",...values}))form.set(k,v);return form;
    };
    const save=(form:FormData)=>db.transaction(tx=>saveEventHousing(tx,form));
    await t.test("suggestions use only overnight attendees, keep groups together and consume one bed per adult",async()=>{
      assert.equal((await snapshot()).people.length,8);
      assert.equal((await save(await command("generate"))).status,"saved");
      const plan=await snapshot();assert.equal(plan.placements.length,8);
      assert.equal(new Set(plan.placements.filter(p=>people.slice(0,3).includes(p.attendee_id)).map(p=>p.dorm_id)).size,1);
      assert.equal(new Set(plan.placements.filter(p=>people.slice(3,5).includes(p.attendee_id)).map(p=>p.dorm_id)).size,1);
      assert.equal(plan.placements.some(p=>p.attendee_id===people[8]),false);
      assert.equal(plan.placements.some(p=>p.supervisor),false);
      assert.deepEqual(eventHousingIssues(plan),[]);
      assert.equal((await save(await command("publish"))).status,"saved");assert.ok((await snapshot()).event.housing_published_at);
    });
    await t.test("manual changes reject full, unreserved, disabled and foreign-event assignments",async()=>{
      assert.equal((await save(await command("place",{attendee:people[0],room:"4"}))).status,"roomUnavailable");
      const foreign=randomUUID();
      await db.query(`INSERT INTO event_attendee(id,event_id,first_name,last_name,contact,attendance,rooming,source,authorization_date,notice_version)
        VALUES($1,$2,'Foreign','Sample','Contact','overnight','none','online','2026-11-13','event-pilot-1')`,[foreign,other]);
      assert.equal((await save(await command("place",{attendee:foreign,room:"1"}))).status,"invalid");
      assert.equal((await save(await command("place",{attendee:people[8],room:"1"}))).status,"invalid");
      const plan=await snapshot(),own=plan.placements.find(p=>p.attendee_id===people[0])!,full=plan.rooms.find(r=>r.id!==own.dorm_id)!;
      assert.equal((await save(await command("place",{attendee:people[0],room:String(full.id)}))).status,"capacity");
      assert.equal((await save(await command("configure",{room:String(own.dorm_id),notes:"Temporarily disabled"}))).status,"saved");
      assert.equal((await save(await command("place",{attendee:people[0],room:String(own.dorm_id)}))).status,"roomUnavailable");
      assert.equal((await save(await command("configure",{room:String(own.dorm_id),eligible:"on"}))).status,"saved");
    });
    await t.test("oversized groups remain unassigned and staff can explicitly review a split arrangement",async()=>{
      const plan=await snapshot();
      const suggested=suggestEventHousing({...plan,placements:[],rooms:plan.rooms.filter(r=>r.beds===2)});
      assert.equal(suggested.some(p=>people.slice(0,3).includes(p.attendee_id)),false);
      const split=plan.placements.map(p=>({...p,requests_reviewed:true}));
      const first=split.find(p=>p.attendee_id===people[0])!,other=split.find(p=>p.dorm_id!==first.dorm_id)!;
      const previous=first.dorm_id;first.dorm_id=other.dorm_id;other.dorm_id=previous;
      assert.equal(eventHousingIssues({...plan,placements:split}).some(i=>i.status==="splitGroup"),false);
      first.requests_reviewed=false;
      assert.ok(eventHousingIssues({...plan,placements:split}).some(i=>i.status==="splitGroup"));
    });
    await t.test("locks survive regeneration and stale concurrent changes cannot overwrite them",async()=>{
      const stale=await command("generate"),room=(await snapshot()).placements.find(p=>p.attendee_id===people[0])!.dorm_id;
      assert.equal((await save(await command("place",{attendee:people[0],room:String(room),locked:"on"}))).status,"saved");
      assert.equal((await save(stale)).status,"stale");
      assert.equal((await save(await command("generate"))).status,"saved");
      const placement=(await snapshot()).placements.find(p=>p.attendee_id===people[0])!;assert.equal(placement.dorm_id,room);assert.equal(placement.locked,true);
      assert.equal((await snapshot()).event.housing_published_at,null);
    });
    await t.test("accessibility requests and split groups require staff review before publication",async()=>{
      await db.query("UPDATE event_attendee SET accessibility='Fictional step-free access request' WHERE id=$1",[people[0]]);
      assert.ok(eventHousingIssues(await snapshot()).some(i=>i.status==="requests"));
      assert.equal((await save(await command("publish"))).status,"reviewNeeded");
      const plan=await snapshot(),room=plan.placements.find(p=>p.attendee_id===people[0])!.dorm_id;
      assert.equal((await save(await command("place",{attendee:people[0],room:String(room),locked:"on",requestsReviewed:"on"}))).status,"saved");
      assert.equal((await save(await command("publish"))).status,"saved");
      await db.query("UPDATE event_attendee SET accessibility='Changed fictional access request' WHERE id=$1",[people[0]]);
      assert.ok(eventHousingIssues(await snapshot()).some(i=>i.status==="requests"));
      assert.equal((await save(await command("place",{attendee:people[0],room:String(room),locked:"on",requestsReviewed:"on"}))).status,"saved");
      const old=await snapshot();
      await db.query("UPDATE event_attendee SET place_status='pending' WHERE id=$1",[people[0]]);
      assert.equal((await snapshot()).event.housing_published_at,null);assert.ok((await snapshot()).event.housing_revision>old.event.housing_revision);
      assert.equal((await save(await command("place",{attendee:people[1],room:""}))).status,"saved");
      assert.ok(eventHousingIssues(await snapshot()).some(i=>i.status==="splitGroup"));
      assert.equal((await save(await command("publish"))).status,"reviewNeeded");
      assert.equal((await save(await command("generate"))).status,"saved");
    });
    await t.test("room readiness, usable capacity and optional resident supervision are rechecked",async()=>{
      await db.exec("UPDATE dorm SET needs_cleaning=true WHERE id=1");
      assert.ok(eventHousingIssues(await snapshot()).some(i=>i.status==="cleaning"));assert.equal((await save(await command("publish"))).status,"reviewNeeded");
      await db.exec("UPDATE dorm SET needs_cleaning=false,default_usable_beds=1 WHERE id=1");
      assert.ok(eventHousingIssues(await snapshot()).some(i=>i.status==="capacity"));
      await db.exec("UPDATE dorm SET default_usable_beds=2 WHERE id=1");
      await db.query("UPDATE special_event SET supervisor_required=true WHERE id=$1",[event]);
      assert.ok(eventHousingIssues(await snapshot()).some(i=>i.status==="supervision"));
      for(const room of (await snapshot()).rooms){
        const person=(await snapshot()).placements.find(p=>p.dorm_id===room.id)!;
        assert.equal((await save(await command("place",{attendee:person.attendee_id,room:String(room.id),supervisor:"on",locked:"on",requestsReviewed:"on"}))).status,"saved");
      }
      assert.equal((await save(await command("publish"))).status,"saved");
      assert.equal((await snapshot()).placements.length,8);
    });
    await t.test("registration release frees the bed with history, reconfirmation stays unassigned, and occupied reservations cannot be removed",async()=>{
      await assert.rejects(db.transaction(tx=>tx.query("DELETE FROM event_room_reservation WHERE event_id=$1 AND dorm_id=1",[event])));
      await db.transaction(async tx=>{await releaseEventHousing(tx,event,people[0],"Sample staff","Fictional cancellation");await tx.query("UPDATE event_attendee SET place_status='released' WHERE id=$1",[people[0]]);});
      assert.equal((await snapshot()).placements.some(p=>p.attendee_id===people[0]),false);assert.equal((await snapshot()).people.length,7);
      await db.query("UPDATE event_attendee SET place_status='confirmed' WHERE id=$1",[people[0]]);
      assert.ok(eventHousingIssues(await snapshot()).some(i=>i.status==="unassigned"&&i.person===people[0]));
      assert.ok((await db.query("SELECT id FROM event_housing_history WHERE event_id=$1 AND operation='release'",[event])).rows.length);
    });
    await t.test("reservation conflicts and cancelled events reject housing changes",async()=>{
      await db.query("INSERT INTO event_room_reservation(event_id,dorm_id) VALUES($1,1)",[other]);
      assert.equal((await save(await command("generate"))).status,"conflict");
      await db.query("DELETE FROM event_room_reservation WHERE event_id=$1",[other]);
      await db.query("UPDATE special_event SET cancelled_at=CURRENT_TIMESTAMP WHERE id=$1",[event]);
      assert.equal((await save(await command("generate"))).status,"closed");
      assert.equal((await save(await command("publish"))).status,"closed");
    });
  }finally{await db.close();}
});
