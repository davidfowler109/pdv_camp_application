import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile,readdir } from "node:fs/promises";
import { test } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { parseEventAttendee,type EventSource } from "../lib/event-registration.ts";

function registration() {
  const form=new FormData();
  for (const [key,value] of Object.entries({id:randomUUID(),event:randomUUID(),first:"Sample",last:"Attendee",contact:"Fictional group contact",
    attendance:"day",authorization:"yes",foodAnswer:"none",dietAnswer:"none",recorder:"Sample staff",signed:"2026-11-12",authorizationSource:"Signed form supplied by attendee"})) form.set(key,value);
  return form;
}

test("event intake requires explicit food answers and details for reported needs in every entry route", () => {
  for (const source of ["online","desk","paper"] as EventSource[]) {
    const form=registration();
    assert.ok(parseEventAttendee(form,source,"2026-11-13"));
    for (const name of ["food","diet"]) {
      form.delete(name+"Answer");
      assert.equal(parseEventAttendee(form,source,"2026-11-13"),null);
      form.set(name+"Answer","yes");
      assert.equal(parseEventAttendee(form,source,"2026-11-13"),null);
      form.set(name,"   ");
      assert.equal(parseEventAttendee(form,source,"2026-11-13"),null);
      form.set(name,"Sample requirement");
      assert.equal(parseEventAttendee(form,source,"2026-11-13")?.[name as "food"|"diet"],"Sample requirement");
      form.set(name+"Answer","unknown");
      assert.equal(parseEventAttendee(form,source,"2026-11-13")?.[name as "food"|"diet"],null);
    }
  }
});

test("event food migration preserves legacy notes and independently stores new answers", async () => {
  const db=new PGlite();
  try {
    const folder=new URL("../db/",import.meta.url);
    const files=(await readdir(folder)).filter(file => /^\d{3}-.+\.sql$/.test(file)).sort();
    for (const file of files.filter(file=>!file.startsWith("024-"))) await db.exec(await readFile(new URL(file,folder),"utf8"));
    await db.exec("INSERT INTO special_event(id,name,starts_at,ends_at,capacity,day_attendance,overnight_attendance) VALUES('11111111-1111-4111-8111-111111111111','Fictional conference','2027-03-01','2027-03-02',20,true,false)");
    await db.exec(`INSERT INTO event_attendee(id,event_id,first_name,last_name,contact,attendance,food,source,authorization_date,notice_version)
      VALUES('22222222-2222-4222-8222-222222222222','11111111-1111-4111-8111-111111111111','Sample','Attendee','Sample contact','day','Original combined note','online','2026-11-13','event-pilot-1')`);
    const migration=await readFile(new URL("024-event-food-needs.sql",folder),"utf8");
    await db.exec(migration); await db.exec(migration);
    const old=(await db.query<{food:string;food_answer:string|null;diet_answer:string|null}>("SELECT food,food_answer,diet_answer FROM event_attendee")).rows[0];
    assert.deepEqual(old,{food:"Original combined note",food_answer:null,diet_answer:null});
    await db.exec("UPDATE event_attendee SET food_answer='none',food=NULL,diet_answer='yes',diet='Fictional vegetarian meals'");
    const current=(await db.query<{diet:string;food_answer:string;diet_answer:string}>("SELECT diet,food_answer,diet_answer FROM event_attendee")).rows[0];
    assert.equal(current.food_answer,"none"); assert.equal(current.diet_answer,"yes"); assert.equal(current.diet,"Fictional vegetarian meals");
  } finally { await db.close(); }
});
