export type TransportLeg="arrival"|"departure";
export type TransportRoute={id:string;week_id:number;name:string;vehicle:string;active:boolean;revision:number};
export type TransportStop={id:string;week_id:number;route_id:string;leg:TransportLeg;location:string;time:string|null;notes:string;active:boolean;revision:number;route:string;vehicle:string;route_active:boolean;route_revision:number};
export type TransportPlan={routes:TransportRoute[];stops:TransportStop[]};
export type TransportResult={status:"saved"|"invalid"|"stale"|"unavailable"};
export function activeTransport(stops:TransportStop[],week?:number){return stops.filter(s=>s.active&&s.route_active&&(week===undefined||s.week_id===week));}
export function transportVersion(stop:TransportStop){return stop.revision+":"+stop.route_revision;}
export function clockLabel(time:string|null,locale:"en"|"es"){
  if(!time)return locale==="es"?"Hora por confirmar":"Time to confirm";
  const [h,m]=time.split(":");if(locale==="es")return h.padStart(2,"0")+":"+m;
  return (Number(h)%12||12)+":"+m+" "+(Number(h)<12?"AM":"PM");
}
export function transportStopLabel(stop:TransportStop,locale:"en"|"es"){
  return stop.location+" · "+clockLabel(stop.time,locale)+" · "+stop.route+" · "+stop.vehicle+(stop.notes?" · "+stop.notes:"");
}
export function transportSnapshot(details:Record<string,string>,leg:TransportLeg,stop:TransportStop){
  return {...details,[leg]:"bus",[leg+"Stop"]:stop.location,[leg+"StopId"]:stop.id,[leg+"Route"]:stop.route,[leg+"Vehicle"]:stop.vehicle,
    [leg+"Time"]:stop.time??"",[leg+"StopNotes"]:stop.notes,[leg+"TransportVersion"]:transportVersion(stop)};
}
export function transportNeedsReview(details:Record<string,string>,leg:TransportLeg,stops:TransportStop[]){
  if(details[leg]!=="bus")return false;
  const stop=stops.find(s=>s.id===details[leg+"StopId"]&&s.leg===leg);
  return !stop||!stop.active||!stop.route_active||details[leg+"TransportVersion"]!==transportVersion(stop);
}
export function savedTransportLabel(details:Record<string,string>,leg:TransportLeg,locale:"en"|"es"){
  return [details[leg+"Stop"],details[leg+"Time"]?clockLabel(details[leg+"Time"],locale):"",details[leg+"Route"],details[leg+"Vehicle"]].filter(Boolean).join(" · ");
}
