import assert from "node:assert/strict";
import { test } from "node:test";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import { writeChurchVisit } from "../lib/church-visits.ts";
import { roomConflict } from "../lib/facilities.ts";

test("church visits share room reservations with camp and events", async t => {
  const db = new PGlite();
  try {
    for (const file of ["001-foundation.sql","005-housing-inventory.sql","012-special-events.sql","018-church-visits.sql","019-church-visitor-registration.sql","020-church-visit-housing.sql","021-church-visit-attendance.sql","022-church-visit-itinerary.sql","018-church-visits.sql"]) {
      await db.exec(await readFile(new URL("../db/"+file,import.meta.url),"utf8"));
    }
    await db.exec(`INSERT INTO building(id,name) VALUES(1,'Fictional building');
      INSERT INTO dorm(id,building_id,name,physical_beds) VALUES(1,1,'Cabin 1',16),(2,1,'Cabin 2',16);
      INSERT INTO camp_week(id,name,minimum_age,maximum_age,capacity,starts_on,ends_on)
        VALUES(1,'Fictional camp',7,11,100,'2027-01-12','2027-01-16');
      INSERT INTO weekly_dorm(week_id,dorm_id,minimum_age,maximum_age,usable_beds,guest_beds,gender_group,in_service)
        VALUES(1,1,7,11,16,0,'female',true);`);
    function form(id:string, start = "2027-03-01T12:00", end = "2027-03-08T12:00", operation = "create") {
      const data = new FormData();
      for (const [key,value] of Object.entries({id,operation,name:"Fictional ministry team",church:"Fictional church",
        purpose:"Ministry visit",leader:"Sample leader",email:"leader@example.test",phone:"555-0100",start,end,
        students:"12",adults:"6",leaders:"2",turnover:"60",room:"1"})) data.set(key,value);
      return data;
    }
    const save = (data:FormData) => db.transaction(tx => writeChurchVisit(tx,data));
    const id = randomUUID();
    await t.test("create and retry preserve one visit and one reservation", async () => {
      assert.deepEqual(await save(form(id)),{status:"saved"});
      assert.deepEqual(await save(form(id)),{status:"saved"});
      const result = await db.query<{count:number}>("SELECT count(*)::integer AS count FROM visit_room_reservation WHERE visit_id=$1",[id]);
      assert.equal(result.rows[0].count,1);
    });
    await t.test("visits block event and camp reservation checks, including cleaning time", async () => {
      assert.equal((await roomConflict(db,[1],"2027-03-08T12:30","2027-03-09T12:00",0,null,false))?.booking,"Fictional ministry team");
      assert.equal(await roomConflict(db,[1],"2027-03-08T13:00","2027-03-09T12:00",0,null,false),undefined);
      assert.equal((await save(form(randomUUID(),"2027-03-08T12:30","2027-03-09T12:00"))).status,"conflict");
      assert.equal((await roomConflict(db,[1],"2027-03-02","2027-03-04",0,null,false))?.booking,"Fictional ministry team");
    });
    await t.test("camp and events block visits and failed edits retain previous dates and rooms", async () => {
      assert.equal((await save(form(randomUUID(),"2027-01-16T12:00","2027-01-17T12:00"))).status,"conflict");
      const eventId = randomUUID();
      await db.query(`INSERT INTO special_event(id,name,starts_at,ends_at,capacity,day_attendance,overnight_attendance)
        VALUES($1,'Fictional event','2027-04-01T12:00','2027-04-03T12:00',20,false,true)`,[eventId]);
      await db.query("INSERT INTO event_room_reservation(event_id,dorm_id) VALUES($1,1)",[eventId]);
      assert.equal((await save(form(id,"2027-04-01T12:00","2027-04-02T12:00","edit"))).status,"conflict");
      const previous = (await db.query<{start:string;rooms:number}>(`SELECT starts_at::date::text AS start,
        (SELECT count(*)::integer FROM visit_room_reservation WHERE visit_id=$1) AS rooms FROM church_visit WHERE id=$1`,[id])).rows[0];
      assert.deepEqual(previous,{start:"2027-03-01",rooms:1});
    });
    await t.test("validation rejects invalid counts, dates and inactive rooms without creating a visit", async () => {
      const draft = form(randomUUID());
      draft.set("students","1.5");
      assert.equal((await save(draft)).status,"countError");
      draft.set("students","12");
      draft.set("end","2027-02-28T12:00");
      assert.equal((await save(draft)).status,"dateError");
      draft.set("end","2027-05-01T12:00");
      draft.set("room","2");
      await db.exec("UPDATE dorm SET active=false WHERE id=2");
      assert.equal((await save(draft)).status,"roomUnavailable");
      assert.equal((await db.query("SELECT id FROM church_visit WHERE id=$1",[draft.get("id")])).rows.length,0);
    });
    await t.test("cancel releases reservations, retains history, and prevents stale edits", async () => {
      assert.equal((await save(form(id,undefined,undefined,"cancel"))).status,"saved");
      assert.equal((await save(form(id,undefined,undefined,"cancel"))).status,"saved");
      assert.equal(await roomConflict(db,[1],"2027-03-02","2027-03-04",0,null,false),undefined);
      assert.equal((await db.query("SELECT id FROM church_visit WHERE id=$1 AND cancelled_at IS NOT NULL",[id])).rows.length,1);
      assert.equal((await save(form(id,undefined,undefined,"edit"))).status,"stale");
      assert.equal((await save(form(randomUUID()))).status,"saved");
    });
  } finally {
    await db.close();
  }
});
