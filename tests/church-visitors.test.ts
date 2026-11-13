import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { changeVisitorStatus, writeVisitor } from "../lib/church-visitors.ts";

test("visitor intake, acknowledgments and corrections preserve authority and history", async t => {
  const db = new PGlite();
  const visit = randomUUID(), otherVisit = randomUUID();
  const today = "2026-11-12";
  try {
    for (const file of ["001-foundation.sql","018-church-visits.sql","019-church-visitor-registration.sql","020-church-visit-housing.sql","021-church-visit-attendance.sql","022-church-visit-itinerary.sql","019-church-visitor-registration.sql"]) {
      await db.exec(await readFile(new URL("../db/"+file,import.meta.url),"utf8"));
    }
    for (const id of [visit,otherVisit]) await db.query(`INSERT INTO church_visit(id,name,church_name,purpose,leader_name,leader_email,leader_phone,
      starts_at,ends_at,expected_students,expected_adults,expected_leaders)
      VALUES($1,'Fictional visit','Fictional church','Ministry','Sample leader','leader@example.test','555-0100',
        '2027-03-01T12:00','2027-03-08T12:00',12,6,2)`,[id]);
    function registration(id = randomUUID()) {
      const form = new FormData();
      for (const [key,value] of Object.entries({id,visit,locale:"en",first:"Sample",last:"Visitor",birth:"2011-03-01",gender:"female",
        role:"student",contact:"Group leader, 555-0100",emergencyName:"Sample parent",emergencyPhone:"555-0101",
        signer:"Sample parent",relationship:"guardian",consent:"yes",food:"",diet:"",access:"",rooming:"",foodAnswer:"none",dietAnswer:"none",accessAnswer:"none"})) form.set(key,value);
      return form;
    }
    const save = (form:FormData,mode:"online"|"desk"|"edit" = "online") => db.transaction(tx => writeVisitor(tx,form,mode,today));
    const status = (form:FormData) => db.transaction(tx => changeVisitorStatus(tx,form));
    const minor = registration();
    await t.test("food and accommodation answers distinguish none, unknown and reported needs", async () => {
      const form = registration();
      form.delete("foodAnswer");
      assert.equal(await save(form),"invalid");
      form.set("foodAnswer","yes");
      assert.equal(await save(form),"invalid");
      form.set("food","Fictional peanut allergy");
      form.set("dietAnswer","unknown");
      form.set("accessAnswer","none");
      form.set("access","Discarded stale details");
      form.set("rooming","Fictional friend");
      assert.equal(await save(form),"received");
      const record = (await db.query<{details:Record<string,string>}>("SELECT details FROM church_visitor WHERE id=$1",[form.get("id")])).rows[0];
      assert.equal(record.details.foodAnswer,"yes");
      assert.equal(record.details.food,"Fictional peanut allergy");
      assert.equal(record.details.dietAnswer,"unknown");
      assert.equal(record.details.access,"");
      assert.equal(record.details.rooming,"Fictional friend");
    });
    await t.test("minor information requires explicit permission and an authorized representative declaration", async () => {
      minor.delete("consent");
      assert.equal(await save(minor),"invalid");
      minor.set("consent","yes");
      minor.set("relationship","self");
      assert.equal(await save(minor),"invalid");
      minor.set("relationship","representative");
      assert.equal(await save(minor),"invalid");
      minor.set("sharingAuthority","yes");
      assert.equal(await save(minor),"received");
      minor.set("first","Tampered retry");
      assert.equal(await save(minor),"received");
      const record = (await db.query<{first_name:string}>("SELECT first_name FROM church_visitor WHERE id=$1",[minor.get("id")])).rows[0];
      assert.equal(record.first_name,"Sample");
      minor.set("visit",otherVisit);
      assert.equal(await save(minor),"invalid");
      minor.set("visit",visit);
    });
    await t.test("visitor role and age are independent, while adult and leader roles require adult arrival age", async () => {
      const adultStudent = registration();
      adultStudent.set("birth","2008-01-01");
      adultStudent.set("relationship","self");
      assert.equal(await save(adultStudent),"received");
      const invalidRole = registration();
      invalidRole.set("role","adult");
      assert.equal(await save(invalidRole),"invalid");
      invalidRole.set("role","leader");
      invalidRole.set("acknowledge","yes");
      assert.equal(await save(invalidRole),"invalid");
    });
    const leader = registration();
    leader.set("birth","1990-04-10");
    leader.set("role","leader");
    leader.set("relationship","self");
    leader.set("signer","Sample Visitor");
    await t.test("acknowledgment stays pending until explicitly given, and a retry cannot add one", async () => {
      assert.equal(await save(leader),"received");
      leader.set("acknowledge","yes");
      assert.equal(await save(leader),"received");
      assert.equal((await db.query("SELECT id FROM church_visit_acknowledgment WHERE visit_id=$1",[visit])).rows.length,0);
    });
    await t.test("staff can record an acknowledgment with its source and version without rewriting original data permission", async () => {
      leader.set("recorder","Fictional staff");
      leader.set("reason","Leader supplied acknowledgment");
      leader.set("revision","1");
      assert.equal(await save(leader,"edit"),"invalid");
      leader.set("ackSource","Leader read and acknowledged on this device");
      assert.equal(await save(leader,"edit"),"saved");
      assert.equal(await save(leader,"edit"),"stale");
      const acknowledgment = (await db.query<{leader_name:string;version:string;wording:string;source:string}>(
        "SELECT leader_name,version,wording,source FROM church_visit_acknowledgment WHERE visit_id=$1",[visit],
      )).rows[0];
      assert.equal(acknowledgment.leader_name,"Sample Visitor");
      assert.equal(acknowledgment.version,"church-responsibility-1");
      assert.equal(acknowledgment.source,"desk");
      assert.match(acknowledgment.wording,/participation permissions and supervision/);
      const record = (await db.query<{details:{recorder:string}}>("SELECT details FROM church_visitor WHERE id=$1",[leader.get("id")])).rows[0];
      assert.equal(record.details.recorder,"");
    });
    await t.test("staff intake needs a recorder and source, and updates cannot move a visitor between visits", async () => {
      const desk = registration();
      assert.equal(await save(desk,"desk"),"invalid");
      desk.set("recorder","Fictional staff");
      desk.set("intakeSource","Parent supplied details at the desk");
      assert.equal(await save(desk,"desk"),"received");
      leader.set("visit",otherVisit);
      leader.set("revision","2");
      assert.equal(await save(leader,"edit"),"stale");
      leader.set("visit",visit);
    });
    await t.test("withdraw and restore are reversible, audited, and revision checked", async () => {
      leader.set("operation","withdraw");
      leader.set("revision","2");
      assert.equal(await status(leader),"saved");
      assert.equal(await status(leader),"saved");
      const activeLeaders = (await db.query("SELECT id FROM church_visitor WHERE visit_id=$1 AND visitor_role='leader' AND withdrawn_at IS NULL",[visit])).rows;
      assert.equal(activeLeaders.length,0);
      leader.set("operation","restore");
      assert.equal(await status(leader),"stale");
      leader.set("revision","3");
      assert.equal(await status(leader),"saved");
      const changes = (await db.query<{operation:string}>("SELECT operation FROM church_visitor_history WHERE visitor_id=$1 ORDER BY id",[leader.get("id")])).rows;
      assert.deepEqual(changes.map(change => change.operation),["edit","withdraw","restore"]);
    });
    await t.test("canceled visits reject public submissions, staff edits, and restoration", async () => {
      await db.query("UPDATE church_visit SET cancelled_at=CURRENT_TIMESTAMP WHERE id=$1",[visit]);
      assert.equal(await save(registration()),"closed");
      assert.equal(await save(leader,"edit"),"closed");
      assert.equal(await status(leader),"closed");
    });
  } finally {
    await db.close();
  }
});
