import ExcelJS from "exceljs";
import type { Database } from "./database.ts";
import type { Activity,VisitCost,VisitCounts } from "./visit-itinerary.ts";
import { visitPlanningCopy } from "./visit-planning-copy.ts";

export type PlanningInput={
  visit:{name:string;church_name:string;start:string;end:string;itinerary_revision:number};
  expected:VisitCounts;activities:Pick<Activity,"id"|"day"|"title"|"time"|"location"|"archived_at">[];costs:VisitCost[];
  settings:{share_group_costs:boolean;personal_extra_cents:number};
};

// Deliberately reads planning data only. No visitor roster, contact, health or staff records.
export async function getVisitPlanningInput(db:Database,id:string):Promise<PlanningInput|null>{
  const row=(await db.query<PlanningInput["visit"]&{expected_students:number;expected_adults:number;expected_leaders:number}>(`SELECT name,church_name,starts_at::date::text AS start,ends_at::date::text AS end,itinerary_revision,
    expected_students,expected_adults,expected_leaders FROM church_visit WHERE id=$1 AND cancelled_at IS NULL FOR SHARE`,[id])).rows[0];
  if(!row)return null;
  const activities=(await db.query<PlanningInput["activities"][number]>(`SELECT id,day::text AS day,title,to_char(time_of_day,'HH24:MI') AS time,location,archived_at::text AS archived_at
    FROM visit_activity WHERE visit_id=$1 AND archived_at IS NULL ORDER BY day,time_of_day NULLS LAST,title,id`,[id])).rows;
  const costs=(await db.query<VisitCost>(`SELECT id,activity_id,description,payer,basis,applies_to,quantity_override,unit_cents,meal,meal_source,archived_at::text AS archived_at
    FROM visit_cost WHERE visit_id=$1 AND archived_at IS NULL ORDER BY description,id`,[id])).rows;
  const settings=(await db.query<PlanningInput["settings"]>("SELECT share_group_costs,personal_extra_cents FROM visit_budget_settings WHERE visit_id=$1",[id])).rows[0]??{share_group_costs:true,personal_extra_cents:0};
  const {expected_students,expected_adults,expected_leaders,...visit}=row;
  return {visit,expected:{student:expected_students,adult:expected_adults,leader:expected_leaders},activities,costs,settings};
}

const teal="FF064D61",blue="FF155AA8",pale="FFEAF3FF",dark="FF223447",money='"$"#,##0.00;[Red]("$"#,##0.00);"$"0.00';
const quote=(value:string)=>'"'+value.replaceAll('"','""')+'"';
const ref=(sheet:string)=>"'"+sheet.replaceAll("'","''")+"'!";
type CostRow={day:string|null;activity:string;description:string;payer:VisitCost["payer"];basis:VisitCost["basis"];applies:VisitCost["applies_to"];quantity:number|null;unit:number|null};

