'use client';
import {campRulesIdentity,campRulesAcknowledged} from '../../../../lib/camp-rules';
import { useState,useRef,useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { staffApplicationStatus } from '../../../../lib/staff-application-status';
import { staffApplicationText } from '../../../../lib/staff-application-copy';
import { usePendingFeedback } from '../../pending-feedback';
import type { ApplicationSeason } from '../../../../lib/staff-application';
import { ApplicationCorrections } from '../application-corrections';
import { StaffApplicationDocuments } from '../application-documents';
import {staffScreeningProblems} from '../../../../lib/staff-screening';
import { volunteerScreeningFields,volunteerFollowup,volunteerProblems } from '../../../../lib/volunteer-application';
type App={id:string;season:number;role:string;status:string;revision:number;data:Record<string,string>;preparation:Record<string,string>;staff_id:number|null;ready:boolean;public_note:string;reference:Record<string,string>|null;canDelete:boolean;staff_review_required:boolean;minor:boolean};
// Scope local edits and private links to the selected applicant.
export function ApplicationReview(props:Parameters<typeof ApplicationReviewRecord>[0]){
  return <ApplicationReviewRecord key={props.locale+':'+props.app.id} {...props}/>;
}
function ApplicationReviewRecord({locale,app:initialApp,members,missing:initialMissing,assignments}:{locale:'en'|'es';app:App;members:{id:number;name:string}[];missing:string[];assignments:{week_id:number;week_name:string;assignment:string}[]}){
  const router=useRouter();
  const [app,setApp]=useState(initialApp),[missing,setMissing]=useState(initialMissing),[dirty,setDirty]=useState(false),[decision,setDecision]=useState('keep'),[reason,setReason]=useState(initialApp.preparation.reviewNotes??''),[publicNote,setPublicNote]=useState(initialApp.public_note??''),[existing,setExisting]=useState('');
  const [rulesFiles,setRulesFiles]=useState<{id:string;filename?:string}[]>([]),[rulesFile,setRulesFile]=useState<File|null>(null),[rulesUploadVersion,setRulesUploadVersion]=useState(0);
  const rulesInput=useRef<HTMLInputElement>(null);
  const dirtyRef=useRef(false);dirtyRef.current=dirty;
  const t=(key:string)=>staffApplicationText(locale,key),[busy,setBusy]=useState(false),[message,setMessage]=useState(''),[link,setLink]=useState(''),[copyMessage,setCopyMessage]=useState(''),[revision,setRevision]=useState(app.revision),[preparation,setPreparation]=useState(app.preparation);
  const guard=useRef(false);usePendingFeedback(busy);
  useEffect(()=>{
    if(!dirtyRef.current&&initialApp.revision>=revision){setApp(initialApp);setPreparation(initialApp.preparation);setRevision(initialApp.revision);setMissing(initialMissing);setReason(initialApp.preparation.reviewNotes??'');setPublicNote(initialApp.public_note??'');}
  },[initialApp,initialMissing]);
  useEffect(()=>{
    const warn=(event:BeforeUnloadEvent)=>{if(dirtyRef.current){event.preventDefault();event.returnValue='';}};
    const navigate=(event:MouseEvent)=>{const anchor=(event.target as Element)?.closest?.('a');if(!dirtyRef.current||!anchor||anchor.hasAttribute('download')||(anchor.target&&anchor.target!=='_self')||event.ctrlKey||event.metaKey||event.shiftKey||event.altKey)return;
      const next=new URL(anchor.href,location.href);if(next.pathname===location.pathname&&next.search===location.search)return;
      if(!window.confirm(t('unsavedReview'))){event.preventDefault();event.stopImmediatePropagation();}else{dirtyRef.current=false;setDirty(false);}
    };
    window.addEventListener('beforeunload',warn);document.addEventListener('click',navigate,true);
    return()=>{window.removeEventListener('beforeunload',warn);document.removeEventListener('click',navigate,true);};
  },[locale]);
  async function send(op:string,extra:Record<string,unknown>={}){
    if(guard.current)return false;guard.current=true;setBusy(true);setMessage('');try{
      const r=await fetch('/api/staff-applications',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({op,id:app.id,revision,...extra})}),result=await r.json();
      if(!r.ok){setMessage(result.status??'unavailable');if(result.problems?.length)setMissing(result.problems);return false;}
      if(op==='saveReview'){
        setRevision(result.revision);setApp(current=>({...current,...result.application}));setPreparation(result.application.preparation);setReason(result.application.preparation.reviewNotes??'');setPublicNote(result.application.public_note??'');setMissing(result.missing??[]);setDecision('keep');dirtyRef.current=false;setDirty(false);setMessage('reviewSaved');router.refresh();return true;
      }
      if(result.status==='deleted'){window.location.assign('/'+locale+'/staff/applications?notice=deleted');return true;}
      if(result.key){setCopyMessage('');setRevision(result.revision);const path=op==='referenceLink'?'/staff/reference/':'/staff/apply?id=';setLink(window.location.origin+'/'+locale+(op==='referenceLink'?path+app.id+'?key=':path+app.id+'&key=')+result.key);setMessage('saved');}
      else window.location.reload();return true;
    }catch{setMessage('unavailable');return false;}finally{guard.current=false;setBusy(false);}
  }
  async function uploadRules(){
    if(!rulesFile||guard.current)return;guard.current=true;setBusy(true);setMessage('');
    try{
      const endpoint='/api/staff-applications/'+app.id+'/documents',form=new FormData();form.set('category','rules');form.set('source','Camp Leadership supplied camp rules PDF');form.set('file',rulesFile);
      const response=await fetch(endpoint,{method:'POST',body:form});if(!response.ok){setMessage('unavailable');return;}
      const uploaded=await response.json();setRulesFiles(files=>[...files,{id:uploaded.id,filename:rulesFile.name}]);setRulesUploadVersion(value=>value+1);setPreparation(p=>({...p,campRulesFile:uploaded.id}));setRulesFile(null);if(rulesInput.current)rulesInput.current.value='';setDirty(true);setMessage('campRulesPdfUploaded');
    }catch{setMessage('unavailable');}finally{guard.current=false;setBusy(false);}
  }
  const label=(key:string)=>t(({training:'trainingCheck',guardian:'guardianCheck',screeningNotes:app.role==='volunteer'?'volunteerScreeningNotes':app.role==='equipante'?'counselorReviewNotes':'screeningNotes'} as Record<string,string>)[key]??key);
  const checks=[...(app.role==='volunteer'?['volunteerScreeningReview','qualifications']:app.role==='equipante'?['reference','counselorReview','counselorOrientation','qualifications','fees']:['reference','guideScreeningReview','screening','training','policy','qualifications']),
    ...(app.role!=='guide'?[...(app.role==='volunteer'&&preparation.referenceRequired==='yes'?['reference']:[]),...(preparation.backgroundDocumentRequired==='yes'?['screening']:[]),...(preparation.signedPolicyRequired==='yes'?['policy']:[]),...(preparation.trainingRequired==='yes'?['training']:[])]:[]),...(app.minor?['guardian']:[])];
  return <div className="registration-form"><h2>{app.data.first} {app.data.last}</h2><p>{app.season} · {t(app.role)} · <strong>{t(staffApplicationStatus(app))}</strong></p><p>{t('approvalHelp')}</p>{app.data.preparationSubmittedAt&&<p className="notice">{t('preparationReceived')}</p>}
    {message&&<p className="notice" role="status">{t(message)}</p>}
    {app.staff_review_required&&<section className="notice"><p>{t('staffReviewRequired')}</p><p><a href={'/'+locale+'/staff'}>{t('directory')}</a></p><ul>{assignments.map((item,index)=><li key={item.week_id+'-'+index}><a href={'/'+locale+'/staff?week='+item.week_id}>{item.week_name}</a> · {t(item.assignment)}</li>)}</ul><form onSubmit={event=>{event.preventDefault();void send('staffReviewComplete',{reason:new FormData(event.currentTarget).get('reason'),confirmed:true});}}><label>{t('reason')} *<textarea name="reason" required maxLength={2000} disabled={busy||dirty}/></label><button disabled={busy||dirty}>{t('staffReviewComplete')}</button></form></section>}
    <details><summary>{t('reviewAnswers')}</summary><dl>{Object.entries(app.data).filter(([key])=>key!=='campRulesAcknowledgment').map(([key,value])=><div key={key}><dt><strong>{t(key)}</strong></dt><dd className="staff-answer">{value}</dd></div>)}</dl></details>
    {['guide','volunteer'].includes(app.role)&&<section className="card"><h3>{t(app.role==='guide'?'guideScreening':'volunteerScreening')}</h3><p><strong>{t('believerYears')}:</strong> {app.data.believerYears??'—'}</p>{volunteerFollowup(app.data)&&app.preparation[app.role==='guide'?'guideScreeningReview':'volunteerScreeningReview']!=='yes'&&!app.ready&&<p className="notice">{t('screeningFollowup')}</p>}{(app.role==='guide'?staffScreeningProblems(app.data,!app.minor):volunteerProblems(app.data,!app.minor)).length>0&&!app.ready&&<p className="notice">{t(app.role==='guide'?'guideIncomplete':'volunteerIncomplete')}</p>}{app.minor?<p>{t(app.role==='guide'?'guideAdultRequired':'minorVolunteerScreening')}</p>:<dl>{volunteerScreeningFields.map(key=><div key={key}><dt><strong>{t(key)}</strong></dt><dd>{app.data[key]?t(app.data[key]):'—'}{app.data[key]==='yes'&&(app.data[key+'Private']==='yes'?<p className="notice">{t('privateDiscussion')}</p>:<p className="staff-answer">{app.data[key+'Details']}</p>)}</dd></div>)}</dl>}</section>}
    <h3>{t('referenceTitle')}</h3>{app.reference?<dl>{Object.entries(app.reference).map(([key,value])=><div key={key}><dt>{t(key)}</dt><dd className="staff-answer">{value}</dd></div>)}</dl>:<p>{t('referenceSource')}: {app.preparation.referenceSource||'—'}</p>}
    <p><a href={'/'+locale+'/staff/reference/print'} target="_blank" rel="noreferrer">{t('print')}</a></p>
    <p>{t('replaceHelp')}</p><div className="actions"><button disabled={busy||['draft','declined','withdrawn'].includes(app.status)} onClick={()=>void send('referenceLink')}>{t('referenceLink')}</button><button disabled={busy} onClick={()=>void send('resumeLink')}>{t('resumeLink')}</button></div>
    {link&&<><input readOnly aria-label={t('copy')} value={link}/><button disabled={busy} onClick={async()=>{setCopyMessage('');try{await navigator.clipboard.writeText(link);setCopyMessage('copied');}catch{setCopyMessage('copyFailed');}}}>{t('copy')}</button><p className="staff-save-status" role="status" aria-live="polite" aria-atomic="true">{copyMessage?t(copyMessage):'\u00a0'}</p></>}
    {!app.ready&&!['draft','withdrawn'].includes(app.status)&&<form onChange={()=>{setDirty(true);setMessage('');}} onSubmit={e=>{e.preventDefault();void send('saveReview',{preparation,reason,decision,existing,publicNote});}}><fieldset disabled={busy}><h3>{t('checklist')}</h3><p>{t('reviewSaveHelp')}</p>
      {app.role!=='guide'&&<fieldset><legend>{t(app.role==='equipante'?'additionalCounselorRequirements':'additionalVolunteerRequirements')}</legend><p>{t(app.role==='equipante'?'counselorRequirementsHelp':'volunteerRequirementsHelp')}</p>{[...(app.role==='volunteer'?['referenceRequired']:[]),'backgroundDocumentRequired','signedPolicyRequired','trainingRequired'].map(key=><label className="check" key={key}><input type="checkbox" checked={preparation[key]==='yes'} onChange={event=>setPreparation(p=>({...p,[key]:event.target.checked?'yes':''}))}/>{t(key)}</label>)}{preparation.signedPolicyRequired==='yes'&&<label>{t('requiredPolicyName')} *<input required value={preparation.requiredPolicyName??''} onChange={event=>setPreparation(p=>({...p,requiredPolicyName:event.target.value}))} maxLength={2000}/></label>}</fieldset>}
      {app.role==='equipante'&&<fieldset><legend>{t('campRulesRequired')}</legend><label className="check"><input type="checkbox" checked={preparation.campRulesRequired==='yes'} onChange={event=>setPreparation(p=>({...p,campRulesRequired:event.target.checked?'yes':''}))}/>{t('campRulesRequired')}</label><p>{t('campRulesHelp')}</p>
        {preparation.campRulesRequired==='yes'&&<><div className="grid"><label>{t('campRulesTitle')} *<input required maxLength={2000} value={preparation.campRulesTitle??''} onChange={event=>setPreparation(p=>({...p,campRulesTitle:event.target.value}))}/></label><label>{t('campRulesRevision')} *<input required maxLength={2000} value={preparation.campRulesRevision??''} onChange={event=>setPreparation(p=>({...p,campRulesRevision:event.target.value}))}/></label><label>{t('campRulesSource')} *<select required value={preparation.campRulesSource??''} onChange={event=>setPreparation(p=>({...p,campRulesSource:event.target.value}))}><option value="">—</option><option value="link">{t('campRulesLinkOption')}</option><option value="file">{t('campRulesFileOption')}</option></select></label></div>
          {preparation.campRulesSource==='link'&&<label>{t('campRulesUrl')} *<input required type="url" placeholder="https://" maxLength={2000} value={preparation.campRulesUrl??''} onChange={event=>setPreparation(p=>({...p,campRulesUrl:event.target.value}))}/></label>}
          {preparation.campRulesSource==='file'&&<><p>{t('campRulesUploadHelp')}</p><label>{t('campRulesPdf')}<input ref={rulesInput} type="file" accept="application/pdf" onChange={event=>setRulesFile(event.target.files?.[0]??null)}/></label><button type="button" disabled={busy||!rulesFile} onClick={()=>void uploadRules()}>{t('uploadDocument')}</button><label>{t('campRulesFile')} *<select required value={preparation.campRulesFile??''} onChange={event=>setPreparation(p=>({...p,campRulesFile:event.target.value}))}><option value="">—</option>{rulesFiles.map(file=><option key={file.id} value={file.id}>{file.filename||t('campRulesPdf')}</option>)}</select></label></>}
          <p className="notice" role="status">{campRulesIdentity(preparation)!==campRulesIdentity(app.preparation)?t('campRulesSaveFirst'):campRulesAcknowledged(app.preparation,app.data)?t('campRulesAcknowledged')+' · '+app.preparation.campRulesRevision+' · '+app.data.campRulesAcknowledgedAt:t('campRulesWaiting')}</p>
        </>}
      </fieldset>}
      {checks.map(key=><label className="check" key={key}><input type="checkbox" checked={preparation[key]==='yes'} onChange={e=>setPreparation(p=>({...p,[key]:e.target.checked?'yes':''}))}/>{label(key)}</label>)}
      {(app.role!=='volunteer'||preparation.referenceRequired==='yes'?['referenceSource','screeningNotes']:['screeningNotes']).map(key=><label key={key}>{label(key)}<textarea maxLength={2000} value={preparation[key]??''} onChange={e=>setPreparation(p=>({...p,[key]:e.target.value}))}/></label>)}
      {app.status==='approved'&&!app.ready&&missing.length>0&&<p className="notice">{t('incomplete')} {missing.map(label).join(' · ')}</p>}
      <h3>{t('action')}</h3><div className="grid"><label>{t('action')}<select name="operation" value={decision} onChange={event=>setDecision(event.target.value)}><option value="keep">{t('keepStatus')}</option>{(app.status==='approved'?['ready']:app.status==='declined'?['review']:['review','information','approved','declined']).map(op=><option key={op} value={op}>{t(op)}</option>)}</select></label>
      {decision==='approved'&&<label>{t('existing')}<select name="existing" value={existing} onChange={event=>setExisting(event.target.value)}><option value="">{t('newStaff')}</option>{members.map(m=><option key={m.id} value={m.id}>{m.name}</option>)}</select></label>}</div>
      <label>{t('reason')} *<textarea name="reason" required maxLength={2000} value={reason} onChange={event=>setReason(event.target.value)}/></label><label>{t('publicNote')}<textarea name="publicNote" required={decision==='information'} maxLength={2000} value={publicNote} onChange={event=>setPublicNote(event.target.value)}/></label>
      <button>{t('saveReview')}</button><p role="status" aria-live="polite">{message==='reviewSaved'?t('reviewSaved')+' · '+t(staffApplicationStatus(app)):message?t(message):dirty?t('reviewPending'):' '}</p>
      {message==='campRulesWaiting'&&<p className="notice">{t('campRulesWaiting')}</p>}
    </fieldset></form>}
    {app.ready&&app.role==='equipante'&&app.preparation.campRulesRequired==='yes'&&<p className="notice">{t('campRulesAcknowledged')} · {app.preparation.campRulesTitle} · {app.preparation.campRulesRevision} · {app.data.campRulesAcknowledgedAt}</p>}
    {app.ready&&<section className="card"><h3>{t('checklist')}</h3><dl>{Object.entries(app.preparation).filter(([key])=>(key!=='fees'||app.role==='equipante')&&!(app.role==='equipante'&&['counselorRules','counselorRulesName'].includes(key))).map(([key,value])=><div key={key}><dt>{key==='reviewNotes'?t('reason'):label(key)}</dt><dd className="staff-answer">{value==='yes'?t('yes'):value||'—'}</dd></div>)}</dl>{app.public_note&&<><h3>{t('publicNote')}</h3><p className="staff-answer">{app.public_note}</p></>}</section>}
    {app.role!=='guide'&&<p className="notice">{t('optionalVolunteerUploads')}</p>}
    <StaffApplicationDocuments refreshKey={rulesUploadVersion} onDocuments={docs=>setRulesFiles(files=>[...new Map([...files,...docs.filter(doc=>doc.category==='rules')].map(file=>[file.id,file])).values()])} allowedCategories={app.role==='equipante'?undefined:['reference','guardian','policy','background']} locale={locale} id={app.id} revision={revision} staff disabled={busy||dirty} allowUpload={app.status!=='withdrawn'} onBusy={setBusy} onRevision={next=>setRevision(current=>Math.max(current,next))} onRemoved={()=>window.location.reload()}/>
    <ApplicationCorrections locale={locale} canDelete={app.canDelete} canWithdraw={['submitted','review','information','approved','declined'].includes(app.status)} staffImpact={!!app.staff_id} disabled={busy||dirty} onAction={(operation,reason)=>send(operation,{reason,confirmed:true})}/>
  </div>;
}

