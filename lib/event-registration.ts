import { dateParts } from "./registration.ts";

export const eventNoticeVersion = "event-pilot-1";
export const eventUuid = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
export type EventSource = "online"|"desk"|"paper";

export function readEventField(form:FormData,key:string) {
  const value = form.get(key);
  return typeof value === "string" ? value.trim() : "";
}

export function parseEventAttendee(form:FormData,source:EventSource,today:string) {
  const read = (key:string) => readEventField(form,key);
  const id=read("id"), event=read("event"), first=read("first"), last=read("last"), contact=read("contact");
  const attendance=read("attendance"), rooming=attendance==="overnight" ? read("rooming") : null;
  const church=rooming==="church" ? read("church") : null;
  const code=rooming==="group" ? read("code").toUpperCase() : null;
  const date=source==="paper" ? read("signed") : today;
  const authorizationSource=source==="paper" ? read("authorizationSource") : null;
  const recorder=source==="online" ? null : read("recorder");
  const foodAnswer=read("foodAnswer"),dietAnswer=read("dietAnswer");
  const food=foodAnswer==="yes" ? read("food") : "",diet=dietAnswer==="yes" ? read("diet") : "",accessibility=read("accessibility");
  if (!eventUuid.test(id) || !eventUuid.test(event) || read("authorization")!=="yes" ||
      !first || !last || first.length>100 || last.length>100 || !contact || contact.length>200 ||
      !["day","overnight"].includes(attendance) || (attendance==="overnight" && !["none","church","group"].includes(rooming ?? "")) ||
      (rooming==="church" && (!church || church.length>150)) || (rooming==="group" && (!code || !/^[A-Z0-9-]{3,30}$/.test(code))) ||
      !dateParts(date) || date>today || (source==="paper" && (!authorizationSource || authorizationSource.length>200)) ||
      (source!=="online" && (!recorder || recorder.length>100)) || food.length>500 || diet.length>500 || accessibility.length>500 ||
      !["none","yes","unknown"].includes(foodAnswer) || !["none","yes","unknown"].includes(dietAnswer) ||
      (foodAnswer==="yes" && !food) || (dietAnswer==="yes" && !diet)) return null;
  return {id,event,first,last,contact,attendance,rooming,church,code,date,authorizationSource,recorder,foodAnswer,dietAnswer,food:food||null,diet:diet||null,accessibility:accessibility||null};
}
