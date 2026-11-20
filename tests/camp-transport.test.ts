import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile,readdir } from "node:fs/promises";
import { test } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { getCampTransport,saveCampTransport,transportSnapshot,transportNeedsReview,activeTransport,clockLabel,transportStopLabel } from "../lib/camp-transport.ts";

test("weekly transport keeps independent plans, snapshots, and audited changes",async t=>{
  const db=new PGlite();
  try{
    const folder=new URL("../db/",import.meta.url);
    for(const file of (await readdir(folder)).filter(f=>/^\d{3}-.+\.sql$/.test(f)&&!f.startsWith("026-")&&!f.startsWith("027-")).sort())await db.exec(await readFile(new URL(file,folder),"utf8"));
    await db.exec("INSERT INTO camp_week(id,name,minimum_age,maximum_age,capacity) VALUES(1,'Fictional source',7,11,250),(2,'Fictional second',12,17,250)");
    const migration=await readFile(new URL("026-camp-transport.sql",folder),"utf8");await db.exec(migration);
    await db.exec(await readFile(new URL("027-transport-review-audit.sql",folder),"utf8"));
    const plan=(week=1)=>getCampTransport(db,week);
    async function command(operation:string,values:Record<string,string>={},week=1){
      const revision=(await db.query<{transport_revision:number}>("SELECT transport_revision FROM camp_week WHERE id=$1",[week])).rows[0].transport_revision;
      const form=new FormData();for(const[k,v]of Object.entries({week:String(week),operation,request:randomUUID(),revision:String(revision),actor:"Fictional staff",reason:"Reviewed sample plan",...values}))form.set(k,v);return form;
    }
    const save=(form:FormData)=>db.transaction(tx=>saveCampTransport(tx,form));
    await t.test("existing pickup choices survive and unknown drop-off times are not invented",async()=>{
      const current=await plan();assert.equal(current.routes.length,1);assert.equal(current.stops.length,6);
      assert.deepEqual(current.stops.filter(s=>s.leg==="arrival").map(s=>s.time),["07:30","08:00","08:30"]);
      assert.ok(current.stops.filter(s=>s.leg==="departure").every(s=>s.time===null));
      await db.exec("INSERT INTO camp_week(id,name,minimum_age,maximum_age,capacity) VALUES(3,'New fictional week',7,11,250)");
      await db.exec(migration);assert.equal((await plan(3)).routes.length,0);
      assert.equal(clockLabel("00:05","en"),"12:05 AM");assert.equal(clockLabel("15:07","en"),"3:07 PM");assert.equal(clockLabel("15:07","es"),"15:07");
    });
    await t.test("copying adds independent arrangements and retries cannot duplicate them",async()=>{
      const form=await command("copy",{source:"1"},3);
      assert.equal((await save(form)).status,"saved");assert.equal((await save(form)).status,"saved");
      const source=await plan(),copy=await plan(3);
      assert.equal(copy.routes.length,1);assert.equal(copy.stops.length,6);
      assert.notEqual(copy.routes[0].id,source.routes[0].id);assert.ok(copy.stops.every(s=>!source.stops.some(old=>old.id===s.id)));
      form.set("reason","Different replay");assert.equal((await save(form)).status,"invalid");
      assert.equal((await save(await command("copy",{source:"3"},3))).status,"invalid");
    });
    await t.test("vehicle and stop validation rejects dates, invalid minutes, cross-week identifiers and stale writes",async()=>{
      const current=await plan(),route=current.routes[0],stop=current.stops.find(s=>s.leg==="arrival")!;
      assert.equal((await save(await command("stopSave",{id:stop.id,route:route.id,leg:"arrival",location:"Albrook",time:"2027-01-12T08:00"}))).status,"invalid");
      assert.equal((await save(await command("stopSave",{id:stop.id,route:route.id,leg:"arrival",location:"Albrook",time:"08:75"}))).status,"invalid");
      assert.equal((await save(await command("routeSave",{id:route.id,name:"Foreign route",vehicle:"Bus 2"},2))).status,"invalid");
      const stale=await command("routeSave",{id:route.id,name:"Main route",vehicle:"Bus 1"});
      assert.equal((await save(await command("routeSave",{id:route.id,name:"Main route",vehicle:"Bus 1"}))).status,"saved");
      assert.equal((await save(stale)).status,"stale");
    });
    await t.test("saved registration plans stay unchanged when stops change and copying never shares edits",async()=>{
      const current=await plan(),stop=current.stops.find(s=>s.leg==="arrival")!,id=randomUUID();
      const details=transportSnapshot({departure:"own",food:"PRIVATE_HEALTH_DETAIL"},"arrival",stop);
      await db.query(`INSERT INTO registration(id,week_id,first_name,last_name,date_of_birth,gender_group,intake_channel,participation,notice_version,authorized_on,signer_role,signer_name,details)
        VALUES($1,1,'Fictional','Camper','2015-01-01','female','online','granted','pilot-2','2026-11-14','guardian','Sample guardian',$2::jsonb)`,[id,JSON.stringify(details)]);
      await db.query("INSERT INTO camper_arrival(registration_id,arrival_method,actual_bus,recorded_by) VALUES($1,'bus','Actual Bus 9','Sample staff')",[id]);
      assert.equal(transportNeedsReview(details,"arrival",current.stops),false);
      assert.equal((await save(await command("stopSave",{id:stop.id,route:stop.route_id,leg:"arrival",location:"New pickup location",time:"09:15",notes:"Sample instructions"}))).status,"saved");
      const changed=await plan(),saved=(await db.query<{details:Record<string,string>}>("SELECT details FROM registration WHERE id=$1",[id])).rows[0].details;
      assert.equal(saved.arrivalStop,stop.location);assert.equal(saved.arrivalTime,stop.time);assert.ok(transportNeedsReview(saved,"arrival",changed.stops));
      assert.ok((await plan(3)).stops.some(s=>s.location===stop.location&&s.time===stop.time));
      assert.equal((await save(await command("review",{registration:id,leg:"arrival",choice:stop.id}))).status,"saved");
      const reviewed=(await db.query<{details:Record<string,string>}>("SELECT details FROM registration WHERE id=$1",[id])).rows[0].details;
      assert.equal(reviewed.arrivalTime,"09:15");assert.equal(reviewed.arrivalStop,"New pickup location");assert.equal(transportNeedsReview(reviewed,"arrival",(await plan()).stops),false);
      const audit=(await db.query<{previous_plan:unknown;resulting_plan:unknown;registration_id:string}>("SELECT previous_plan,resulting_plan,registration_id FROM camp_transport_history WHERE registration_id=$1",[id])).rows[0];
      assert.equal(audit.registration_id,id);assert.ok(!JSON.stringify(audit).includes("PRIVATE_HEALTH_DETAIL"));
      assert.equal((await db.query<{actual_bus:string}>("SELECT actual_bus FROM camper_arrival WHERE registration_id=$1",[id])).rows[0].actual_bus,"Actual Bus 9");
      assert.equal((await save(await command("stopSave",{id:stop.id,route:stop.route_id,leg:"arrival",location:"New pickup location",time:"09:15",notes:"Sample instructions"}))).status,"saved");
      assert.equal(transportNeedsReview(reviewed,"arrival",(await plan()).stops),false);
      assert.equal((await save(await command("review",{registration:id,leg:"arrival",choice:"own"}))).status,"saved");
      const own=(await db.query<{details:Record<string,string>}>("SELECT details FROM registration WHERE id=$1",[id])).rows[0].details;
      assert.equal(own.arrival,"own");assert.equal(own.arrivalStopId,undefined);assert.equal(own.arrivalVehicle,undefined);
    });
    await t.test("archiving preserves history and stops offering the option to new registrations",async()=>{
      const current=await plan(),stop=current.stops.find(s=>s.leg==="arrival")!,snapshot=transportSnapshot({},"arrival",stop);
      assert.equal((await save(await command("stopToggle",{id:stop.id}))).status,"saved");
      assert.ok(!(activeTransport((await plan()).stops).some(s=>s.id===stop.id)));assert.ok(transportNeedsReview(snapshot,"arrival",(await plan()).stops));
      assert.equal((await save(await command("stopToggle",{id:stop.id}))).status,"saved");
      assert.equal((await save(await command("routeToggle",{id:stop.route_id}))).status,"saved");
      assert.equal(activeTransport((await plan()).stops).length,0);
      assert.ok((await db.query("SELECT request_id FROM camp_transport_history WHERE week_id=1 AND operation='review'")).rows.length>=2);
      assert.ok(transportStopLabel(stop,"es").includes(stop.location));
    });
  }finally{await db.close();}
});
