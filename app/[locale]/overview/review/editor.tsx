"use client";

import {useEffect,useRef,useState} from 'react';
import Link from '../../app-link';
import {usePendingFeedback} from '../../pending-feedback';
import type {Locale} from '../../../../lib/copy';
import {campReviewCopy} from '../../../../lib/camp-review-copy';
import {campOverviewCopy} from '../../../../lib/camp-overview-copy';
import {summaryFields,type CampReview,type ReviewBody,type ReviewTarget,type SummaryField} from '../../../../lib/camp-reviews';

export type ReviewSource={week:number;label:string;record:CampReview};
export function ReviewEditor({locale,target,initial,today,sources,live}:{locale:Locale;target:ReviewTarget;initial:CampReview;today:string;sources:ReviewSource[];live:Record<string,number>}) {
 const t=campReviewCopy[locale],o=campOverviewCopy[locale];
 const [record,setRecord]=useState(initial),[body,setBody]=useState<ReviewBody>(initial.body),[actor,setActor]=useState(initial.updated_by),[dirty,setDirty]=useState(false),[busy,setBusy]=useState(false),[message,setMessage]=useState(''),[error,setError]=useState(false),[confirmDelete,setConfirmDelete]=useState(false);
 const dirtyRef=useRef(false);dirtyRef.current=dirty;
 usePendingFeedback(busy);
 useEffect(()=>{
  const unload=(e:BeforeUnloadEvent)=>{if(dirtyRef.current){e.preventDefault();e.returnValue='';}};
  const navigate=(e:MouseEvent)=>{const a=(e.target as Element).closest?.('a');if(dirtyRef.current&&a&&a.target!=='_blank'&&!e.ctrlKey&&!e.metaKey&&a.getAttribute('href')?.startsWith('/')&&!window.confirm(t.unsaved)){e.preventDefault();e.stopImmediatePropagation();}};
  window.addEventListener('beforeunload',unload);document.addEventListener('click',navigate,true);
  return()=>{window.removeEventListener('beforeunload',unload);document.removeEventListener('click',navigate,true);};
 },[t.unsaved]);
 const change=(next:ReviewBody)=>{setBody(next);setDirty(true);};
 const useSummary=(key:SummaryField,text:string)=>{change({...body,summary:{...body.summary,[key]:[body.summary[key],text].filter(Boolean).join('\n\n')}});setError(false);setMessage(t.copied);};
 const locked=record.state==='reviewed';
 async function save(operation:string) {
  if(busy)return;
  setBusy(true);setMessage('');setError(false);
  try{
   const response=await fetch('/api/camp-reviews',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({week:target.week?String(target.week):undefined,season:target.season?String(target.season):undefined,revision:record.revision,operation,actor,body,confirmed:confirmDelete})});
   const result=await response.json();
   if(!response.ok){setError(true);setMessage(t[result.status as 'invalid']??t.unavailable);return;}
   setDirty(false);dirtyRef.current=false;
   if(result.status==='deleted'){window.location.assign('/'+locale+'/overview?'+(target.season?'season='+target.season:''));return;}
   setRecord(result.record);setBody(result.record.body);setMessage(result.status==='reviewed'?t.completed:t.saved);
  }catch{setError(true);setMessage(t.unavailable);}finally{setBusy(false);}
 }
 const metrics=(values:Record<string,number>)=><p>{(['registered','arrived','atCamp','departed'] as const).map((key,i)=><span key={key}>{i?' · ':''}{o[key]}: <strong>{values[key]??0}</strong></span>)}</p>;
 return <>
  <p className="notice">{t.flow}</p><p>{t.privacy}</p>
  <section className="card"><p><strong>{t[record.state]}</strong>{record.reviewed_by&&<> · {t.reviewer}: {record.reviewed_by} · {record.reviewed_at}</>}</p>
   <h3>{t.live}</h3>{metrics(live)}{record.metrics&&<><h3>{t.snapshot}</h3>{metrics(record.metrics)}<p className="muted">{t.snapshotHelp}</p></>}
   {record.updated_at&&<p>{t.updated}: {record.updated_at} · {record.updated_by}</p>}
  </section>
  <p role={error?'alert':'status'} style={{minHeight:'1.5em'}}>{busy?t.busy:message}</p>
  {target.season&&<section className="card"><h2>{t.sources}</h2><p>{t.sourcesHelp}</p>
   {sources.map(source=><details key={source.week}><summary>{source.label} · {source.record.revision?t[source.record.state]:t.noReview} · {source.record.body.notes.length} {t.notes}</summary>
    <p><Link href={'/'+locale+'/overview/review?week='+source.week}>{t.viewWeek}</Link></p>
    {summaryFields.filter(key=>source.record.body.summary[key]).map(key=><section key={key}><h3>{t[key]}</h3><p style={{whiteSpace:'pre-wrap'}}>{source.record.body.summary[key]}</p>{!locked&&<button type="button" disabled={busy} onClick={()=>useSummary(key,source.label+'\n'+source.record.body.summary[key])}>{t.use}</button>}</section>)}
    {source.record.body.notes.map(note=><section key={note.id}><p><strong>{note.date} · {t[note.kind]} · {note.author}</strong></p><p style={{whiteSpace:'pre-wrap'}}>{note.text}</p>{!locked&&<button type="button" disabled={busy} onClick={()=>useSummary(note.kind==='idea'?'changes':note.kind,source.label+' · '+note.date+'\n'+note.text)}>{t.use}</button>}</section>)}
    {!source.record.body.notes.length&&<p>{t.none}</p>}
    {source.record.body.actions.map(action=><p key={action.id}>{action.text} · {action.owner||'—'} · {t[action.state]} {!locked&&action.state==='open'&&<button type="button" disabled={busy} onClick={()=>{change({...body,actions:[...body.actions,{...action,id:crypto.randomUUID(),text:source.label+': '+action.text}]});setError(false);setMessage(t.carried);}}>{t.carry}</button>}</p>)}
   </details>)}
  </section>}
  <form onSubmit={e=>{e.preventDefault();void save('save');}} aria-busy={busy}>
   <fieldset className="pending-fieldset" disabled={busy}>
    <fieldset className="pending-fieldset" disabled={locked}>
     <section className="card"><h2>{target.week?t.notes:t.seasonNotes}</h2>
      {!body.notes.length&&<p>{t.none}</p>}
      {body.notes.map((note,index)=><fieldset key={note.id}><legend>{t.text} {index+1}</legend><div className="grid">
       <label>{t.date}<input type="date" required value={note.date} onChange={e=>change({...body,notes:body.notes.map(n=>n.id===note.id?{...n,date:e.target.value}:n)})}/></label>
       <label>{t.kind}<select value={note.kind} onChange={e=>change({...body,notes:body.notes.map(n=>n.id===note.id?{...n,kind:e.target.value as typeof note.kind}:n)})}>{(['worked','improve','idea'] as const).map(kind=><option key={kind} value={kind}>{t[kind]}</option>)}</select></label>
       <label>{t.author}<input required maxLength={100} value={note.author} onChange={e=>change({...body,notes:body.notes.map(n=>n.id===note.id?{...n,author:e.target.value}:n)})}/></label>
      </div><label>{t.text}<textarea required maxLength={4000} value={note.text} onChange={e=>change({...body,notes:body.notes.map(n=>n.id===note.id?{...n,text:e.target.value}:n)})}/></label>
       {!locked&&<div className="actions"><button type="button" onClick={()=>useSummary(note.kind==='idea'?'changes':note.kind,note.date+' · '+note.author+'\n'+note.text)}>{t.use}</button><button type="button" onClick={()=>change({...body,notes:body.notes.filter(n=>n.id!==note.id)})}>{t.remove}</button></div>}
      </fieldset>)}
      {!locked&&<button type="button" disabled={body.notes.length>=100} onClick={()=>change({...body,notes:[...body.notes,{id:crypto.randomUUID(),date:today,kind:'worked',text:'',author:actor}]})}>{t.addNote}</button>}
     </section>
     <section className="card"><h2>{t.summary}</h2><p>{t.summaryHelp}</p>{summaryFields.map(key=><label key={key}>{t[key]}<textarea maxLength={8000} rows={4} value={body.summary[key]} onChange={e=>change({...body,summary:{...body.summary,[key]:e.target.value}})}/></label>)}</section>
     <section className="card"><h2>{t.actions}</h2>{!body.actions.length&&<p>{t.noActions}</p>}
      {body.actions.map(action=><fieldset key={action.id}><div className="grid"><label>{t.action}<textarea required maxLength={2000} value={action.text} onChange={e=>change({...body,actions:body.actions.map(a=>a.id===action.id?{...a,text:e.target.value}:a)})}/></label>
       <label>{t.owner}<input maxLength={100} value={action.owner} onChange={e=>change({...body,actions:body.actions.map(a=>a.id===action.id?{...a,owner:e.target.value}:a)})}/></label>
       <label>{t.action}<select value={action.state} onChange={e=>change({...body,actions:body.actions.map(a=>a.id===action.id?{...a,state:e.target.value as 'open'|'done'}:a)})}><option value="open">{t.open}</option><option value="done">{t.done}</option></select></label></div>
       {!locked&&<button type="button" onClick={()=>change({...body,actions:body.actions.filter(a=>a.id!==action.id)})}>{t.remove}</button>}
      </fieldset>)}
      {!locked&&<button type="button" disabled={body.actions.length>=100} onClick={()=>change({...body,actions:[...body.actions,{id:crypto.randomUUID(),text:'',owner:'',state:'open'}]})}>{t.addAction}</button>}
     </section>
    </fieldset>
    <section className="card"><label>{t.actor}<input required maxLength={100} value={actor} onChange={e=>{setActor(e.target.value);setDirty(true);}}/></label>
     <div className="actions">{locked?<button type="button" onClick={()=>void save('reopen')}>{t.reopen}</button>:<><button type="submit">{t.save}</button><button type="button" onClick={e=>{if(e.currentTarget.form?.reportValidity())void save('review');}}>{t.complete}</button></>}</div>
    </section>
   </fieldset>
  </form>
  {!locked&&record.revision>0&&<details><summary>{t.delete}</summary><label className="check"><input type="checkbox" checked={confirmDelete} onChange={e=>setConfirmDelete(e.target.checked)}/>{t.confirmDelete}</label><button type="button" disabled={busy||!confirmDelete} onClick={()=>void save('delete')}>{t.delete}</button></details>}
 </>;
}