export function buildVisitPlanningWorkbook(input:PlanningInput,locale:"en"|"es",exportedAt=new Date()){
  const t=visitPlanningCopy[locale],book=new ExcelJS.Workbook();
  book.creator="Palabra de Vida Panamá";book.title=t.title;book.subject=t.expected;book.created=exportedAt;book.modified=exportedAt;book.calcProperties.fullCalcOnLoad=true;
  const summary=book.addWorksheet(t.summary),country=book.addWorksheet(t.country),additional=book.addWorksheet(t.additional);
  const summaryRef=ref(summary.name),roles=["student","adult","leader"] as const,roleNames=[t.students,t.adults,t.leaders];
  const expected=input.expected,total=expected.student+expected.adult+expected.leader;
  const active=input.activities.filter(a=>!a.archived_at).sort((a,b)=>a.day.localeCompare(b.day)||(a.time??"99:99").localeCompare(b.time??"99:99")||a.title.localeCompare(b.title));
  const costs=input.costs.filter(c=>!c.archived_at&&(!c.activity_id||active.some(a=>a.id===c.activity_id)));
  const rows:CostRow[]=[];
  const costRow=(cost:VisitCost,activity?:PlanningInput["activities"][number]):CostRow=>({day:activity?.day??null,
    activity:activity?[activity.title,activity.time,activity.location].filter(Boolean).join(" · "):t.wholeVisit,
    description:cost.meal?t[cost.meal]+" · "+(cost.meal_source==="camp"?t.served:cost.meal_source==="packed"?t.packed:t.outside):cost.description,
    payer:cost.payer,basis:cost.basis,applies:cost.applies_to,quantity:cost.quantity_override,unit:cost.unit_cents===null?null:cost.unit_cents/100});
  for(const activity of active){
    const lines=costs.filter(c=>c.activity_id===activity.id);
    if(lines.length)rows.push(...lines.map(c=>costRow(c,activity)));
    else rows.push({day:activity.day,activity:[activity.title,activity.time,activity.location].filter(Boolean).join(" · "),description:"",payer:"camp",basis:"person",applies:"all",quantity:null,unit:null});
  }
  rows.push(...costs.filter(c=>!c.activity_id).map(c=>costRow(c)));
  if(!rows.length)rows.push({day:null,activity:t.noActivity,description:"",payer:"camp",basis:"person",applies:"all",quantity:null,unit:null});
  const blank:CostRow={day:null,activity:"",description:"",payer:"church",basis:"person",applies:"all",quantity:null,unit:null};
  const extras=Array.from({length:60},()=>({...blank}));
  const formula=(text:string,result:number|string):ExcelJS.CellFormulaValue=>({formula:text,result});
  const inputCell=(cell:ExcelJS.Cell)=>{cell.font={name:"Calibri",size:11,color:{argb:blue}};cell.fill={type:"pattern",pattern:"solid",fgColor:{argb:pale}};};
  const section=(sheet:ExcelJS.Worksheet,row:number,last:string,text:string)=>{sheet.mergeCells(`A${row}:${last}${row}`);const cell=sheet.getCell(`A${row}`);cell.value=text;cell.font={name:"Calibri",bold:true,size:row===1?18:12,color:{argb:"FFFFFFFF"}};cell.fill={type:"pattern",pattern:"solid",fgColor:{argb:teal}};sheet.getRow(row).height=row===1?31:24;};
  const collected=[0,0,0],personal=[0,0,0],totals={camp:0,church:0,personal:0};
  let missing=0,custom=0;
  for(const row of rows.filter(r=>r.description)){
    const people=row.quantity??(row.applies==="all"?total:expected[row.applies]);
    if(row.unit===null)missing++;else totals[row.payer]+=row.unit*(row.basis==="group"?1:people);
    if(row.quantity!==null)custom++;
    roles.forEach((role,index)=>{
      if(row.unit===null||people===0||(row.applies!=="all"&&row.applies!==role))return;
      const value=row.basis==="person"?row.unit:Math.ceil(Math.round(row.unit*100)/people)/100;
      if(row.payer==="personal")personal[index]+=value;else if(row.basis==="person"||input.settings.share_group_costs)collected[index]+=value;
    });
  }
  const fillDetail=(sheet:ExcelJS.Worksheet,data:CostRow[],name:string,help:string)=>{
    section(sheet,1,"K",sheet.name);sheet.mergeCells("A2:K3");sheet.getCell("A2").value=help;sheet.getCell("A2").alignment={wrapText:true,vertical:"middle"};sheet.getRow(2).height=29;sheet.getRow(3).height=23;
    sheet.mergeCells("A4:K4");sheet.getCell("A4").value=`${input.visit.name} · ${t.revision} ${input.visit.itinerary_revision} · ${t.expected}`;
    sheet.mergeCells("A5:K5");sheet.getCell("A5").value=t.allocationHelp;sheet.getCell("A5").font={size:10,color:{argb:"FF4B6074"}};sheet.getCell("A5").alignment={wrapText:true};sheet.getRow(5).height=31;
    const headers=[t.date,t.activity,t.description,t.payer,t.basis,t.applies,t.quantityOverride,t.people,t.unit,t.cost,t.status,
      ...roleNames.map(role=>t.collect+" · "+role),...roleNames.map(role=>t.bring+" · "+role)];
    const tableRows=data.map((item,index)=>{
      const r=index+8,people=item.quantity??(item.applies==="all"?total:expected[item.applies]);
      const amount=item.description&&item.unit!==null?item.unit*(item.basis==="group"?1:people):"";
      const countFormula=`IF(G${r}<>"",G${r},IF(F${r}=${quote(t.all)},${summaryRef}$B$11,IF(F${r}=${quote(t.students)},${summaryRef}$B$8,IF(F${r}=${quote(t.adults)},${summaryRef}$B$9,IF(F${r}=${quote(t.leaders)},${summaryRef}$B$10,0)))))`;
      const shares=roles.map((role,i)=>{
        const applicable=item.applies==="all"||item.applies===role;
        const value=item.description&&item.unit!==null&&people>0&&applicable?(item.basis==="person"?item.unit:Math.ceil(Math.round(item.unit*100)/people)/100):0;
        const base=`IF(E${r}=${quote(t.person)},I${r},ROUNDUP(I${r}/H${r},2))`;
        const eligible=`OR(F${r}=${quote(t.all)},F${r}=${quote(roleNames[i])})`;
        return {collect:formula(`IF(OR(C${r}="",I${r}="",H${r}=0),"",IF(AND(${eligible},D${r}<>${quote(t.personal)}),IF(OR(E${r}=${quote(t.person)},${summaryRef}$B$15=${quote(t.yes)}),${base},0),0))`,value&&(item.payer!=="personal")&&(item.basis==="person"||input.settings.share_group_costs)?value:0),
          personal:formula(`IF(OR(C${r}="",I${r}="",H${r}=0),"",IF(AND(${eligible},D${r}=${quote(t.personal)}),${base},0))`,value&&item.payer==="personal"?value:0)};
      });
      return [item.day?new Date(item.day+"T00:00:00Z"):null,item.activity||null,item.description||null,t[item.payer],t[item.basis],item.applies==="all"?t.all:roleNames[roles.indexOf(item.applies)],item.quantity,
        formula(countFormula,people),item.unit,formula(`IF(OR(C${r}="",I${r}=""),"",IF(E${r}=${quote(t.group)},I${r},H${r}*I${r}))`,amount),
        formula(`IF(C${r}="","",IF(I${r}="",${quote(t.unknown)},${quote(t.estimated)}))`,item.description?(item.unit===null?t.unknown:t.estimated):""),
        ...shares.map(s=>s.collect),...shares.map(s=>s.personal)];
    });
    sheet.addTable({name,ref:"A7",headerRow:true,totalsRow:false,style:{theme:"TableStyleMedium2",showRowStripes:true},columns:headers.map(header=>({name:header})),rows:tableRows});
    const widths=[13,30,31,29,17,18,15,12,17,18,20,20,20,20,20,20,20];
    widths.forEach((width,i)=>{sheet.getColumn(i+1).width=width;});
    for(let c=12;c<=17;c++){sheet.getColumn(c).hidden=true;sheet.getColumn(c).outlineLevel=1;}
    // ExcelJS 4.4 writes outlinePr after pageSetUpPr, which Excel rejects.
    // Keep Excel's default outline placement so fit-to-page printing stays valid.
    sheet.views=[{state:"frozen",ySplit:7}];sheet.getRow(7).height=34;sheet.getRow(7).alignment={horizontal:"left",vertical:"middle",wrapText:true};
    data.forEach((item,i)=>{
      const r=i+8;sheet.getRow(r).height=Math.max(35,Math.max(Math.ceil(item.activity.length/28),Math.ceil(item.description.length/29))*15+5);
      for(let c=1;c<=17;c++){const cell=sheet.getCell(r,c);cell.font={name:"Calibri",size:11,color:{argb:dark}};cell.alignment={vertical:"top",horizontal:[7,8,9,10,12,13,14,15,16,17].includes(c)?"right":"left",wrapText:c<=6||c===11};if([1,2,3,4,5,6,7,9].includes(c))inputCell(cell);}
      sheet.getCell(r,1).numFmt="yyyy-mm-dd";for(const c of [9,10,12,13,14,15,16,17])sheet.getCell(r,c).numFmt=money;
      for(const [column,values]of [[4,[t.camp,t.church,t.personal]],[5,[t.person,t.group]],[6,[t.all,...roleNames]]] as [number,string[]][])
        sheet.getCell(r,column).dataValidation={type:"list",allowBlank:false,formulae:['"'+values.join(",")+'"'],showErrorMessage:true,errorStyle:"stop"};
      for(const column of [7,9])sheet.getCell(r,column).dataValidation={type:column===7?"whole":"decimal",operator:"greaterThanOrEqual",allowBlank:true,formulae:[0],showErrorMessage:true,errorStyle:"stop"};
    });
    sheet.pageSetup={orientation:"landscape",paperSize:9,fitToPage:true,fitToWidth:1,fitToHeight:0,printTitlesRow:"1:7",printArea:`A1:K${data.length+7}`};
  };
  fillDetail(country,rows,"InCountry",t.countryHelp);fillDetail(additional,extras,"AdditionalCosts",t.additionalHelp);
  summary.columns=[{width:43},{width:18},{width:22},{width:22},{width:23}];
  section(summary,1,"E",t.title);summary.mergeCells("A2:E2");summary.getCell("A2").value=input.visit.name;summary.getCell("A2").font={bold:true,size:16,color:{argb:teal}};summary.getCell("A2").alignment={wrapText:true};summary.getRow(2).height=28;
  summary.mergeCells("A3:E3");summary.getCell("A3").value=`${input.visit.church_name} · ${input.visit.start} – ${input.visit.end} · ${t.revision} ${input.visit.itinerary_revision}`;summary.getCell("A3").alignment={wrapText:true};summary.getRow(3).height=32;
  summary.getCell("A4").value=t.exported;summary.mergeCells("B4:E4");summary.getCell("B4").value=exportedAt;summary.getCell("B4").numFmt='yyyy-mm-dd hh:mm "UTC"';
  summary.mergeCells("A5:E5");summary.getCell("A5").value=t.expected;section(summary,7,"E",t.count);
  roles.forEach((role,i)=>{summary.getCell(i+8,1).value=roleNames[i];summary.getCell(i+8,2).value=expected[role];inputCell(summary.getCell(i+8,2));summary.getCell(i+8,2).dataValidation={type:"whole",operator:"greaterThanOrEqual",formulae:[0],showErrorMessage:true,errorStyle:"stop"};});
  summary.getCell("A11").value=t.total;summary.getCell("B11").value=formula("SUM(B8:B10)",total);
  section(summary,13,"E",t.controls);summary.getCell("A14").value=t.extra;summary.getCell("B14").value=input.settings.personal_extra_cents/100;summary.getCell("B14").numFmt=money;inputCell(summary.getCell("B14"));summary.getCell("B14").dataValidation={type:"decimal",operator:"greaterThanOrEqual",formulae:[0],showErrorMessage:true,errorStyle:"stop"};
  summary.mergeCells("C14:E14");summary.getCell("C14").value=t.extraHelp;summary.getCell("A15").value=t.share;summary.getCell("B15").value=input.settings.share_group_costs?t.yes:t.no;inputCell(summary.getCell("B15"));summary.getCell("B15").dataValidation={type:"list",formulae:['"'+t.yes+","+t.no+'"'],showErrorMessage:true,errorStyle:"stop"};summary.mergeCells("C15:E15");summary.getCell("C15").value=t.groupHelp;
  section(summary,18,"E",t.budget);
  const sumBy=(payer:string)=>[country,additional].map(sheet=>`SUMIF(${ref(sheet.name)}D:D,${quote(payer)},${ref(sheet.name)}J:J)`).join("+");
  (["camp","church","personal"] as const).forEach((payer,i)=>{summary.getCell(i+20,1).value=t[payer];summary.getCell(i+20,2).value=formula(sumBy(t[payer]),totals[payer]);});
  summary.getCell("A23").value=t.extraTotal;summary.getCell("B23").value=formula("B14*B11",input.settings.personal_extra_cents/100*total);
  summary.getCell("A24").value=t.tripTotal;summary.getCell("B24").value=formula("SUM(B20:B23)",totals.camp+totals.church+totals.personal+input.settings.personal_extra_cents/100*total);
  summary.getCell("A26").value=t.missing;summary.getCell("B26").value=formula([country,additional].map(sheet=>`COUNTIF(${ref(sheet.name)}K:K,${quote(t.unknown)})`).join("+"),missing);
  summary.mergeCells("C26:E26");summary.getCell("C26").value=formula(`IF(B26>0,${quote(t.incomplete)},${quote(t.complete)})`,missing?t.incomplete:t.complete);
  summary.getCell("A27").value=t.overrides;summary.getCell("B27").value=formula(`COUNT(${ref(country.name)}G:G)+COUNT(${ref(additional.name)}G:G)`,custom);
  summary.mergeCells("C27:E27");summary.getCell("C27").value=formula(`IF(B27>0,${quote(t.overrideHelp)},"")`,custom?t.overrideHelp:"");
  summary.mergeCells("A28:E28");summary.getCell("A28").value=t.addHelp;
  [t.role,t.count,t.collect,t.bring,t.travelerTotal].forEach((text,i)=>{summary.getCell(30,i+1).value=text;summary.getCell(30,i+1).fill={type:"pattern",pattern:"solid",fgColor:{argb:teal}};summary.getCell(30,i+1).font={bold:true,color:{argb:"FFFFFFFF"}};});
  roles.forEach((role,i)=>{
    const r=i+31;summary.getRow(r).height=30;summary.getCell(r,1).value=roleNames[i];summary.getCell(r,2).value=formula(`B${i+8}`,expected[role]);
    for(const [column,detailColumn,value]of [[3,String.fromCharCode(76+i),collected[i]],[4,String.fromCharCode(79+i),personal[i]+input.settings.personal_extra_cents/100]] as [number,string,number][]){
      const sum=[country,additional].map(sheet=>`SUM(${ref(sheet.name)}${detailColumn}:${detailColumn})`).join("+")+(column===4?"+$B$14":"");
      summary.getCell(r,column).value=formula(`IF(B${r}=0,"",IF($B$26>0,${quote(t.unknown)},${sum}))`,expected[role]?(missing?t.unknown:value):"");
    }
    summary.getCell(r,5).value=formula(`IF(B${r}=0,"",IF($B$26>0,${quote(t.unknown)},SUM(C${r}:D${r})))`,expected[role]?(missing?t.unknown:collected[i]+personal[i]+input.settings.personal_extra_cents/100):"");
    for(let c=3;c<=5;c++)summary.getCell(r,c).numFmt=money;
  });
  summary.mergeCells("A35:E36");summary.getCell("A35").value=t.assumptions;summary.mergeCells("A38:E39");summary.getCell("A38").value=t.local;
  summary.eachRow(row=>{row.eachCell(cell=>{cell.alignment={...cell.alignment,vertical:"middle",horizontal:typeof cell.value==="string"?"left":"right",wrapText:true};if(!cell.font?.name)cell.font={...cell.font,name:"Calibri",size:cell.font?.size??11};});});
  for(const cell of ["C26","C27"])summary.getCell(cell).alignment={horizontal:"left",vertical:"middle",wrapText:true};
  for(const r of [14,15,26,27,28,30])summary.getRow(r).height=r===28?36:42;
  summary.getRow(35).height=48;summary.getRow(36).height=20;summary.getRow(38).height=29;summary.getRow(39).height=15;
  for(let r=20;r<=24;r++){summary.getCell(r,2).numFmt=money;summary.getRow(r).height=26;}
  summary.getRow(24).font={name:"Calibri",bold:true,size:12,color:{argb:teal}};
  summary.views=[{state:"frozen",ySplit:7}];summary.pageSetup={orientation:"portrait",paperSize:9,fitToPage:true,fitToWidth:1,fitToHeight:1,printArea:"A1:E39"};
  return book;
}
