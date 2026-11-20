'use client';
import { useEffect,useRef,useState } from 'react';
import { staffApplicationText } from '../../../lib/staff-application-copy';
import { usePendingFeedback } from '../pending-feedback';
type Document={id:string;category:string;source:string;filename?:string};
export function StaffApplicationDocuments({locale,id,token,revision,staff=false,disabled=false,allowUpload=true,allowedCategories,onBusy,onRevision,onRemoved,onDocuments,refreshKey=0}:{locale:'en'|'es';id:string;token?:string;revision:number;staff?:boolean;disabled?:boolean;allowUpload?:boolean;allowedCategories?:string[];onBusy?:(busy:boolean)=>void;onRevision?:(revision:number)=>void;onRemoved?:()=>void;onDocuments?:(docs:Document[])=>void;refreshKey?:number}){
  const t=(key:string)=>staffApplicationText(locale,key),[docs,setDocs]=useState<Document[]>([]),[busy,setBusy]=useState(false),[message,setMessage]=useState(''),[category,setCategory]=useState(allowedCategories?.[0]??(staff?'reference':'guardian')),[source,setSource]=useState(''),[file,setFile]=useState<File|null>(null),[removing,setRemoving]=useState<string|null>(null);
  const categories=allowedCategories??(staff?['reference','guardian','policy','background','rules']:['guardian','policy','background']);
  const categoryList=categories.join(',');
  useEffect(()=>{if(!categoryList.split(',').includes(category))setCategory(categoryList.split(',')[0]??'');},[categoryList,category]);
  const guard=useRef(false),input=useRef<HTMLInputElement>(null),current=useRef(revision);current.current=revision;usePendingFeedback(busy);
  const endpoint='/api/staff-applications/'+id+'/documents',listUrl=endpoint+(token?'?'+new URLSearchParams({key:token}):'');
  const label=(category:string)=>t(category==='reference'?'referenceDoc':category==='guardian'?'guardianDoc':category==='policy'?'policyDoc':category==='rules'?'campRulesPdf':'background');
  async function refresh(){const response=await fetch(listUrl,{cache:'no-store'});if(!response.ok)throw Error();const result=await response.json();setDocs(result.docs);onDocuments?.(result.docs);onRevision?.(result.revision);}
  useEffect(()=>{let cancelled=false;fetch(listUrl,{cache:'no-store'}).then(async response=>{if(!response.ok)throw Error();return response.json();}).then(result=>{if(!cancelled){setDocs(result.docs);onDocuments?.(result.docs);}}).catch(()=>{if(!cancelled)setMessage('unavailable');});return()=>{cancelled=true;};},[listUrl,refreshKey]);
  const begin=()=>{if(guard.current)return false;guard.current=true;setBusy(true);onBusy?.(true);setMessage('');return true;};
  const end=()=>{guard.current=false;setBusy(false);onBusy?.(false);};
  return <section className="card registration-form"><h3>{t('documents')}</h3><p>{t('uploadHelp')}</p>
    {message&&<p className="notice" role="status">{t(message)}</p>}
    {docs.length?<ul>{docs.map(doc=><li key={doc.id}><strong>{label(doc.category)}</strong>{doc.filename?' · '+doc.filename:''} · {doc.source}{' · '}
      <a download href={endpoint+'?'+new URLSearchParams({file:doc.id,...(token?{key:token}:{})})}>{t('download')}</a>{' · '}
      <button type="button" disabled={busy||disabled} onClick={()=>setRemoving(doc.id)}>{t('removeDocument')}</button>
      {removing===doc.id&&<form onSubmit={async event=>{event.preventDefault();const reason=String(new FormData(event.currentTarget).get('reason')??'').trim();if(!begin())return;try{
        const response=await fetch(endpoint,{method:'DELETE',headers:{'Content-Type':'application/json'},body:JSON.stringify({key:token,file:doc.id,revision:current.current,reason,confirmed:true})});
        const result=await response.json();if(!response.ok){setMessage(result.status??'unavailable');return;}
        setRemoving(null);onRevision?.(result.revision);await refresh();setMessage('documentRemoved');onRemoved?.();
      }catch{setMessage('unavailable');}finally{end();}}}>
        <p className="notice">{t('removeDocumentWarning')}</p><label>{t('removalReason')}<input name="reason" maxLength={2000} disabled={busy||disabled}/></label><div className="actions"><button disabled={busy||disabled}>{t('confirmRemove')}</button><button type="button" disabled={busy||disabled} onClick={()=>setRemoving(null)}>{t('cancel')}</button></div>
      </form>}
    </li>)}</ul>:<p>{t('noDocuments')}</p>}
    {allowUpload&&<form onSubmit={async event=>{event.preventDefault();if(!file||!source.trim()||!begin())return;const form=new FormData();form.set('category',category);form.set('source',source);form.set('file',file);if(token)form.set('key',token);
      try{const response=await fetch(endpoint,{method:'POST',body:form});if(!response.ok){setMessage('unavailable');return;}setFile(null);setSource('');if(input.current)input.current.value='';await refresh();setMessage('documentUploaded');}catch{setMessage('unavailable');}finally{end();}
    }}><fieldset disabled={busy||disabled}><label>{t('category')}<select name="category" value={category} onChange={event=>setCategory(event.target.value)}>{categories.map(category=><option key={category} value={category}>{label(category)}</option>)}</select></label>
      <label>{t('source')} *<input value={source} onChange={event=>setSource(event.target.value)} required maxLength={500}/></label>
      <label>{t('selectDocument')} *<input ref={input} type="file" accept={category==='rules'?'application/pdf':'application/pdf,image/jpeg,image/png'} required onChange={event=>setFile(event.target.files?.[0]??null)}/></label>
      <button disabled={busy||disabled||!file||!source.trim()}>{t('uploadDocument')}</button>
    </fieldset></form>}
  </section>;
}
