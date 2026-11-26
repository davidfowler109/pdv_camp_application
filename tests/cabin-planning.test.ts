import assert from "node:assert/strict";
import { test } from "node:test";
import { readFile,readdir } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { cabinDemand,loadCabinPlanning,type PlanningWeek,type PlanningCamper,type PlanningCabin } from "../lib/cabin-planning.ts";

const week:PlanningWeek={id:1,name:"Fictional week",minimum_age:7,maximum_age:12,cabin_age_group_size:2,start:"2027-01-12"};
const room:PlanningCabin={id:1,name:"Sample cabin",building:"Sample building",configured:true,open:true,usable:12,guests:1,leaders:0,occupants:0,min:7,max:12,group:"female",needs_cleaning:false};
const camper=(id:string,birth:string,group="female",status="confirmed"):PlanningCamper=>({id,name:"Fictional "+id,birth,group,status,dorm_id:null});

test("two-age bands use the week start, separate groups, include pending and exclude released",()=>{
  const campers=[camper("a","2020-01-12"),camper("b","2019-01-13","male","pending"),camper("c","2015-01-12"),camper("d","2020-01-12","female","released")];
  const plan=cabinDemand(week,campers,[room],"2026-11-25");
  assert.deepEqual(plan.bands.filter(b=>b.group==="female").map(b=>[b.min,b.max]),[[7,8],[9,10],[11,12]]);
  assert.equal(plan.bands[0].members.length,1);assert.equal(plan.bands[1].members[0].age,7);
  assert.equal(plan.bands[1].confirmed,0);assert.equal(plan.entries.length,3);
  assert.deepEqual(plan.exceptions.map(c=>c.id),["b"]);
  assert.equal(plan.totals[0].beds,9); // one guest and two reserved adults
  assert.equal(plan.totals[1].shortfall,1);
});

test("shared cabin options do not duplicate capacity; closed rooms and age mismatches need review",()=>{
  const campers=[camper("a","2020-01-01"),camper("b","2015-01-01"),camper("outside","2014-01-01")];
  const plan=cabinDemand(week,campers,[room,{...room,id:2,open:false}],"2026-11-25");
  assert.equal(plan.entries[0].eligible[0].id,plan.entries[1].eligible[0].id);
  assert.equal(plan.totals[0].beds,9);assert.equal(plan.exceptions[0].id,"outside");
  const crowded=cabinDemand(week,[{...campers[0],dorm_id:1},campers[1]],[{...room,occupants:9}],"2026-11-25");
  assert.equal(crowded.entries[0].needsReview,false);assert.equal(crowded.entries[1].needsReview,true);
  assert.equal(cabinDemand({...week,cabin_age_group_size:3},[],[],"2026-11-25").bands.length,4);
  assert.equal(cabinDemand({...week,start:null},[],[],"2026-11-25").provisional,true);
});

test("stored grouping defaults to two and the live planning query leaves placements untouched",async()=>{
  const db=new PGlite();
  try {
    for(const file of (await readdir("db")).filter(name=>/^\d{3}-.+\.sql$/.test(name)).sort())await db.exec(await readFile("db/"+file,"utf8"));
    await db.exec(await readFile("db/fictional-seed.sql","utf8"));
    await db.exec("UPDATE camp_week SET starts_on='2027-01-01',ends_on='2027-01-07'");
    const id=(await db.query<{id:number}>("SELECT id FROM camp_week")).rows[0].id;
    const plan=await loadCabinPlanning(db,id,"2026-11-25");
    assert.equal(plan?.week.cabin_age_group_size,2);assert.equal(plan?.rooms.length,2);
    assert.equal(plan?.totals[0].beds,16);assert.equal(plan?.entries.length,0);
    await assert.rejects(db.query("UPDATE camp_week SET cabin_age_group_size=0"));
    await db.query("UPDATE camp_week SET cabin_age_group_size=3 WHERE id=$1",[id]);
    assert.equal((await loadCabinPlanning(db,id,"2026-11-25"))?.week.cabin_age_group_size,3);
    assert.equal((await db.query("SELECT * FROM camper_placement")).rows.length,0);
    assert.equal(await loadCabinPlanning(db,999,"2026-11-25"),null);
  } finally {await db.close();}
});
