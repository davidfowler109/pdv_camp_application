import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile,readdir } from "node:fs/promises";
import { test } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { calculateVisitBudget,getVisitPlan,saveVisitPlan,visitPlanDays,type SharedVisitEstimate } from "../lib/visit-itinerary.ts";
import { writeVisitor,changeVisitorStatus } from "../lib/church-visitors.ts";

test("daily itinerary estimates preserve costs, meal quantities and published versions", async t => {
  const db=new PGlite(), visit=randomUUID(),other=randomUUID(),activity=randomUUID();
  const costIds=Array.from({length:7},() => randomUUID());
  try {
    const folder=new URL("../db/",import.meta.url);
    for (const file of (await readdir(folder)).filter(file => /^\d{3}-.+\.sql$/.test(file)).sort()) await db.exec(await readFile(new URL(file,folder),"utf8"));
    await db.exec(await readFile(new URL("022-church-visit-itinerary.sql",folder),"utf8"));
    for (const id of [visit,other]) await db.query(`INSERT INTO church_visit(id,name,church_name,purpose,leader_name,leader_email,leader_phone,
      starts_at,ends_at,expected_students,expected_adults,expected_leaders) VALUES($1,'Fictional ministry visit','Fictional church','Ministry',
      'PRIVATE_LEADER','private@example.test','555-0100','2027-06-01T12:00','2027-06-03T12:00',12,6,2)`,[id]);
    const plan=async () => (await getVisitPlan(db,visit))!;
    async function command(operation:string,values:Record<string,string>={}) {
      const form=new FormData();
      for (const [key,value] of Object.entries({visit,request:randomUUID(),operation,actor:"PRIVATE_STAFF",changeNotes:"Private planning notes",
        revision:String((await plan()).visit.itinerary_revision),returnDay:"2027-06-01",...values})) form.set(key,value);
      return form;
    }
    const save=(form:FormData) => db.transaction(tx => saveVisitPlan(tx,form));
    const cost=(id:string,values:Record<string,string>) => command("costSave",{id,activity,description:"Sample cost",payer:"camp",basis:"person",applies:"all",price:"5.00",...values});
    await t.test("visit dates include every day across a month or leap day", () => {
      assert.deepEqual(visitPlanDays("2028-02-28","2028-03-01"),["2028-02-28","2028-02-29","2028-03-01"]);
    });
    await t.test("the orphanage day totals camp charges, church expenses and personal restaurant money separately", async () => {
      assert.equal((await save(await command("activitySave",{id:activity,day:"2027-06-01",title:"Orphanage ministry visit",time:"08:00",location:"Orphanage"}))).status,"saved");
      const rows:Record<string,string>[]=[
        {description:"Breakfast",price:"5",meal:"breakfast",mealSource:"camp"},
        {description:"Packed lunch",price:"6",meal:"lunch",mealSource:"packed"},
        {description:"Group bus",price:"150",basis:"group"},
        {description:"Restaurant dinner",price:"12",payer:"personal",meal:"dinner",mealSource:"outside"},
        {description:"Donation",price:"100",payer:"church",basis:"group"},
      ];
      for (let index=0;index<rows.length;index++) assert.equal((await save(await cost(costIds[index],rows[index]))).status,"saved");
      const budget=calculateVisitBudget(await plan());
      assert.deepEqual(budget.totals,{camp:37000,church:10000,personal:24000});
      assert.equal(budget.count,20);
      assert.equal(budget.allowances[0].collect,2350);
      assert.equal(budget.allowances[0].bring,1200);
      assert.deepEqual(budget.meals.map(row => [row.meal,row.camp,row.packed,row.outside]),[["breakfast",20,0,0],["lunch",0,20,0],["dinner",0,0,20]]);
    });
    await t.test("unknown and free prices differ, custom portions affect kitchen counts, and meals from camp are paid by the church", async () => {
      assert.equal((await save(await cost(costIds[5],{description:"Free ministry activity",price:"0"}))).status,"saved");
      assert.equal((await save(await cost(costIds[6],{description:"Admission awaiting quote",price:""}))).status,"saved");
      let budget=calculateVisitBudget(await plan());
      assert.equal(budget.incomplete,true);
      assert.equal(budget.lines.find(row => row.id===costIds[5])?.total,0);
      assert.equal(budget.lines.find(row => row.id===costIds[6])?.total,null);
      assert.equal((await save(await cost(costIds[1],{description:"Packed lunch",price:"6",quantity:"10",meal:"lunch",mealSource:"packed"}))).status,"saved");
      budget=calculateVisitBudget(await plan());
      assert.equal(budget.meals.find(row => row.meal==="lunch")?.packed,10);
      assert.equal(budget.customCounts,true);
      assert.equal((await save(await cost(randomUUID(),{price:"5",payer:"personal",meal:"breakfast",mealSource:"camp"}))).status,"invalid");
      assert.equal((await save(await cost(randomUUID(),{price:"1.005"}))).status,"invalid");
    });
    await t.test("whole-visit group charges stay singular and church funding changes suggested contributions without changing its obligation", async () => {
      assert.equal((await save(await cost(randomUUID(),{activity:"",description:"Whole visit lodging",price:"200",basis:"group"}))).status,"saved");
      const before=calculateVisitBudget(await plan()).totals.camp;
      assert.equal(before,51000);
      assert.equal((await save(await command("settings",{countBasis:"expected",extra:"25"}))).status,"saved");
      const budget=calculateVisitBudget(await plan());
      assert.equal(budget.totals.camp,before);
      assert.equal(budget.allowances[0].collect,1100);
      assert.equal(budget.allowances[0].bring,3700);
    });
    await t.test("copying a day is retry-safe and copies active meal quantities and unknown prices", async () => {
      const copy=await command("copyDay",{sourceDay:"2027-06-01",targetDay:"2027-06-02"});
      assert.equal((await save(copy)).status,"saved");
      assert.equal((await save(copy)).status,"saved");
      const current=await plan();
      assert.equal(current.activities.filter(row => row.day==="2027-06-02").length,1);
      const copied=current.activities.find(row => row.day==="2027-06-02")!;
      assert.equal(current.costs.filter(row => row.activity_id===copied.id).length,7);
      assert.ok(current.costs.some(row => row.activity_id===copied.id && row.unit_cents===null));
      assert.equal((await save(await command("copyDay",{sourceDay:"2027-06-01",targetDay:"2027-06-01"}))).status,"invalid");
      assert.equal((await save(await command("copyActivity",{id:activity,targetDay:"2027-06-03"}))).status,"saved");
    });
    await t.test("archiving and restoring an activity excludes and restores its expenses, while stale edits and cross-visit costs are rejected", async () => {
      const copied=(await plan()).activities.find(row => row.day==="2027-06-03")!;
      const before=calculateVisitBudget(await plan()).totals.camp;
      assert.equal((await save(await command("activityArchive",{id:copied.id}))).status,"saved");
      assert.ok(calculateVisitBudget(await plan()).totals.camp<before);
      assert.equal((await save(await command("activityRestore",{id:copied.id}))).status,"saved");
      assert.equal(calculateVisitBudget(await plan()).totals.camp,before);
      const stale=await command("costArchive",{id:costIds[5]});
      assert.equal((await save(await command("costArchive",{id:costIds[6]}))).status,"saved");
      assert.equal((await save(stale)).status,"stale");
      assert.equal((await save(await command("costRestore",{id:costIds[6]}))).status,"saved");
      const foreign=await cost(costIds[0],{price:"10"}); foreign.set("visit",other); foreign.set("revision","0");
      assert.equal((await save(foreign)).status,"invalid");
    });
    await t.test("published estimates retain their numbers and contain no visitor details, leader contacts or staff notes", async () => {
      const publish=await command("publish");
      assert.equal((await save(publish)).status,"saved");
      assert.equal((await save(publish)).status,"saved");
      const publications=(await db.query<{payload:SharedVisitEstimate}>("SELECT payload FROM visit_budget_publication WHERE visit_id=$1",[visit])).rows;
      assert.equal(publications.length,1);
      assert.doesNotMatch(JSON.stringify(publications[0].payload),/PRIVATE_|private@example|Private planning notes/);
      const frozen=publications[0].payload.budget.totals.camp;
      assert.equal((await save(await cost(costIds[0],{description:"Breakfast",price:"7",meal:"breakfast",mealSource:"camp"}))).status,"saved");
      assert.notEqual(calculateVisitBudget(await plan()).totals.camp,frozen);
      assert.equal((await db.query<{payload:SharedVisitEstimate}>("SELECT payload FROM visit_budget_publication WHERE visit_id=$1",[visit])).rows[0].payload.budget.totals.camp,frozen);
    });
    await t.test("estimate links can be withdrawn and restored without rewriting the dated figures", async () => {
      const publication=(await db.query<{id:string;payload:SharedVisitEstimate}>("SELECT id,payload FROM visit_budget_publication WHERE visit_id=$1",[visit])).rows[0];
      const revision=(await plan()).visit.itinerary_revision;
      assert.equal((await save(await command("estimateWithdraw",{id:publication.id,changeNotes:""}))).status,"noteRequired");
      assert.equal((await save(await command("estimateWithdraw",{id:publication.id}))).status,"saved");
      assert.equal((await db.query("SELECT id FROM visit_budget_publication WHERE id=$1 AND withdrawn_at IS NOT NULL",[publication.id])).rows.length,1);
      assert.equal((await save(await command("estimateRestore",{id:publication.id}))).status,"saved");
      assert.equal((await plan()).visit.itinerary_revision,revision);
      assert.deepEqual((await db.query<{payload:SharedVisitEstimate}>("SELECT payload FROM visit_budget_publication WHERE id=$1",[publication.id])).rows[0].payload,publication.payload);
    });
    await t.test("registered counts are explicit and registration changes only invalidate estimates using those counts", async () => {
      function registration() {
        const data=new FormData();
        for (const [key,value] of Object.entries({id:randomUUID(),visit,first:"PRIVATE_VISITOR",last:"Sample",birth:"1990-01-01",gender:"female",role:"adult",contact:"Private contact",emergencyName:"Private emergency",emergencyPhone:"555-0100",signer:"Private signer",relationship:"self",consent:"yes",foodAnswer:"none",dietAnswer:"none",accessAnswer:"none"})) data.set(key,value);
        return data;
      }
      const revision=(await plan()).visit.itinerary_revision;
      assert.equal(await db.transaction(tx => writeVisitor(tx,registration(),"online","2026-11-13")),"received");
      assert.equal((await plan()).visit.itinerary_revision,revision);
      assert.equal((await save(await command("settings",{countBasis:"registered",extra:"0",shareGroup:"on"}))).status,"saved");
      assert.equal(calculateVisitBudget(await plan()).count,1);
      const next=registration(),old=(await plan()).visit.itinerary_revision;
      assert.equal(await db.transaction(tx => writeVisitor(tx,next,"online","2026-11-13")),"received");
      assert.ok((await plan()).visit.itinerary_revision>old);
      assert.equal(calculateVisitBudget(await plan()).count,2);
      next.set("operation","withdraw"); next.set("recorder","Staff"); next.set("reason","Changed plans"); next.set("revision","1");
      assert.equal(await db.transaction(tx => changeVisitorStatus(tx,next)),"saved");
      assert.equal(calculateVisitBudget(await plan()).count,1);
    });
    await t.test("activities outside changed visit dates block a new publication and cancelled visits close edits", async () => {
      await db.query("UPDATE church_visit SET ends_at='2027-06-02T12:00' WHERE id=$1",[visit]);
      assert.equal((await save(await command("publish"))).status,"outsideDates");
      await db.query("UPDATE church_visit SET cancelled_at=CURRENT_TIMESTAMP WHERE id=$1",[visit]);
      assert.equal((await save(await command("publish"))).status,"closed");
    });
    await t.test("role-specific prices and group rounding retain exact group totals", async () => {
      const current=await plan(),bus=current.costs.find(row => row.id===costIds[2])!,breakfast=current.costs.find(row => row.id===costIds[0])!;
      const budget=calculateVisitBudget({...current,expected:{student:1,adult:1,leader:1},settings:{count_basis:"expected",share_group_costs:true,personal_extra_cents:0},
        costs:[{...bus,unit_cents:100},{...breakfast,applies_to:"student",unit_cents:500}]});
      assert.equal(budget.totals.camp,600);
      assert.deepEqual(budget.allowances.map(row => row.collect),[534,34,34]);
    });
  } finally { await db.close(); }
});
