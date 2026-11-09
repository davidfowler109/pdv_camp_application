import { randomUUID } from "node:crypto";
import { mkdir, mkdtemp, readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";

const weeks = [
  ["Kids / Niños 1","2027-01-12","2027-01-16",7,11,218,190,160],
  ["Kids / Niños 2","2027-01-18","2027-01-23",7,11,126,106,0],
  ["Youth / Jóvenes 1","2027-01-25","2027-01-30",12,17,178,144,0],
  ["Youth / Jóvenes 2","2027-02-01","2027-02-06",12,17,142,110,0],
  ["Adults / Adultos 1","2027-02-06","2027-02-09",18,null,60,44,0],
  ["Adults / Adultos 2","2027-02-10","2027-02-13",18,null,46,32,0],
];
const buildings = [
  ["Águila Arpía","male",1,6,16],["Iguana","male",7,10,10],
  ["Colibrí","female",1,6,16],["Delfín","female",7,10,10],
];
const firstNames = {
  female:["Ana","Elena","Sofía","Camila","Daniela","Lucía","Isabel","Valeria","Mariana","Sara","Gabriela","Natalia","Rebeca","Paola","Marta","Andrea"],
  male:["Mateo","Daniel","Samuel","Gabriel","Elías","David","Luis","Andrés","José","Miguel","Lucas","Adrián","Josué","Carlos","Joel","Marcos"],
};
const lastNames = ["Mora","Rivera","Vega","Solís","Pérez","Gómez","Díaz","Castillo","Ríos","Mendoza","León","Ruiz","Torres","Vargas","Navarro","Medina","Santos"];
const churches = ["Iglesia Central","Iglesia del Norte","Comunidad La Esperanza","Iglesia Nuevo Camino",null];
const stops = ["Albrook","Westland","La Espiga"];
const dateAtAge = (date,age) => String(Number(date.slice(0,4))-age)+date.slice(4);
const dateBefore = (date,days) => new Date(Date.parse(date)-days*86400000).toISOString().slice(0,10);
const textDate = (date,time) => date+"T"+time+":00-05:00";
const names = (group,index,shift=0) => [
  firstNames[group][(index+shift)%firstNames[group].length],
  lastNames[(Math.floor(index/firstNames[group].length)+shift)%lastNames.length],
];
const pick = (items,index) => items[index%items.length];

await mkdir(".local",{recursive:true});
const stage = await mkdtemp(path.resolve(".local","pilot-2027-"));
const db = new PGlite(stage);
try {
  const migrations = (await readdir("db")).filter(file => /^\d{3}-.+\.sql$/.test(file)).sort();
  for (const file of migrations) await db.exec(await readFile(path.join("db",file),"utf8"));
  await db.transaction(async tx => {
    const insert = async (sql,values) => (await tx.query(sql,values)).rows[0].id;
    const rooms = [];
    for (const [building,group,first,last,beds] of buildings) {
      const buildingId = await insert("INSERT INTO building(name) VALUES($1) RETURNING id",[building]);
      for (let number=first; number<=last; number++) {
        const id = await insert("INSERT INTO dorm(building_id,name,physical_beds,default_usable_beds) VALUES($1,$2,$3,$3) RETURNING id",[buildingId,"Cabin "+number,beds]);
        const team = [];
        for (let member=0; member<3; member++) {
          const name = names(group,(id-1)*3+member,4).join(" ");
          team.push(await insert("INSERT INTO staff_member(name,team_role,adult) VALUES($1,$2,true) RETURNING id",[name,member<2 ? "guide" : "equipante"]));
        }
        rooms.push({id,group,beds,team});
      }
    }
    const hotel = await insert("INSERT INTO building(name) VALUES('Guest Hotel') RETURNING id",[]);
    for (let room=1; room<=24; room++) {
      await tx.query("INSERT INTO dorm(building_id,name,physical_beds,default_usable_beds,room_kind,needs_cleaning) VALUES($1,$2,2,2,'hotel',$3)",[hotel,String(room),room>=22]);
    }

    for (const [weekIndex,week] of weeks.entries()) {
      const [name,start,end,min,max,count,confirmed,arrivals] = week;
      const id = await insert(
        "INSERT INTO camp_week(name,minimum_age,maximum_age,capacity,fee_cents,award_limit,starts_on,ends_on) VALUES($1,$2,$3,250,8000,$4,$5,$6) RETURNING id",
        [name,min,max,weekIndex===0 ? 35 : 20,start,end],
      );
      const reservations = new Map();
      for (const room of rooms) {
        const guest = weekIndex===0 && (room.id===9 || room.id===19) ? 1 : 0;
        const override = weekIndex===0 && room.id===2 ? room.beds-2 : null;
        const open = !(weekIndex===0 && room.id===20);
        await tx.query("INSERT INTO weekly_dorm(week_id,dorm_id,minimum_age,maximum_age,usable_beds,guest_beds,gender_group,in_service) VALUES($1,$2,$3,$4,$5,$6,$7,$8)",[id,room.id,min,max,override,guest,room.group,open]);
        await tx.query("INSERT INTO weekly_dorm_staff(week_id,dorm_id,staff_id) SELECT $1,$2,unnest($3::integer[])",[id,room.id,room.team]);
        reservations.set(room.id,open ? (override ?? room.beds)-room.team.length-guest : 0);
      }
      const codes = [];
      for (let batch=0;batch<2;batch++) {
        const batchId=randomUUID();
        await tx.query("INSERT INTO scholarship_batch(id,week_id,distributor,distributor_role,issued_by,issued_at) VALUES($1,$2,$3,$4,'Fictional registration team',$5)",[batchId,id,batch===0 ? "Pastor Diego (demo)" : "María, staff (demo)",batch===0 ? "pastor" : "staff",textDate(dateBefore(start,30),"09:00")]);
        for (let codeIndex=0;codeIndex<(weekIndex===0 ? 15 : 8);codeIndex++) {
          const code = (weekIndex+1).toString(16).padStart(2,"0")+(batch+1).toString(16).padStart(2,"0")+(codeIndex+1).toString(16).padStart(12,"0").toUpperCase();
          const value = codeIndex%3===0 ? 8000 : 3000;
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
        const permission = index%13===0 ? "pending" : index%71===0 ? "declined" : "granted";
        const stop = pick(stops,index);
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
          medicationAllergy:index%67===0?"yes":index%71===0?"unknown":"none",
          medication:index%43===0?"yes":index%73===0?"unknown":"none",
          accommodation:index%59===0?"yes":"none",
        };
        if (details.food==="yes") details.foodDetails=pick(["Peanuts / Maní","Eggs / Huevos","Milk / Leche"],Math.floor(index/37));
        if (details.medicationAllergy==="yes") details.medicationAllergyDetails="Fictional penicillin allergy / Alergia ficticia a penicilina";
        if (details.medication==="yes") details.medicationDetails="Fictional medication on file. Check with health staff.";
        if (details.accommodation==="yes") details.accommodationDetails="Fictional request for quiet breaks.";
        const scholarship = index%7===0 ? codes[usedCodes++] : undefined;
        if (scholarship) details.scholarship=scholarship.code;
        const followup = index%19===0 ? "Confirm participation permission or contact arrangements" : null;
        const due = followup && index%2===0 ? dateBefore(start,3) : null;
        await tx.query(
          `INSERT INTO registration(id,week_id,received_at,first_name,last_name,date_of_birth,gender_group,intake_channel,participation,notice_version,
             authorized_on,signer_role,signer_name,details,follow_up,follow_up_reason,place_status)
           VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,'pilot-1',$10,$11,$12,$13::jsonb,$14,$15,$16)`,
          [camperId,id,textDate(authorized,"11:00"),first,last,birth,group,channel,permission,authorized,signerRole,signer,JSON.stringify(details),due,followup,status],
        );
        if (scholarship && index%21!==0) await tx.query("UPDATE scholarship_code SET registration_id=$2,redeemed_at=$3 WHERE code=$1",[scholarship.code,camperId,textDate(authorized,"12:00")]);
        const credit = scholarship && index%21!==0 ? scholarship.value : 0;
        const payment = Math.min(8000-credit,index%9===0 ? 0 : index%5===0 ? 2000 : 8000);
        if (payment>0) await tx.query("INSERT INTO registration_payment(id,registration_id,amount_cents,reference,recorded_by,recorded_at) VALUES($1,$2,$3,$4,'Fictional staff',$5)",[randomUUID(),camperId,payment,"DEMO-"+id+"-"+(index+1),textDate(authorized,"13:00")]);
        if (status==="confirmed") await tx.query("INSERT INTO registration_review_event(registration_id,event_type,recorded_by,detail,recorded_at) VALUES($1,'confirmed','Fictional staff',$2,$3)",[camperId,payment+credit<8000?"Demo payment exception approved":"",textDate(authorized,"15:00")]);
        if (index>=arrivals) continue;
        await tx.query("INSERT INTO camper_arrival(registration_id,arrival_method,actual_bus,recorded_by,arrived_at) VALUES($1,$2,$3,'Fictional staff',$4)",[camperId,bus?"bus":"own",bus ? "Bus "+(index%17===0?"Alternate":stop) : null,textDate(start,"08:30")]);
        const room = index%17===0 ? null : rooms.find(item => item.group===group && reservations.get(item.id)>0);
        if (room) {
          reservations.set(room.id,reservations.get(room.id)-1);
          await tx.query("INSERT INTO camper_placement(registration_id,week_id,dorm_id) VALUES($1,$2,$3)",[camperId,id,room.id]);
          await tx.query("INSERT INTO camper_placement_event(registration_id,week_id,dorm_id,recorded_by,recorded_at) VALUES($1,$2,$3,'Fictional staff',$4)",[camperId,id,room.id,textDate(start,"09:00")]);
        }
        if (index%4!==0 && index%7!==0) continue;
        if (!bus) {
          await tx.query("INSERT INTO camper_departure(registration_id,week_id,method,pickup_name,handoff_at,handoff_by,recorded_by,recorded_at) VALUES($1,$2,'pickup',$3,$4,'Fictional staff','Fictional staff',$4)",[camperId,id,pickup,textDate(end,"15:00")]);
          continue;
        }
        const departed = index%3!==0;
        const busKey = departed ? "return-central" : "return-norte";
        const busName = departed ? "Return Central" : "Return Norte";
        await tx.query("INSERT INTO return_bus(week_id,bus_key,name,departed_at,departed_by) VALUES($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING",[id,busKey,busName,departed?textDate(end,"15:00"):null,departed?"Fictional staff":null]);
        const handoffRequired = departed && index%2===0;
        const completedHandoff = handoffRequired && index%4===0;
        await tx.query("INSERT INTO camper_departure(registration_id,week_id,method,bus_key,pickup_name,handoff_required,handoff_at,handoff_by,recorded_by,recorded_at) VALUES($1,$2,'bus',$3,$4,$5,$6,$7,'Fictional staff',$8)",
          [camperId,id,busKey,completedHandoff?pickup:null,handoffRequired,completedHandoff?textDate(end,"16:30"):null,completedHandoff?"Fictional staff":null,textDate(end,"14:50")]);
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
  if (counts.weeks !== 6 || counts.cabins !== 20 || counts.hotel_rooms !== 24 || counts.campers !== 770) throw new Error("Pilot counts failed verification");
  console.log(JSON.stringify({stage:path.relative(process.cwd(),stage),...counts}));
} finally {
  await db.close();
}
