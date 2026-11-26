"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { usePendingFeedback } from "../pending-feedback";

export function FacilitiesMonthPicker({locale,month,today,monthLabel,yearLabel,showPast,showPastLabel,hidePastLabel}:{
  locale:"en"|"es";month:string;today:string;monthLabel:string;yearLabel:string;
  showPast:boolean;showPastLabel:string;hidePastLabel:string;
}) {
  const router = useRouter();
  const [pending,startTransition] = useTransition();
  usePendingFeedback(pending);
  const [year,number] = month.split("-");
  const currentYear = Number(today.slice(0,4));
  const currentMonth = today.slice(0,7);
  const firstYear = showPast ? 2000 : currentYear;
  const lastYear = Math.min(2099,Math.max(currentYear+5,Number(year)));
  const formatter = new Intl.DateTimeFormat(locale,{month:"long",timeZone:"UTC"});
  function go(nextYear:string,nextMonth:string,history=showPast) {
    const selected = nextYear+"-"+nextMonth;
    const target = !history && selected < currentMonth ? currentMonth : selected;
    startTransition(()=>router.push("/"+locale+"/facilities?month="+target+(history ? "&history=1" : ""),{scroll:false}));
  }
  return <div className="facilities-month-picker" aria-busy={pending}>
    <label>{monthLabel}<select aria-label={monthLabel} defaultValue={number} disabled={pending}
      onChange={event=>go(year,event.currentTarget.value)}>
      {Array.from({length:12},(_,index)=>{
        const value = String(index+1).padStart(2,"0");
        return <option key={value} value={value} disabled={!showPast && year+"-"+value < currentMonth}>{formatter.format(Date.UTC(currentYear,index,1))}</option>;
      })}
    </select></label>
    <button type="button" className="secondary" disabled={pending}
      onClick={()=>go(year,number,!showPast)}>{showPast ? hidePastLabel : showPastLabel}</button>
    <label>{yearLabel}<select aria-label={yearLabel} defaultValue={year} disabled={pending}
      onChange={event=>go(event.currentTarget.value,number)}>
      {Array.from({length:lastYear-firstYear+1},(_,index)=>firstYear+index).map(value=>
        <option key={value} value={value}>{value}</option>)}
    </select></label>
  </div>;
}
