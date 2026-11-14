"use client";

import { startTransition,useActionState,useState } from "react";
import type { Locale } from "../../../lib/copy";
import { eventNoticeVersion,type EventSource } from "../../../lib/event-registration";
import { eventRegistrationCopy } from "../../../lib/event-registration-copy";
import { registerAttendee,type AttendeeResult } from "./registration-actions";

export function AttendeeForm({locale,event,id,source,day,overnight}:{
  locale:Locale;event:string;id:string;source:EventSource;day:boolean;overnight:boolean;
}) {
  const t=eventRegistrationCopy[locale];
  const [result,dispatch,pending]=useActionState<AttendeeResult,FormData>(registerAttendee.bind(null,source),null);
  const [authorized,setAuthorized]=useState(false);
  const [attendance,setAttendance]=useState("");
  const [rooming,setRooming]=useState("");
  const [foodAnswer,setFoodAnswer]=useState("");
  const [dietAnswer,setDietAnswer]=useState("");
  const required=<span className="required-mark" aria-hidden="true"> *</span>;
  const field=(name:string,label:string,max:number,mandatory=true)=>
    <label><span>{label}{mandatory && required}</span><input name={name} maxLength={max} required={mandatory} /></label>;
  const choice=(label:string,options:[string,string][],value:string,setValue:(value:string)=>void,name:string)=>
    <label><span>{label}{required}</span><select name={name} value={value} required onChange={event=>setValue(event.currentTarget.value)}>
      <option value="">—</option>{options.map(([key,text])=><option key={key} value={key}>{text}</option>)}
    </select></label>;
  if (result==="received") return <section className="card"><p role="status">{t.received}</p>
    {source!=="online" && <a href={"/"+locale+"/events/attendees?event="+event+"&entry="+source}>{t.another}</a>}
  </section>;
  return <form action={dispatch} className="registration-form" onSubmit={event=>{
    event.preventDefault();
    if (pending) return;
    const form=new FormData(event.currentTarget);
    startTransition(()=>dispatch(form));
  }}>
    <input type="hidden" name="id" value={id} /><input type="hidden" name="event" value={event} />
    <section className="card">
      <h2>{t.authorization}</h2><p>{t.notice} <small>({eventNoticeVersion})</small></p>
      <label className="check"><input type="checkbox" name="authorization" value="yes" checked={authorized} required
        onChange={event=>setAuthorized(event.currentTarget.checked)} /><span>{source==="paper"?t.paperConsent:t.consent}{required}</span></label>
    </section>
    {authorized && <section className="card">
      <div className="grid">
        {field("first",t.first,100)}{field("last",t.last,100)}{field("contact",t.contact,200)}
        {choice(t.attendance,[...(day ? [["day",t.day] as [string,string]] : []),...(overnight ? [["overnight",t.overnight] as [string,string]] : [])],attendance,setAttendance,"attendance")}
        {attendance==="overnight" && choice(t.preference,[["none",t.noPreference],["church",t.sameChurch],["group",t.group]],rooming,setRooming,"rooming")}
        {attendance==="overnight" && rooming==="church" && field("church",t.church,150)}
        {attendance==="overnight" && rooming==="group" && <label><span>{t.code}{required}</span>
          <input name="code" maxLength={30} pattern={"[A-Za-z0-9\\-]{3,30}"} title={t.codeHelp} required /></label>}
        <div>{choice(t.food,[["none",t.none],["yes",t.yes],["unknown",t.unknown]],foodAnswer,setFoodAnswer,"foodAnswer")}
          {foodAnswer==="yes" && field("food",t.foodDetails,500)}</div>
        <div>{choice(t.diet,[["none",t.none],["yes",t.yes],["unknown",t.unknown]],dietAnswer,setDietAnswer,"dietAnswer")}
          {dietAnswer==="yes" && field("diet",t.dietDetails,500)}</div>
        {field("accessibility",t.accessibility,500,false)}
        {source!=="online" && field("recorder",t.recorder,100)}
        {source==="paper" && <><label><span>{t.signed}{required}</span><input name="signed" type="date" required /></label>{field("authorizationSource",t.source,200)}</>}
      </div>
      {result && <p className="notice" role="alert">{t[result]}</p>}
      <button disabled={pending}>{t.submit}</button>
    </section>}
  </form>;
}
