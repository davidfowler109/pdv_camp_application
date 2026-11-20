import { createHash,randomUUID } from "node:crypto";
import type { Database } from "./database.ts";
import { integer } from "./housing.ts";

const uuid=/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i;
import { activeTransport,transportSnapshot,type TransportPlan,type TransportRoute,type TransportStop,type TransportResult } from "./camp-transport-options.ts";
export * from "./camp-transport-options.ts";
export async function getCampTransport(db:Database,week?:number):Promise<TransportPlan>{
  const [routes,stops]=await Promise.all([
    db.query<TransportRoute>("SELECT * FROM camp_transport_route WHERE ($1::integer IS NULL OR week_id=$1) ORDER BY name,vehicle,id",[week??null]).then(r=>r.rows),
    db.query<TransportStop>(`SELECT s.id,s.week_id,s.route_id,s.leg,s.location,to_char(s.time_of_day,'HH24:MI') AS time,s.notes,s.active,s.revision,
      r.name AS route,r.vehicle,r.active AS route_active,r.revision AS route_revision FROM camp_transport_stop s JOIN camp_transport_route r ON r.id=s.route_id
      WHERE ($1::integer IS NULL OR s.week_id=$1) ORDER BY s.leg,s.time_of_day NULLS LAST,s.location,s.id`,[week??null]).then(r=>r.rows),
  ]);return {routes,stops};
}
export async function saveCampTransport(tx:Database,form:FormData):Promise<TransportResult>{
  const read=(key:string)=>typeof form.get(key)==="string"?String(form.get(key)).trim():"";
  const week=integer(form.get("week"),1,2147483647),operation=read("operation"),request=read("request"),actor=read("actor"),reason=read("reason");
  if(week===null||!uuid.test(request)||!actor||actor.length>160||!reason||reason.length>1000||!["routeSave","stopSave","routeToggle","stopToggle","copy","review"].includes(operation))return {status:"invalid"};
  const signature=createHash("sha256").update(JSON.stringify([...form.entries()].sort(([a],[b])=>a.localeCompare(b)))).digest("hex");
  const source=operation==="copy"?integer(form.get("source"),1,2147483647):null;
  if(operation==="copy"&&(source===null||source===week))return {status:"invalid"};
  const weeks=[...new Set([week,...(source?[source]:[])])].sort((a,b)=>a-b);
  const locked=(await tx.query<{id:number;transport_revision:number}>("SELECT id,transport_revision FROM camp_week WHERE id=ANY($1::integer[]) ORDER BY id FOR UPDATE",[weeks])).rows;
  if(locked.length!==weeks.length)return {status:"invalid"};
  const prior=(await tx.query<{request_signature:string}>("SELECT request_signature FROM camp_transport_history WHERE request_id=$1",[request])).rows[0];
  if(prior)return {status:prior.request_signature===signature?"saved":"invalid"};
  if(String(locked.find(w=>w.id===week)!.transport_revision)!==read("revision"))return {status:"stale"};
  const before=await getCampTransport(tx,week);let previousRecord:unknown=null,resultingRecord:unknown=null;
  const id=read("id");
  if(operation==="routeSave"){
    const name=read("name"),vehicle=read("vehicle");
    if(!uuid.test(id)||!name||name.length>40||!vehicle||vehicle.length>40)return {status:"invalid"};
    const existing=(await tx.query<{week_id:number}>("SELECT week_id FROM camp_transport_route WHERE id=$1",[id])).rows[0];
    if(existing&&existing.week_id!==week)return {status:"invalid"};
    await tx.query(`INSERT INTO camp_transport_route(id,week_id,name,vehicle) VALUES($1,$2,$3,$4) ON CONFLICT(id) DO UPDATE SET name=excluded.name,vehicle=excluded.vehicle,
      revision=camp_transport_route.revision+1 WHERE (camp_transport_route.name,camp_transport_route.vehicle) IS DISTINCT FROM (excluded.name,excluded.vehicle)`,[id,week,name,vehicle]);
  }else if(operation==="stopSave"){
    const route=before.routes.find(r=>r.id===read("route")&&r.active),leg=read("leg"),location=read("location"),time=read("time"),notes=read("notes");
    if(!uuid.test(id)||!route||!["arrival","departure"].includes(leg)||!location||location.length>160||!/^([01]\d|2[0-3]):[0-5]\d$/.test(time)||notes.length>500)return {status:"invalid"};
    const existing=(await tx.query<{week_id:number}>("SELECT week_id FROM camp_transport_stop WHERE id=$1",[id])).rows[0];
    if(existing&&existing.week_id!==week)return {status:"invalid"};
    await tx.query(`INSERT INTO camp_transport_stop(id,week_id,route_id,leg,location,time_of_day,notes) VALUES($1,$2,$3,$4,$5,$6,$7)
      ON CONFLICT(id) DO UPDATE SET route_id=excluded.route_id,leg=excluded.leg,location=excluded.location,time_of_day=excluded.time_of_day,notes=excluded.notes,
      revision=camp_transport_stop.revision+1 WHERE (camp_transport_stop.route_id,camp_transport_stop.leg,camp_transport_stop.location,camp_transport_stop.time_of_day,camp_transport_stop.notes)
      IS DISTINCT FROM (excluded.route_id,excluded.leg,excluded.location,excluded.time_of_day,excluded.notes)`,[id,week,route.id,leg,location,time,notes]);
  }else if(operation==="routeToggle"||operation==="stopToggle"){
    if(!uuid.test(id)||!(operation==="routeToggle"?before.routes:before.stops).some(row=>row.id===id))return {status:"invalid"};
    const table=operation==="routeToggle"?"camp_transport_route":"camp_transport_stop";
    await tx.query(`UPDATE ${table} SET active=NOT active,revision=revision+1 WHERE id=$1 AND week_id=$2`,[id,week]);
  }else if(operation==="copy"){
    const from=await getCampTransport(tx,source!);
    if(!from.routes.some(r=>r.active))return {status:"invalid"};
    for(const route of from.routes.filter(r=>r.active)){
      const copied=randomUUID();await tx.query("INSERT INTO camp_transport_route(id,week_id,name,vehicle) VALUES($1,$2,$3,$4)",[copied,week,route.name,route.vehicle]);
      for(const stop of from.stops.filter(s=>s.route_id===route.id&&s.active))await tx.query("INSERT INTO camp_transport_stop(id,week_id,route_id,leg,location,time_of_day,notes) VALUES($1,$2,$3,$4,$5,$6,$7)",[randomUUID(),week,copied,stop.leg,stop.location,stop.time,stop.notes]);
    }
  }else{
    const registration=read("registration"),leg=read("leg");
    if(!uuid.test(registration)||!(leg==="arrival"||leg==="departure"))return {status:"invalid"};
    const record=(await tx.query<{details:Record<string,string>}>("SELECT details FROM registration WHERE id=$1 AND week_id=$2 FOR UPDATE",[registration,week])).rows[0];
    if(!record)return {status:"invalid"};
    const transportRecord=(details:Record<string,string>)=>Object.fromEntries(Object.entries(details).filter(([key])=>
      /^(arrival|departure)(Stop|StopId|Route|Vehicle|Time|StopNotes|TransportVersion)?$/.test(key)));
    previousRecord=transportRecord(record.details);
    let details={...record.details};
    if(read("choice")==="own"){
      details[leg]="own";for(const suffix of ["Stop","StopId","Route","Vehicle","Time","StopNotes","TransportVersion"])delete details[leg+suffix];
    }else{
      const stop=activeTransport(before.stops).find(s=>s.id===read("choice")&&s.leg===leg);
      if(!stop)return {status:"invalid"};details=transportSnapshot(details,leg,stop);
    }
    resultingRecord=transportRecord(details);await tx.query("UPDATE registration SET details=$2::jsonb WHERE id=$1",[registration,JSON.stringify(details)]);
  }
  await tx.query("UPDATE camp_week SET transport_revision=transport_revision+1 WHERE id=$1",[week]);
  const after=await getCampTransport(tx,week);
  await tx.query("INSERT INTO camp_transport_history(request_id,request_signature,week_id,operation,recorded_by,reason,previous_plan,resulting_plan,registration_id) VALUES($1,$2,$3,$4,$5,$6,$7::jsonb,$8::jsonb,$9)",
    [request,signature,week,operation,actor,reason,JSON.stringify({plan:before,registration:previousRecord}),JSON.stringify({plan:after,registration:resultingRecord}),operation==="review"?read("registration"):null]);
  return {status:"saved"};
}
