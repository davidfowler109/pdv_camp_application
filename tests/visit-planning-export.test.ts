import assert from "node:assert/strict";
import { mkdir,readFile,readdir } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { createRequire } from "node:module";
import { test } from "node:test";
import ExcelJS from "exceljs";
import { PGlite } from "@electric-sql/pglite";
import { buildVisitPlanningWorkbook,getVisitPlanningInput } from "../lib/visit-planning-export.ts";
import { visitPlanningCopy } from "../lib/visit-planning-copy.ts";
import { planningFixture } from "./visit-planning-fixture.ts";

// Inspect the actual XLSX package with ExcelJS's own ZIP dependency, rather
// than relying only on a round trip through the same worksheet reader.
const JSZip=createRequire(import.meta.resolve("exceljs"))("jszip");

test("planning export uses expected attendance, live formulas and no traveler records in either language",async()=>{
  for(const locale of ["en","es"] as const){
    const t=visitPlanningCopy[locale],book=buildVisitPlanningWorkbook(planningFixture(),locale,new Date("2026-11-14T18:00:00Z"));
    assert.deepEqual(book.worksheets.map(sheet=>sheet.name),[t.summary,t.country,t.additional]);
    const sheet=book.getWorksheet(t.summary)!;
    assert.equal(sheet.getCell("B11").result,20);assert.equal(sheet.getCell("B20").result,570);
    assert.equal(sheet.getCell("B21").result,100);assert.equal(sheet.getCell("B22").result,240);
    assert.equal(sheet.getCell("B23").result,100);assert.equal(sheet.getCell("B24").result,1010);
    assert.equal(sheet.getCell("C31").result,33.5);assert.equal(sheet.getCell("D31").result,17);assert.equal(sheet.getCell("E31").result,50.5);
    assert.equal(sheet.getCell("B26").result,0);assert.equal(book.calcProperties.fullCalcOnLoad,true);
    const text=JSON.stringify(book.model);assert.ok(!text.includes("PRIVATE_"));assert.ok(!text.includes("ARCHIVED_"));
    const country=book.getWorksheet(t.country)!;
    assert.ok(country.getCell("H8").formula?.includes("$B$11"));assert.equal(country.getCell("A8").type,ExcelJS.ValueType.Date);
    assert.equal(country.getCell("G8").value,null);assert.equal(country.getCell("I8").numFmt.includes("$"),true);
    const extra=book.getWorksheet(t.additional)!;assert.equal(extra.getCell("C8").value,null);assert.ok(extra.getCell("J8").formula);
    assert.equal(extra.getCell("I8").dataValidation.allowBlank,true);assert.equal(extra.getColumn(12).hidden,true);
    const buffer=await book.xlsx.writeBuffer(),reopened=new ExcelJS.Workbook();await reopened.xlsx.load(buffer);
    const zip=await JSZip.loadAsync(buffer);
    for(let index=1;index<=3;index++){
      const xml:string=await zip.file(`xl/worksheets/sheet${index}.xml`).async("string");
      const properties=xml.match(/<sheetPr\b[^>]*>([\s\S]*?)<\/sheetPr>/)?.[1]??"";
      const outline=properties.indexOf("<outlinePr"),pageSetup=properties.indexOf("<pageSetUpPr");
      assert.ok(outline<0||pageSetup<0||outline<pageSetup,"Excel requires outlinePr before pageSetUpPr");
      assert.ok(properties.includes('fitToPage="1"'),"Preserve fit-to-page printing");
      if(index>1){
        assert.match(xml,/<tableParts count="1">/);
        assert.match(xml,/<col[^>]*hidden="1"[^>]*outlineLevel="1"/);
      }
    }
    assert.equal(reopened.getWorksheet(t.summary)!.getCell("B24").result,1010);
    assert.equal(reopened.getWorksheet(t.additional)!.getCell("J8").formula,extra.getCell("J8").formula);
    if(process.env.PDV_EXPORT_SAMPLE_DIR){await mkdir(process.env.PDV_EXPORT_SAMPLE_DIR,{recursive:true});await book.xlsx.writeFile(path.join(process.env.PDV_EXPORT_SAMPLE_DIR,"planning-"+locale+".xlsx"));}
  }
});

