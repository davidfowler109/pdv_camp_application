'use client';
import { useRef,useState } from 'react';
import { staffApplicationText } from '../../../lib/staff-application-copy';
export function ApplicationCorrections({locale,canDelete,canWithdraw,staffImpact=false,disabled=false,onAction}:{locale:'en'|'es';canDelete:boolean;canWithdraw:boolean;staffImpact?:boolean;disabled?:boolean;onAction:(operation:string,reason:string)=>Promise<boolean|void>}){
  const t=(key:string)=>staffApplicationText(locale,key),[operation,setOperation]=useState<string|null>(null),[pending,setPending]=useState(false),guard=useRef(false);
  if(!canDelete&&!canWithdraw)return null;
  return <section className="card"><h3>{t('manageApplication')}</h3><div className="actions">
    {canDelete&&<button type="button" disabled={disabled||pending} onClick={()=>setOperation('delete')}>{t('deleteApplication')}</button>}
    {canWithdraw&&<button type="button" disabled={disabled||pending} onClick={()=>setOperation('withdraw')}>{t('withdrawApplication')}</button>}
  </div>{operation&&<form onSubmit={async event=>{event.preventDefault();if(guard.current)return;guard.current=true;setPending(true);const reason=String(new FormData(event.currentTarget).get('reason')??'');try{const result=await onAction(operation,reason);if(result!==false)setOperation(null);}finally{guard.current=false;setPending(false);}}}>
    <p className="notice">{t(operation==='delete'?'deleteWarning':'withdrawWarning')}{operation==='withdraw'&&staffImpact?' '+t('staffImpact'):''}</p>
    {operation==='withdraw'&&<label>{t('withdrawReason')} *<textarea name="reason" required maxLength={2000} disabled={disabled||pending}/></label>}
    <div className="actions"><button disabled={disabled||pending}>{t(operation==='delete'?'confirmDelete':'confirmWithdraw')}</button><button type="button" disabled={disabled||pending} onClick={()=>setOperation(null)}>{t('cancel')}</button></div>
  </form>}</section>;
}
