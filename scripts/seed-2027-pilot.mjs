import { randomUUID } from "node:crypto";
import { mkdir, mkdtemp, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";

const weeks = [
  ["SEMANA DE NIÑOS BECADOS","2027-01-12","2027-01-16",7,11,100,100,100],
  ["SEMANA DE NIÑOS","2027-01-18","2027-01-23",7,11,100,100,25],
  ["SEMANA DE JÓVENES (1)","2027-01-25","2027-01-30",12,17,100,100,0],
  ["SEMANA DE JÓVENES (2)","2027-02-01","2027-02-06",12,17,0,0,0],
  ["SEMANA +18 (CARNAVALES)","2027-02-06","2027-02-09",18,null,0,0,0],
  ["SEMANA DE JÓVENES BECADOS","2027-02-10","2027-02-13",12,17,0,0,0],
];
const transportation = [
  ["Blue Bus","Albrook","07:30","18:00","Near the dinosaur / Cerca del dinosaurio"],
  ["Bus 18","Westland","08:00","18:30","At the bus stop / En la parada de buses"],
  ["Bus 29","La Espiga","08:30","19:00","At the bus stop / En la parada de buses"],
];
const firstNames = {
  female:["Ana","Elena","Sofía","Camila","Daniela","Lucía","Isabel","Valeria","Mariana","Sara","Gabriela","Natalia","Rebeca","Paola","Marta","Andrea"],
  male:["Mateo","Daniel","Samuel","Gabriel","Elías","David","Luis","Andrés","José","Miguel","Lucas","Adrián","Josué","Carlos","Joel","Marcos"],
};
const lastNames = ["Mora","Rivera","Vega","Solís","Pérez","Gómez","Díaz","Castillo","Ríos","Mendoza","León","Ruiz","Torres","Vargas","Navarro","Medina","Santos"];
const churches = ["Iglesia Central","Iglesia del Norte","Comunidad La Esperanza","Iglesia Nuevo Camino",null];
const dateAtAge = (date,age) => String(Number(date.slice(0,4))-age)+date.slice(4);
const dateBefore = (date,days) => new Date(Date.parse(date)-days*86400000).toISOString().slice(0,10);
const textDate = (date,time) => date+"T"+time+":00-05:00";
const names = (group,index,shift=0) => [
  firstNames[group][(index+shift)%firstNames[group].length],
  lastNames[(Math.floor(index/firstNames[group].length)+shift)%lastNames.length],
];
const pick = (items,index) => items[index%items.length];

await mkdir(".local",{recursive:true});
// Preserve the active pilot and read its exact reusable housing inventory.
// Run with the demo stopped: PGlite supports one process per database folder.
const previous=(await readFile(".local/active-database","utf8").catch(error=>{
  if(error.code!=="ENOENT")throw error;return "camp";
})).trim();
if(previous!=="camp"&&!/^pilot-2027-[a-zA-Z0-9]+$/.test(previous))throw new Error("Invalid source pilot database");
await readFile(path.resolve(".local",previous,"PG_VERSION"));
const source=new PGlite(path.resolve(".local",previous));
let inventory;
try {
  inventory=(await source.query(`SELECT d.*,b.name AS building,
    (SELECT w.gender_group FROM weekly_dorm w JOIN camp_week c ON c.id=w.week_id
      WHERE w.dorm_id=d.id ORDER BY c.starts_on DESC NULLS LAST,c.id DESC LIMIT 1) AS gender_group
    FROM dorm d JOIN building b ON b.id=d.building_id ORDER BY b.id,d.id`)).rows;
} finally {await source.close();}
if(!inventory.length)throw new Error("Housing inventory is empty");
const stage = await mkdtemp(path.resolve(".local","pilot-2027-"));
await writeFile(path.join(stage,"refresh-source.json"),JSON.stringify({previous,inventory},null,2));
const db = new PGlite(stage);
try {
  const migrations = (await readdir("db")).filter(file => /^\d{3}-.+\.sql$/.test(file)).sort();
  for (const file of migrations) await db.exec(await readFile(path.join("db",file),"utf8"));
  await db.transaction(async tx => {
    const insert = async (sql,values) => (await tx.query(sql,values)).rows[0].id;
    const rooms = [];
    const adultLeadersPerCabin = 2;
    const buildings=new Map();
    for (const room of inventory) {
        if(!buildings.has(room.building))buildings.set(room.building,await insert("INSERT INTO building(name) VALUES($1) RETURNING id",[room.building]));
        const id = await insert("INSERT INTO dorm(building_id,name,physical_beds,default_usable_beds,room_kind,active,needs_cleaning) VALUES($1,$2,$3,$4,$5,$6,false) RETURNING id",[buildings.get(room.building),room.name,room.physical_beds,room.default_usable_beds,room.room_kind,room.active]);
        // Preserve an unconfigured cabin in Housing without guessing its group.
        if(room.room_kind!=="camper"||!room.gender_group)continue;
        const group=room.gender_group,beds=room.default_usable_beds??room.physical_beds;
        const team = [];
        for (let member=0; member<3; member++) {
          const name = names(group,(id-1)*3+member,4).join(" ");
          team.push(await insert("INSERT INTO staff_member(name,team_role,adult) VALUES($1,$2,true) RETURNING id",[name,member<adultLeadersPerCabin ? "guide" : "equipante"]));
        }
        rooms.push({id,group,beds,team,active:room.active});
    }

    for (const [weekIndex,week] of weeks.entries()) {
      const [name,start,end,min,max,count,confirmed,arrivals] = week;
      const id = await insert(
        "INSERT INTO camp_week(name,minimum_age,maximum_age,capacity,fee_cents,award_limit,starts_on,ends_on) VALUES($1,$2,$3,200,8000,$4,$5,$6) RETURNING id",
        [name,min,max,weekIndex===0||weekIndex===5 ? 100 : 20,start,end],
      );
      const transport=[];
      for(const [vehicle,location,pickup,dropoff,notes]of transportation){
        const routeId=randomUUID(),journeys={};
        await tx.query("INSERT INTO camp_transport_route(id,week_id,name,vehicle) VALUES($1,$2,$3,$4)",[routeId,id,location,vehicle]);
        for(const [leg,time]of [["arrival",pickup],["departure",dropoff]]){
          const stopId=randomUUID();
          await tx.query("INSERT INTO camp_transport_stop(id,week_id,route_id,leg,location,time_of_day,notes) VALUES($1,$2,$3,$4,$5,$6,$7)",[stopId,id,routeId,leg,location,time,notes]);
          journeys[leg]={id:stopId,time};
        }
        transport.push({vehicle,location,notes,journeys});
      }
      const reservations = new Map();
      for (const room of rooms) {
        const guest = 0,override=null,open=room.active;
        await tx.query("INSERT INTO weekly_dorm(week_id,dorm_id,minimum_age,maximum_age,usable_beds,guest_beds,gender_group,in_service) VALUES($1,$2,$3,$4,$5,$6,$7,$8)",[id,room.id,min,max,override,guest,room.group,open]);
        await tx.query("INSERT INTO weekly_dorm_staff(week_id,dorm_id,staff_id) SELECT $1,$2,unnest($3::integer[])",[id,room.id,min < 18 ? room.team : room.team.slice(0,adultLeadersPerCabin)]);
        reservations.set(room.id,open ? (override ?? room.beds)-adultLeadersPerCabin-guest : 0);
      }
      const codes = [];
      for (let batch=0;batch<(count?2:0);batch++) {
        const batchId=randomUUID();
        await tx.query("INSERT INTO scholarship_batch(id,week_id,distributor,distributor_role,issued_by,issued_at) VALUES($1,$2,$3,$4,'Fictional registration team',$5)",[batchId,id,batch===0 ? "Pastor Diego (demo)" : "María, staff (demo)",batch===0 ? "pastor" : "staff",textDate(dateBefore(start,30),"09:00")]);
        for (let codeIndex=0;codeIndex<(weekIndex===0 ? 50 : 8);codeIndex++) {
          const code = (weekIndex+1).toString(16).padStart(2,"0")+(batch+1).toString(16).padStart(2,"0")+(codeIndex+1).toString(16).padStart(4,"0").toUpperCase();
          const value = weekIndex===0||codeIndex%3===0 ? 8000 : 3000;
          codes.push({code,value});
          await tx.query("INSERT INTO scholarship_code(code,batch_id,value_cents) VALUES($1,$2,$3)",[code,batchId,value]);
        }
      }
      let usedCodes = 0;
      for (let index=0;index<count;index++) {
        const camperId = randomUUID(), group = index%2===0 ? "female" : "male";
        const [first,last] = names(group,Math.floor(index/2),weekIndex);
        const age = min+(index%(max === null ? 18 : max-min+1));
        const birth = dateAtAge(start,age);
        const authorized = dateBefore(start,14+(index%15));
        const signerRole = birth <= dateAtAge(authorized,18) ? "self" : "guardian";
        const signer = signerRole==="self" ? first+" "+last : "Alex "+last;
        const channel = pick(["online","online","online","paper","desk"],index);
        const status = index<confirmed ? "confirmed" : index%11===0 ? "released" : "pending";
        const permission = "granted";
        const plan=pick(transport,index),stop=plan.location;
        const bus = index%5!==0;
        const pickup = "Alex "+last;
        const details = {
          home:"Fictional address · House "+(index+1)+" past the community center",contact:pickup,relationship:"Family / Familiar",
          contactRoute:"Fictional contact via registration desk",helperRole:channel==="online" ? "family" : "staff",
          helper:channel==="online" ? pickup : "Fictional registration team",arrival:bus?"bus":"own",departure:bus?"bus":"own",
          ...(bus ? {arrivalStop:stop,departureStop:stop} : {pickup}),
          ...(pick(churches,index) ? {homeChurch:pick(churches,index)} : {}),
          ...(signerRole==="guardian" ? {signerRelationship:"Parent / Madre o padre"} : {}),
          ...(channel==="paper" ? {paperRoute:"Delivered by pastor (demo)",paperSource:"Fictional pastor",recorder:"Fictional staff",witness:"Fictional pastor"} : {}),
          ...(channel==="desk" ? {recorder:"Fictional staff"} : {}),
          food:index%37===0?"yes":index%53===0?"unknown":"none",
          diet:index%41===0?"yes":"none",
          medicationAllergy:index%67===0?"yes":index%71===0?"unknown":"none",
          medication:index%43===0?"yes":index%73===0?"unknown":"none",
          accommodation:index%59===0?"yes":"none",
        };
        if(bus)for(const leg of ["arrival","departure"])Object.assign(details,{[leg+"StopId"]:plan.journeys[leg].id,[leg+"Route"]:plan.location,[leg+"Vehicle"]:plan.vehicle,[leg+"Time"]:plan.journeys[leg].time,[leg+"StopNotes"]:plan.notes,[leg+"TransportVersion"]:"1:1"});
        if(details.diet==="yes")details.dietDetails="Vegetarian meals / Comidas vegetarianas";
        if (details.food==="yes") details.foodDetails=pick(["Peanuts / Maní","Eggs / Huevos","Milk / Leche"],Math.floor(index/37));
        if (details.medicationAllergy==="yes") details.medicationAllergyDetails="Fictional penicillin allergy / Alergia ficticia a penicilina";
        if (details.medication==="yes") details.medicationDetails="Fictional medication on file. Check with health staff.";
        if (details.accommodation==="yes") details.accommodationDetails="Fictional request for quiet breaks.";
        const scholarship = weekIndex===0||index%7===0 ? codes[usedCodes++] : undefined;
        if (scholarship) details.scholarship=scholarship.code;
        const followup = weekIndex>0&&index%19===0 ? "Confirm emergency contact details / Confirmar contacto de emergencia" : null;
        const due = followup && index%2===0 ? dateBefore(start,3) : null;
        await tx.query(
          `INSERT INTO registration(id,week_id,received_at,first_name,last_name,date_of_birth,gender_group,intake_channel,participation,notice_version,
             authorized_on,signer_role,signer_name,details,follow_up,follow_up_reason,place_status)
           VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,'pilot-1',$10,$11,$12,$13::jsonb,$14,$15,$16)`,
          [camperId,id,textDate(authorized,"11:00"),first,last,birth,group,channel,permission,authorized,signerRole,signer,JSON.stringify(details),due,followup,status],
        );
        await tx.query("UPDATE registration SET photo_permission=$2,notice_version='pilot-2',fee_at_registration_cents=8000 WHERE id=$1",[camperId,index%10===0?"declined":"granted"]);
        if (scholarship) await tx.query("UPDATE scholarship_code SET registration_id=$2,redeemed_at=$3 WHERE code=$1",[scholarship.code,camperId,textDate(authorized,"12:00")]);
        const credit = scholarship ? scholarship.value : 0;
        const payment = Math.min(8000-credit,index%9===0 ? 0 : index%5===0 ? 2000 : 8000);
        if (payment>0) await tx.query("INSERT INTO registration_payment(id,registration_id,amount_cents,reference,recorded_by,recorded_at) VALUES($1,$2,$3,$4,'Fictional staff',$5)",[randomUUID(),camperId,payment,"DEMO-"+id+"-"+(index+1),textDate(authorized,"13:00")]);
        if (status==="confirmed") await tx.query("INSERT INTO registration_review_event(registration_id,event_type,recorded_by,detail,recorded_at) VALUES($1,'confirmed','Fictional staff',$2,$3)",[camperId,payment+credit<8000?"Demo payment exception approved":"",textDate(authorized,"15:00")]);
        if (index>=arrivals) continue;
        await tx.query("INSERT INTO camper_arrival(registration_id,arrival_method,actual_bus,recorded_by,arrived_at) VALUES($1,$2,$3,'Fictional staff',$4)",[camperId,bus?"bus":"own",bus ? plan.vehicle : null,textDate(start,"10:00")]);
        const room = rooms.find(item => item.group===group && reservations.get(item.id)>0);
        if(!room)throw new Error("Not enough supervised housing for the requested fictional arrivals");
        if (room) {
          reservations.set(room.id,reservations.get(room.id)-1);
          await tx.query("INSERT INTO camper_placement(registration_id,week_id,dorm_id) VALUES($1,$2,$3)",[camperId,id,room.id]);
          await tx.query("INSERT INTO camper_placement_event(registration_id,week_id,dorm_id,recorded_by,recorded_at) VALUES($1,$2,$3,'Fictional staff',$4)",[camperId,id,room.id,textDate(start,"09:00")]);
        }
        if (weekIndex!==0) continue;
        if (!bus) {
          await tx.query("INSERT INTO camper_departure(registration_id,week_id,method,pickup_name,handoff_at,handoff_by,recorded_by,recorded_at) VALUES($1,$2,'pickup',$3,$4,'Fictional staff','Fictional staff',$4)",[camperId,id,pickup,textDate(end,"15:00")]);
          continue;
        }
        const departed = true;
        const busKey = plan.vehicle.toLowerCase().replaceAll(" ","-");
        const busName = plan.vehicle;
        await tx.query("INSERT INTO return_bus(week_id,bus_key,name,departed_at,departed_by) VALUES($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING",[id,busKey,busName,departed?textDate(end,"15:00"):null,departed?"Fictional staff":null]);
        const handoffRequired = true;
        const completedHandoff = true;
        await tx.query("INSERT INTO camper_departure(registration_id,week_id,method,bus_key,pickup_name,handoff_required,handoff_at,handoff_by,recorded_by,recorded_at) VALUES($1,$2,'bus',$3,$4,$5,$6,$7,'Fictional staff',$8)",
          [camperId,id,busKey,completedHandoff?pickup:null,handoffRequired,completedHandoff?textDate(end,plan.journeys.departure.time):null,completedHandoff?"Fictional staff":null,textDate(end,"14:50")]);
      }
    }
  });
  const counts = (await db.query(`SELECT
    (SELECT count(*)::integer FROM camp_week) AS weeks,
    (SELECT count(*)::integer FROM dorm WHERE room_kind='camper') AS cabins,
    (SELECT count(*)::integer FROM dorm WHERE room_kind='hotel') AS hotel_rooms,
    (SELECT count(*)::integer FROM registration) AS campers,
    (SELECT count(*)::integer FROM registration WHERE details->>'food'='yes') AS food_allergies,
    (SELECT count(*)::integer FROM camper_arrival) AS arrivals,
    (SELECT count(*)::integer FROM camper_placement) AS placements,
    (SELECT count(*)::integer FROM camper_departure) AS departures`)).rows[0];
  if (counts.weeks !== 6 || counts.cabins !== inventory.filter(r=>r.room_kind==="camper").length || counts.hotel_rooms !== inventory.filter(r=>r.room_kind==="hotel").length || counts.campers !== 300 || counts.arrivals!==125 || counts.placements!==125 || counts.departures!==100) throw new Error("Pilot counts failed verification");
  const progress=(await db.query(`SELECT w.id,w.name,w.starts_on::text,w.ends_on::text,w.capacity,
    count(r.id)::integer AS registered,count(a.registration_id)::integer AS checked_in,count(d.registration_id)::integer AS departed
    FROM camp_week w LEFT JOIN registration r ON r.week_id=w.id LEFT JOIN camper_arrival a ON a.registration_id=r.id
    LEFT JOIN camper_departure d ON d.registration_id=r.id GROUP BY w.id ORDER BY w.id`)).rows;
  for(const [index,w]of progress.entries())if(w.capacity!==200||w.registered!==(index<3?100:0)||w.checked_in!==(index===0?100:index===1?25:0)||w.departed!==(index===0?100:0))throw new Error("Week progress failed verification");
  if((await db.query("SELECT (SELECT count(*) FROM church_visit)+(SELECT count(*) FROM special_event) AS total")).rows[0].total!==0)throw new Error("Unexpected visits or events");
  const housing=(await db.query("SELECT b.name AS building,d.name,d.physical_beds,d.default_usable_beds,d.room_kind,d.active FROM dorm d JOIN building b ON b.id=d.building_id ORDER BY b.name,d.name")).rows;
  const original=inventory.map(({building,name,physical_beds,default_usable_beds,room_kind,active})=>({building,name,physical_beds,default_usable_beds,room_kind,active}));
  const canonical=rows=>rows.map(row=>JSON.stringify(row)).sort().join("\n");
  if(canonical(housing)!==canonical(original))throw new Error("Housing inventory was not preserved exactly");
  const transport=(await db.query(`SELECT r.week_id,r.vehicle,s.location,s.leg,to_char(s.time_of_day,'HH24:MI') AS time,s.notes
    FROM camp_transport_stop s JOIN camp_transport_route r ON r.id=s.route_id`)).rows;
  if(transport.length!==36)throw new Error("Expected six transport stops in each of six weeks");
  for(const week of progress)for(const [vehicle,location,pickup,dropoff,notes]of transportation)for(const [leg,time]of [["arrival",pickup],["departure",dropoff]]){
    if(transport.filter(s=>s.week_id===week.id&&s.vehicle===vehicle&&s.location===location&&s.leg===leg&&s.time===time&&s.notes===notes).length!==1)throw new Error("Transport plan does not match the requested buses and times");
  }
  const issues=(await db.query(`SELECT
    (SELECT count(*) FROM camper_departure d LEFT JOIN return_bus b ON b.week_id=d.week_id AND b.bus_key=d.bus_key
      WHERE (d.method='bus' AND b.departed_at IS NULL) OR (d.handoff_required AND d.handoff_at IS NULL)) AS unresolved_departures,
    (SELECT count(*) FROM camper_placement p JOIN registration r ON r.id=p.registration_id JOIN weekly_dorm w ON w.week_id=p.week_id AND w.dorm_id=p.dorm_id
      WHERE r.gender_group<>w.gender_group OR NOT w.in_service OR
        (SELECT count(*) FROM weekly_dorm_staff ws JOIN staff_member s ON s.id=ws.staff_id WHERE ws.week_id=w.week_id AND ws.dorm_id=w.dorm_id AND s.team_role='guide' AND s.adult)<2) AS invalid_placements,
    (SELECT count(*) FROM registration r WHERE r.details->>'arrival'='bus' AND NOT EXISTS
      (SELECT 1 FROM camp_transport_stop s JOIN camp_transport_route t ON t.id=s.route_id WHERE s.id::text=r.details->>'arrivalStopId' AND s.week_id=r.week_id AND s.leg='arrival'
        AND r.details->>'arrivalTransportVersion'=s.revision::text||':'||t.revision::text)) AS stale_transport`)).rows[0];
  if(Object.values(issues).some(count=>Number(count)!==0))throw new Error("Operational checks failed: "+JSON.stringify(issues));
  await writeFile(path.join(stage,"refresh-summary.json"),JSON.stringify({previous,progress,counts},null,2));
  console.log(JSON.stringify({stage:path.relative(process.cwd(),stage),previous,progress,...counts}));
} finally {
  await db.close();
}