test("planning export distinguishes unknown, free, zero quantities and fixed group costs",()=>{
  const input=planningFixture();input.costs[0].unit_cents=null;input.costs[1].unit_cents=0;input.costs[1].quantity_override=0;
  const book=buildVisitPlanningWorkbook(input,"en"),sheet=book.getWorksheet("Trip summary")!;
  assert.equal(sheet.getCell("B26").result,1);assert.equal(sheet.getCell("B27").result,1);
  assert.equal(sheet.getCell("C31").result,"To be estimated");
  const country=book.getWorksheet("In-country estimates")!;
  assert.equal(country.getCell("I8").value,null);assert.equal(country.getCell("J8").result,"");
  assert.equal(country.getCell("G9").value,0);assert.equal(country.getCell("H9").result,0);assert.equal(country.getCell("I9").value,0);assert.equal(country.getCell("J9").result,0);
  const zero=planningFixture();zero.expected={student:0,adult:0,leader:0};
  const empty=buildVisitPlanningWorkbook(zero,"en").getWorksheet("Trip summary")!;
  assert.equal(empty.getCell("B24").result,450);assert.equal(empty.getCell("C31").result,"");
});

test("group funding changes contributions, not the group's obligations; source text stays literal",()=>{
  const input=planningFixture();input.settings.share_group_costs=false;input.costs[2].description='=HYPERLINK("https://example.test","sample")';
  const book=buildVisitPlanningWorkbook(input,"en"),summary=book.getWorksheet("Trip summary")!;
  assert.equal(summary.getCell("B20").result,570);assert.equal(summary.getCell("B21").result,100);assert.equal(summary.getCell("C31").result,11);
  const cell=book.getWorksheet("In-country estimates")!.getCell("C10");assert.equal(cell.type,ExcelJS.ValueType.String);assert.equal(cell.formula,undefined);
});

test("role-specific prices and rounded group shares preserve the exact group obligation",()=>{
  const input=planningFixture();input.expected={student:1,adult:1,leader:1};input.settings.personal_extra_cents=0;
  input.costs=[{...input.costs[2],unit_cents:100},{...input.costs[0],unit_cents:200,applies_to:"leader"}];
  const sheet=buildVisitPlanningWorkbook(input,"en").getWorksheet("Trip summary")!;
  assert.equal(sheet.getCell("B20").result,3);assert.equal(sheet.getCell("B24").result,3);
  assert.equal(sheet.getCell("C31").result,.34);assert.equal(sheet.getCell("C32").result,.34);assert.equal(sheet.getCell("C33").result,2.34);
});

test("export input projection reads planning only and excludes registered attendance and private fields",async()=>{
  const db=new PGlite(),id=randomUUID();
  try{
    const folder=new URL("../db/",import.meta.url);
    for(const name of (await readdir(folder)).filter(n=>/^\d{3}-.+\.sql$/.test(n)).sort())await db.exec(await readFile(new URL(name,folder),"utf8"));
    await db.query(`INSERT INTO church_visit(id,name,church_name,purpose,leader_name,leader_email,leader_phone,starts_at,ends_at,expected_students,expected_adults,expected_leaders)
      VALUES($1,'Fictional trip','Sample Church','PRIVATE_PURPOSE','PRIVATE_LEADER','private@example.test','PRIVATE_PHONE','2027-06-01','2027-06-03',12,6,2)`,[id]);
    await db.query(`INSERT INTO church_visitor(id,visit_id,first_name,last_name,date_of_birth,gender_group,visitor_role,contact,emergency_name,emergency_phone,details,source)
      VALUES($1,$2,'PRIVATE_VISITOR','PRIVATE_LAST','1990-01-01','female','adult','PRIVATE_CONTACT','PRIVATE_EMERGENCY','PRIVATE_PHONE','{"food":"PRIVATE_HEALTH"}','online')`,[randomUUID(),id]);
    await db.query("INSERT INTO visit_budget_settings(visit_id,count_basis,share_group_costs,personal_extra_cents) VALUES($1,'registered',true,0)",[id]);
    const result=await db.transaction(tx=>getVisitPlanningInput(tx,id));assert.ok(result);assert.deepEqual(result.expected,{student:12,adult:6,leader:2});
    assert.ok(!JSON.stringify(result).includes("PRIVATE_"));assert.equal("registered" in result,false);
    const sheet=buildVisitPlanningWorkbook(result,"en").getWorksheet("Trip summary")!;assert.equal(sheet.getCell("B11").result,20);
    await db.query("UPDATE church_visit SET cancelled_at=CURRENT_TIMESTAMP WHERE id=$1",[id]);assert.equal(await db.transaction(tx=>getVisitPlanningInput(tx,id)),null);
  }finally{await db.close();}
});
