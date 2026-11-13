import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { getVisitHousing, saveVisitHousing, visitHousingIssues } from "../lib/visit-housing.ts";
import { changeVisitorStatus, writeVisitor } from "../lib/church-visitors.ts";
import { writeChurchVisit } from "../lib/church-visits.ts";

test("church housing drafts respect capacity, church supervision, and changes to the roster", async t => {
  const db = new PGlite();
  const visit = randomUUID();
  const ids = Array.from({length:5},() => randomUUID());
  try {
    for (const file of ["001-foundation.sql","005-housing-inventory.sql","012-special-events.sql","018-church-visits.sql","019-church-visitor-registration.sql","020-church-visit-housing.sql","021-church-visit-attendance.sql","022-church-visit-itinerary.sql","020-church-visit-housing.sql"]) {
      await db.exec(await readFile(new URL("../db/"+file,import.meta.url),"utf8"));
    }
    await db.exec(`INSERT INTO building(id,name) VALUES(1,'Fictional building');
      INSERT INTO dorm(id,building_id,name,physical_beds,room_kind) VALUES(1,1,'Cabin',3,'camper'),(2,1,'Hotel room',2,'hotel'),(3,1,'Unreserved room',5,'camper');`);
    await db.query(`INSERT INTO church_visit(id,name,church_name,purpose,leader_name,leader_email,leader_phone,starts_at,ends_at,
      expected_students,expected_adults,expected_leaders) VALUES($1,'Fictional visit','Fictional church','Ministry',
      'Sample leader','leader@example.test','555-0100','2027-06-01T12:00','2027-06-08T12:00',2,2,1)`,[visit]);
    await db.query("INSERT INTO visit_room_reservation(visit_id,dorm_id) VALUES($1,1),($1,2)",[visit]);
    for (let index=0; index<ids.length; index++) await db.query(`INSERT INTO church_visitor(id,visit_id,first_name,last_name,date_of_birth,
      gender_group,visitor_role,contact,emergency_name,emergency_phone,details,source)
      VALUES($1,$2,$3,'Visitor',$4,'female',$5,'Sample contact','Sample emergency','555-0100','{}','desk')`,
      [ids[index],visit,"Sample "+index,index < 2 ? "2012-01-01" : "1990-01-01",index < 2 ? "student" : index === 2 ? "leader" : "adult"]);
    const snapshot = async () => (await getVisitHousing(db,visit))!;
    async function command(operation:string,extra:Record<string,string> = {}) {
      const data = new FormData();
      const current = await snapshot();
      for (const [key,value] of Object.entries({visit,operation,revision:String(current.visit.housing_revision),actor:"Fictional staff",reason:"Pilot housing review",...extra})) data.set(key,value);
      return data;
    }
    const save = (form:FormData) => db.transaction(tx => saveVisitHousing(tx,form));

    await t.test("unconfigured rooms require church arrangements, with no fixed camp adult minimum", async () => {
      assert.equal((await save(await command("generate"))).status,"unconfigured");
      assert.equal((await snapshot()).placements.length,0);
      assert.equal((await save(await command("configure",{room:"1",gender:"female",minimumAdults:"1",allowMinors:"on",notes:"One named church adult resides with the students."}))).status,"saved");
      assert.equal((await save(await command("configure",{room:"2",gender:"mixed",minimumAdults:"0",notes:"Adult guests."}))).status,"saved");
    });
    await t.test("suggestions place a resident leader with minors and count every person against beds", async () => {
      assert.equal((await save(await command("generate"))).status,"saved");
      const plan = await snapshot();
      assert.equal(plan.placements.length,5);
      assert.equal(plan.placements.filter(item => item.dorm_id === 1).length,3);
      assert.equal(plan.placements.find(item => item.visitor_id === ids[2])?.supervisor,true);
      assert.equal(plan.placements.find(item => item.visitor_id === ids[0])?.dorm_id,1);
      assert.deepEqual(visitHousingIssues(plan),[]);
    });
    await t.test("manual moves enforce room eligibility and capacity without changing failed attempts", async () => {
      const before = (await snapshot()).placements;
      assert.equal((await save(await command("place",{visitor:ids[3],room:"1"}))).status,"capacity");
      assert.equal((await save(await command("place",{visitor:ids[0],room:"2"}))).status,"minorRoom");
      assert.equal((await save(await command("place",{visitor:ids[0],room:"3"}))).status,"roomUnavailable");
      assert.equal((await save(await command("place",{visitor:ids[0],room:"1",supervisor:"on"}))).status,"supervision");
      await db.query("UPDATE church_visitor SET gender_group='male' WHERE id=$1",[ids[3]]);
      assert.equal((await save(await command("place",{visitor:ids[3],room:"1"}))).status,"groupMismatch");
      await db.query("UPDATE church_visitor SET gender_group='female' WHERE id=$1",[ids[3]]);
      await db.exec("UPDATE dorm SET active=false WHERE id=2");
      assert.equal((await save(await command("place",{visitor:ids[3],room:"2"}))).status,"roomUnavailable");
      await db.exec("UPDATE dorm SET active=true WHERE id=2");
      assert.deepEqual((await snapshot()).placements,before);
    });
    await t.test("locked assignments survive regeneration and history records the override", async () => {
      assert.equal((await save(await command("place",{visitor:ids[0],room:"1",locked:"on"}))).status,"saved");
      assert.equal((await save(await command("generate"))).status,"saved");
      assert.equal((await snapshot()).placements.find(item => item.visitor_id === ids[0])?.locked,true);
      assert.equal((await db.query("SELECT id FROM church_housing_history WHERE visit_id=$1 AND operation='place'",[visit])).rows.length,1);
    });
    await t.test("publication checks room readiness, church adult coverage, and inventory changes", async () => {
      await db.exec("UPDATE dorm SET needs_cleaning=true WHERE id=1");
      assert.equal((await save(await command("publish"))).status,"reviewNeeded");
      await db.exec("UPDATE dorm SET needs_cleaning=false WHERE id=1");
      assert.equal((await save(await command("publish"))).status,"saved");
      assert.ok((await snapshot()).visit.housing_published_at);
      await db.exec("UPDATE dorm SET physical_beds=2 WHERE id=1");
      assert.ok(visitHousingIssues(await snapshot()).some(item => item.status === "capacity"));
      assert.equal((await save(await command("publish"))).status,"reviewNeeded");
      await db.exec("UPDATE dorm SET physical_beds=3 WHERE id=1");
      assert.equal((await save(await command("place",{visitor:ids[2],room:"1"}))).status,"saved");
      assert.equal((await snapshot()).visit.housing_published_at,null);
      assert.equal((await save(await command("publish"))).status,"reviewNeeded");
      assert.equal((await save(await command("place",{visitor:ids[2],room:"1",supervisor:"on"}))).status,"saved");
      assert.equal((await save(await command("publish"))).status,"saved");
    });
    await t.test("visit edits preserve room plans and cannot drop a room with assigned visitors", async () => {
      const edit = new FormData();
      for (const [key,value] of Object.entries({id:visit,operation:"edit",name:"Fictional visit",church:"Fictional church",purpose:"Ministry",leader:"Sample leader",
        email:"leader@example.test",phone:"555-0100",start:"2027-06-01T12:00",end:"2027-06-08T12:00",students:"2",adults:"2",leaders:"1",turnover:"0"})) edit.set(key,value);
      edit.append("room","1");
      assert.equal((await db.transaction(tx => writeChurchVisit(tx,edit))).status,"housingInUse");
      edit.append("room","2");
      assert.equal((await db.transaction(tx => writeChurchVisit(tx,edit))).status,"saved");
      assert.equal((await snapshot()).rooms.find(room => room.id === 1)?.minimum_adults,1);
      assert.equal((await snapshot()).placements.length,5);
      assert.equal((await snapshot()).visit.housing_published_at,null);
    });
    await t.test("withdrawing a resident adult releases their bed and flags coverage, and restoration leaves them unassigned", async () => {
      const status = new FormData();
      for (const [key,value] of Object.entries({id:ids[2],visit,operation:"withdraw",recorder:"Fictional staff",reason:"Traveler changed plans",revision:"1"})) status.set(key,value);
      assert.equal(await db.transaction(tx => changeVisitorStatus(tx,status)),"saved");
      let plan = await snapshot();
      assert.equal(plan.placements.some(item => item.visitor_id === ids[2]),false);
      assert.ok(visitHousingIssues(plan).some(item => item.status === "supervision"));
      status.set("operation","restore"); status.set("revision","2");
      assert.equal(await db.transaction(tx => changeVisitorStatus(tx,status)),"saved");
      plan = await snapshot();
      assert.equal(plan.placements.some(item => item.visitor_id === ids[2]),false);
      assert.equal((await save(await command("generate"))).status,"saved");
    });
    await t.test("competing changes cannot consume the same last bed", async () => {
      assert.equal((await save(await command("place",{visitor:ids[1],room:""}))).status,"saved");
      const first = await command("place",{visitor:ids[3],room:"1"});
      const second = await command("place",{visitor:ids[4],room:"1"});
      const results = await Promise.all([save(first),save(second)]);
      assert.deepEqual(results.map(result => result.status).sort(),["saved","stale"]);
      assert.equal((await snapshot()).placements.filter(item => item.dorm_id === 1).length,3);
    });
    await t.test("new registration returns a published plan to draft and canceled visits reject housing changes", async () => {
      assert.equal((await save(await command("generate"))).status,"saved");
      assert.equal((await save(await command("publish"))).status,"saved");
      const form = new FormData();
      for (const [key,value] of Object.entries({id:randomUUID(),visit,first:"New",last:"Visitor",birth:"1995-01-01",gender:"female",role:"adult",contact:"Sample contact",
        emergencyName:"Sample emergency",emergencyPhone:"555-0100",signer:"New Visitor",relationship:"self",consent:"yes",foodAnswer:"none",dietAnswer:"none",accessAnswer:"none"})) form.set(key,value);
      assert.equal(await db.transaction(tx => writeVisitor(tx,form,"online","2026-11-12")),"received");
      assert.equal((await snapshot()).visit.housing_published_at,null);
      assert.ok(visitHousingIssues(await snapshot()).some(item => item.status === "unassigned"));
      await db.query("UPDATE church_visit SET cancelled_at=CURRENT_TIMESTAMP WHERE id=$1",[visit]);
      assert.equal((await save(await command("generate"))).status,"closed");
    });
  } finally {
    await db.close();
  }
});
