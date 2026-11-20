'use client';
import { useRef,useState } from 'react';
import { staffApplicationText } from '../../../../lib/staff-application-copy';
import { usePendingFeedback } from '../../pending-feedback';
export function PastorReference({locale,id,token,print=false}:{locale:'en'|'es';id?:string;token?:string;print?:boolean}){
  const t=(key:string)=>staffApplicationText(locale,key),[busy,setBusy]=useState(false),[message,setMessage]=useState(''),guard=useRef(false);usePendingFeedback(busy);
  if(message==='referenceReceived')return <p role="status">{t(message)}</p>;
  return <><form className="registration-form" onSubmit={async e=>{e.preventDefault();if(print||guard.current)return;guard.current=true;setBusy(true);const form=new FormData(e.currentTarget);try{const r=await fetch('/api/staff-applications/reference',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id,key:token,data:Object.fromEntries(form)})});setMessage(r.ok?'referenceReceived':'unavailable');}catch{setMessage('unavailable');}finally{guard.current=false;setBusy(false);}}}><fieldset disabled={busy}>
    {print&&<><label>{t('name')}<input name="applicant"/></label><label>{t('role')}<input name="role"/></label></>}
    {['refName','refContact','refRelationship','refExperience','refReliability','refConcerns'].map(key=><label key={key}>{t(key)} *{['refName','refContact'].includes(key)?<input name={key} required maxLength={1000}/>:<textarea name={key} required maxLength={2000} rows={3}/>}</label>)}
    <label>{t('refRecommend')} *<select name="refRecommend" required defaultValue=""><option value="">—</option>{['yes','no','unknown'].map(value=><option key={value} value={value}>{t(value)}</option>)}</select></label><label>{t('refSignature')} *<input name="refSignature" required maxLength={200}/></label>
    {!print&&<button>{t('submit')}</button>}
  </fieldset></form>{print&&<button className="no-print" onClick={()=>window.print()}>{t('print')}</button>}{message&&<p role="status">{t(message)}</p>}</>;
}
