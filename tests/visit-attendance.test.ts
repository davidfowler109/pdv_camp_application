import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { test } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { saveVisitAttendance } from "../lib/visit-attendance.ts";
import { changeVisitorStatus } from "../lib/church-visitors.ts";
import { writeChurchVisit } from "../lib/church-visits.ts";
import { getVisitHousing, saveVisitHousing, visitHousingIssues } from "../lib/visit-housing.ts";

test("group attendance is atomic, retryable, reversible, and linked to room turnover", async t => {
  const db = new PGlite();
  const visit = randomUUID(), otherVisit = randomUUID();
  const ids = Array.from({length:7},() => randomUUID());
  try {
    const folder = new URL("../db/",import.meta.url);
    for (const file of (await readdir(folder)).filter(file => /^\d{3}-.+\.sql$/.test(file)).sort()) await db.exec(await readFile(new URL(file,folder),"utf8"));
    await db.exec(await readFile(new URL("021-church-visit-attendance.sql",folder),"utf8"));
    await db.exec(`INSERT INTO building(id,name) VALUES(1,'Fictional building');
      INSERT INTO dorm(id,building_id,name,physical_beds) VALUES(1,1,'Cabin 1',4),(2,1,'Cabin 2',4),(3,1,'Cabin 3',4);`);
    for (const id of [visit,otherVisit]) await db.query(`INSERT INTO church_visit(id,name,church_name,purpose,leader_name,leader_email,leader_phone,
      starts_at,ends_at,expected_students,expected_adults,expected_leaders) VALUES($1,'Fictional visit','Fictional church','Ministry',
      'Sample leader','leader@example.test','555-0100','2027-06-01T12:00','2027-06-08T12:00',1,4,1)`,[id]);
    await db.query("INSERT INTO visit_room_reservation(visit_id,dorm_id) VALUES($1,1),($1,2),($1,3)",[visit]);
    await db.query(`INSERT INTO visit_room_plan(visit_id,dorm_id,gender_group,minimum_adults,allow_minors,supervision_notes)
      VALUES($1,1,'mixed',1,true,'Church leader resides with the student.'),($1,2,'mixed',0,false,'Adult guests.'),($1,3,'mixed',0,false,'Adult guests.')`,[visit]);
    for (let index=0;index<ids.length;index++) await db.query(`INSERT INTO church_visitor(id,visit_id,first_name,last_name,date_of_birth,gender_group,visitor_role,
      contact,emergency_name,emergency_phone,details,source) VALUES($1,$2,$3,'Visitor',$4,'female',$5,'Sample contact','Sample emergency','555-0100','{}','desk')`,
      [ids[index],index === 6 ? otherVisit : visit,"Sample "+index,index === 0 ? "2010-01-01" : "1990-01-01",index === 0 ? "student" : index === 1 ? "leader" : "adult"]);
    for (let index=0;index<5;index++) await db.query("INSERT INTO visit_placement(visitor_id,visit_id,dorm_id,supervisor) VALUES($1,$2,$3,$4)",
      [ids[index],visit,index<2 ? 1 : index<4 ? 2 : 3,index === 1]);
    async function command(operation:string,selected:string[],notes = "") {
      const form = new FormData();
      for (const [key,value] of Object.entries({visit,batch:randomUUID(),operation,actor:"Fictional staff",notes})) form.set(key,value);
      for (const id of selected) {
        const person = (await db.query<{presence_revision:number}>("SELECT presence_revision FROM church_visitor WHERE id=$1",[id])).rows[0];
        form.append("visitor",id+":"+(person?.presence_revision ?? 0));
      }
      return form;
    }
    const save = (form:FormData) => db.transaction(tx => saveVisitAttendance(tx,form));
    const person = async (id:string) => (await db.query<{arrived_at:string|null;departed_at:string|null;presence_revision:number}>(
      "SELECT arrived_at::text AS arrived_at,departed_at::text AS departed_at,presence_revision FROM church_visitor WHERE id=$1",[id],
    )).rows[0];
    const dirty = async (id:number) => (await db.query<{needs_cleaning:boolean}>("SELECT needs_cleaning FROM dorm WHERE id=$1",[id])).rows[0].needs_cleaning;

    await t.test("a selected group arrives once while unselected visitors remain expected", async () => {
      const arrival = await command("arrive",[ids[0],ids[1]]);
      assert.deepEqual(await save(arrival),{status:"saved",count:2});
      assert.deepEqual(await save(arrival),{status:"saved",count:2});
      assert.ok((await person(ids[0])).arrived_at);
      assert.equal((await person(ids[2])).arrived_at,null);
      assert.equal((await db.query("SELECT id FROM visit_attendance_batch")).rows.length,1);
      arrival.set("actor","Changed recorder");
      assert.equal((await save(arrival)).status,"invalid");
    });
    await t.test("a mixed invalid selection and cross-visit selections make no partial changes", async () => {
      assert.equal((await save(await command("depart",[ids[0],ids[2]]))).status,"wrongState");
      assert.equal((await person(ids[0])).departed_at,null);
      assert.equal((await save(await command("arrive",[ids[3],ids[6]]))).status,"invalid");
      assert.equal((await person(ids[3])).arrived_at,null);
      assert.equal((await save(await command("arrive",[]))).status,"invalid");
    });
    await t.test("a resident leader's departure flags supervision while a remaining student keeps the room occupied", async () => {
      assert.equal((await save(await command("depart",[ids[1]]))).status,"saved");
      assert.equal(await dirty(1),false);
      assert.ok(visitHousingIssues((await getVisitHousing(db,visit))!).some(issue => issue.status === "supervision"));
      assert.equal((await save(await command("depart",[ids[0]]))).status,"saved");
      assert.equal(await dirty(1),true);
    });
    await t.test("undo records history, requires a reason, and leaves room readiness for staff review", async () => {
      assert.equal((await save(await command("undoDeparture",[ids[0]]))).status,"invalid");
      assert.equal((await save(await command("undoDeparture",[ids[0]],"Visitor was still at camp"))).status,"saved");
      assert.equal((await person(ids[0])).departed_at,null);
      assert.equal(await dirty(1),true);
      assert.equal((await save(await command("undoArrival",[ids[0]],"Arrival was recorded for the wrong person"))).status,"saved");
      assert.equal((await person(ids[0])).arrived_at,null);
      assert.equal((await db.query("SELECT batch_id FROM visit_attendance_event WHERE visitor_id=$1",[ids[0]])).rows.length,4);
    });
    await t.test("stale lists and competing saves cannot record an arrival twice", async () => {
      const first = await command("arrive",[ids[2]]), second = await command("arrive",[ids[2],ids[3]]);
      assert.equal((await save(first)).status,"saved");
      assert.equal((await save(second)).status,"stale");
      assert.equal((await person(ids[3])).arrived_at,null);
      const competing = [await command("arrive",[ids[5]]),await command("arrive",[ids[5]])];
      const results = await Promise.all(competing.map(save));
      assert.deepEqual(results.map(result => result.status).sort(),["saved","stale"]);
    });
    await t.test("present visitors cannot be withdrawn or their visit cancelled", async () => {
      const withdraw = new FormData();
      for (const [key,value] of Object.entries({id:ids[2],visit,operation:"withdraw",recorder:"Fictional staff",reason:"Test",revision:"1"})) withdraw.set(key,value);
      assert.equal(await db.transaction(tx => changeVisitorStatus(tx,withdraw)),"stillPresent");
      const cancel = new FormData(); cancel.set("id",visit); cancel.set("operation","cancel");
      assert.equal((await db.transaction(tx => writeChurchVisit(tx,cancel))).status,"visitorsPresent");
    });
    await t.test("housing regeneration preserves arrivals and a manual room move refreshes the vacated room", async () => {
      const current = (await getVisitHousing(db,visit))!;
      const move = new FormData();
      for (const [key,value] of Object.entries({visit,operation:"place",revision:String(current.visit.housing_revision),actor:"Fictional staff",reason:"Church moved the guest",visitor:ids[2],room:"3"})) move.set(key,value);
      assert.equal((await db.transaction(tx => saveVisitHousing(tx,move))).status,"saved");
      assert.equal(await dirty(2),true);
      const moved = (await getVisitHousing(db,visit))!;
      move.set("operation","generate"); move.set("revision",String(moved.visit.housing_revision));
      assert.equal((await db.transaction(tx => saveVisitHousing(tx,move))).status,"saved");
      assert.equal((await getVisitHousing(db,visit))!.placements.find(item => item.visitor_id === ids[2])?.dorm_id,3);
      assert.equal((await save(await command("depart",[ids[2]]))).status,"saved");
      move.set("operation","place"); move.set("revision",String((await getVisitHousing(db,visit))!.visit.housing_revision)); move.set("room","2");
      assert.equal((await db.transaction(tx => saveVisitHousing(tx,move))).status,"reviewNeeded");
    });
    await t.test("a ready room is not marked dirty again by departures from a previously used room", async () => {
      await db.exec("UPDATE dorm SET needs_cleaning=false WHERE id=2");
      assert.equal((await save(await command("undoDeparture",[ids[2]],"Corrected departure"))).status,"saved");
      assert.equal((await save(await command("depart",[ids[2]]))).status,"saved");
      assert.equal(await dirty(2),false);
    });
    await t.test("a later arrival can still be recorded without a housing assignment", async () => {
      const current = (await getVisitHousing(db,visit))!;
      const clear = new FormData();
      for (const [key,value] of Object.entries({visit,operation:"place",revision:String(current.visit.housing_revision),actor:"Fictional staff",reason:"Room plan pending",visitor:ids[3],room:""})) clear.set(key,value);
      assert.equal((await db.transaction(tx => saveVisitHousing(tx,clear))).status,"saved");
      assert.equal((await save(await command("arrive",[ids[3]]))).status,"saved");
      assert.ok((await person(ids[3])).arrived_at);
      assert.equal((await db.query("SELECT visitor_id FROM visit_placement WHERE visitor_id=$1",[ids[3]])).rows.length,0);
    });
  } finally {
    await db.close();
  }
});