export function SeasonSettings({locale,seasons}:{locale:'en'|'es';seasons:ApplicationSeason[]}){
  const t=(key:string)=>staffApplicationText(locale,key),[busy,setBusy]=useState(false),[message,setMessage]=useState('');usePendingFeedback(busy);
  const editor=(season?:ApplicationSeason)=><form onSubmit={async e=>{e.preventDefault();if(busy)return;const values=new FormData(e.currentTarget);const body={op:'season',...Object.fromEntries(values),fee_cents:Math.round(Number(values.get('fee'))*100),shirt_cents:Math.round(Number(values.get('shirtPrice'))*100)};setBusy(true);try{const response=await fetch('/api/staff-applications',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});if(response.ok)window.location.reload();else setMessage('invalid');}catch{setMessage('unavailable');}finally{setBusy(false);}}}><fieldset disabled={busy}><p>{t('counselorFeesOnly')}</p><div className="grid"><label>{t('season')} *<input name="season" type="number" min={2020} max={2100} required readOnly={!!season} defaultValue={season?.season}/></label>{['fee','shirtPrice'].map(key=><label key={key}>{t(key)} (USD) *<input name={key} type="number" min={0} max={10000} step="0.01" required defaultValue={((season?.[key==='fee'?'fee_cents':'shirt_cents']??0)/100).toFixed(2)}/></label>)}{(['due_on','training_start','training_end','celebration_on'] as const).map(key=><label key={key}>{t(key)}<input name={key} type="date" defaultValue={season?.[key]??''}/></label>)}</div><button>{t('save')}</button></fieldset></form>;
  return <section className="card"><details><summary>{t('seasonSettings')}</summary>{seasons.map(s=><details key={s.season}><summary>{s.season}</summary>{editor(s)}</details>)}<details><summary>{t('season')}</summary>{editor()}</details>{message&&<p role="status">{t(message)}</p>}</details></section>;
}
