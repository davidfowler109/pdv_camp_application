"use client";
import {useEffect,useRef,useState,type ReactNode} from 'react';
import {useRouter} from 'next/navigation';
import {AppForm} from './app-form';
import type {Locale} from '../../lib/copy';
import {copy} from '../../lib/copy';
import {housingCopy} from '../../lib/housing-copy';
import {staffAvailabilityCopy} from '../../lib/staff-availability-copy';
import {facilitiesCopy} from '../../lib/facilities-copy';
import type {DormSaveResult} from '../../lib/dorm-save';

export function DormSaveForm({locale,action,children}:{locale:Locale;action:(form:FormData)=>Promise<DormSaveResult>;children:ReactNode}) {
 const t=copy[locale],h=housingCopy[locale],router=useRouter();
 const [busy,setBusy]=useState(false),[result,setResult]=useState<DormSaveResult|null>(null),[attempt,setAttempt]=useState(0);
 const summary=useRef<HTMLDivElement>(null),formRef=useRef<HTMLFormElement|null>(null),saving=useRef(false);
 const labels:Record<string,string>={usable:h.weeklyBeds,guests:t.guests,group:t.group,min:t.min,max:t.max,staff:t.guides,active:t.active,overrideConfirmed:staffAvailabilityCopy[locale].confirmed,overrideReason:staffAvailabilityCopy[locale].overrideReason};
 const messages:Record<string,string>={saved:h.dormSaved,invalid:h.dormInvalid,denied:t.denied,unavailable:t.unavailable,availabilityRequired:staffAvailabilityCopy[locale].availabilityRequired,facilityConflict:facilitiesCopy[locale].weekConflict,groupConflict:h.groupConflict,bedCapacity:h.bedCapacity,staffInvalid:h.staffInvalid,staffConflict:h.staffConflict,occupiedTeam:h.occupiedTeam};
 const report=(value:DormSaveResult)=>{setResult(value);setAttempt(n=>n+1);};
 useEffect(()=>{
  if(!result)return;
  if(result.status!=='saved'){summary.current?.focus({preventScroll:true});summary.current?.scrollIntoView({block:'center',behavior:'smooth'});}
  formRef.current?.querySelectorAll('[aria-invalid="true"]').forEach(control=>control.removeAttribute('aria-invalid'));
  for(const key of result.problems)formRef.current?.querySelectorAll('[name="'+CSS.escape(key)+'"]').forEach(control=>control.setAttribute('aria-invalid','true'));
 },[attempt,result]);
 const focusField=(name:string)=>{
  const control=formRef.current?.querySelector<HTMLElement>('[name="'+CSS.escape(name)+'"]');if(!control)return;
  for(let parent=control.parentElement;parent;parent=parent.parentElement)if(parent instanceof HTMLDetailsElement)parent.open=true;
  control.focus({preventScroll:true});control.scrollIntoView({block:'center',behavior:'smooth'});
 };
 return <AppForm busy={busy} noValidate onChange={()=>{if(result?.status==='saved')setResult(null);}} onSubmit={event=>{
  event.preventDefault();if(saving.current)return;
  const form=event.currentTarget;formRef.current=form;
  const problems=Array.from(form.elements).flatMap(control=>(control instanceof HTMLInputElement||control instanceof HTMLSelectElement||control instanceof HTMLTextAreaElement)&&control.willValidate&&!control.validity.valid?[control.name]:[]);
  const values=new FormData(form),min=Number(values.get('min')),max=String(values.get('max')??'');
  if((!max&&min!==18)||(max&&Number(max)<min))problems.push('max');
  const exception=!!form.querySelector('input[name="staff"][data-availability-exception="true"]:checked');
  if(exception){if(!values.has('overrideConfirmed'))problems.push('overrideConfirmed');if(!String(values.get('overrideReason')??'').trim())problems.push('overrideReason');}
  if(problems.length){report({status:exception&&problems.every(p=>p.startsWith('override'))?'availabilityRequired':'invalid',problems:[...new Set(problems)]});return;}
  saving.current=true;setBusy(true);setResult(null);
  void action(values).then(response=>{report(response);if(response.status==='saved')router.refresh();}).catch(()=>report({status:'unavailable',problems:[]})).finally(()=>{saving.current=false;setBusy(false);});
 }}>
  {result&&<div ref={summary} role={result.status==='saved'?'status':'alert'} tabIndex={-1} className={result.status==='saved'?'notice':'staff-validation-summary'}>
   {result.status!=='saved'&&<h3>{h.dormNeedsAttention}</h3>}<p>{messages[result.status]}</p>
   {result.problems.length>0&&<ul>{result.problems.map(key=><li key={key}><button type="button" onClick={()=>focusField(key)}>{labels[key]??key}</button></li>)}</ul>}
  </div>}
  {children}
 </AppForm>;
}
