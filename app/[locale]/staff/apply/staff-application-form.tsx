'use client';
import { useEffect,useRef,useState } from 'react';
import { staffApplicationText } from '../../../../lib/staff-application-copy';
import { usePendingFeedback } from '../../pending-feedback';
import type { ApplicationSeason } from '../../../../lib/staff-application';
import Link from '../../app-link';
import { ApplicationCorrections } from '../application-corrections';
import { StaffApplicationDocuments } from '../application-documents';
import { volunteerAgreements,volunteerScreeningFields,volunteerProblems } from '../../../../lib/volunteer-application';
import {staffScreeningProblems} from '../../../../lib/staff-screening';
import { ageOn } from '../../../../lib/registration';
import {staffStepProblems,staffProblemField,staffProblemStep} from '../../../../lib/staff-application-validation';
type Data=Record<string,string>;
type RecordState={revision:number;status:string;season:number;role:string;ready:boolean;note?:string;requirements?:{reference:boolean;backgroundDocument:boolean;signedPolicy:boolean;policyName:string;training:boolean;campRules?:{required:boolean;title:string;revision:string;source:string;url:string;file:string;identity:string}}};
export function StaffApplicationForm({locale,weeks,seasons,id,token,initialRole,initialStep=0,staff=false}:{locale:'en'|'es';weeks:{id:number;name:string;start:string;end:string}[];seasons:ApplicationSeason[];id?:string;token?:string;initialRole?:string;initialStep?:number;staff?:boolean}){
  const t=(key:string)=>staffApplicationText(locale,key),years=[...new Set(weeks.map(w=>Number(w.start.slice(0,4))))];
  const [season,setSeason]=useState(''),[role,setRole]=useState(initialRole??''),[data,setData]=useState<Data>({}),[record,setRecord]=useState<RecordState|null>(null),[step,setStep]=useState(initialStep),[busy,setBusy]=useState(false),[autosaving,setAutosaving]=useState(false),[autosaveTick,setAutosaveTick]=useState(0),[message,setMessage]=useState(''),[problems,setProblems]=useState<string[]>([]),[loaded,setLoaded]=useState(!id),[savedAt,setSavedAt]=useState(''),[origin,setOrigin]=useState('');
  useEffect(()=>setOrigin(window.location.origin),[]);
  const [deleted,setDeleted]=useState(false);
  const [supplemental,setSupplemental]=useState(false);
  const [editingPreparation,setEditingPreparation]=useState(false);
  const [failure,setFailure]=useState(''),[errorRequest,setErrorRequest]=useState(0),[fieldFocusTick,setFieldFocusTick]=useState(0);
  const errorSummary=useRef<HTMLDivElement>(null),pendingField=useRef<string|null>(null);
  const fail=(status:string,keys:string[])=>{setFailure(status);setProblems([...new Set(keys)]);setErrorRequest(n=>n+1);return false;};
  const hasProblem=(key:string)=>problems.some(problem=>staffProblemField(problem,data,!record)===key);
  function validateCurrent(extra:string[]=[]){
    const form=document.getElementById('staff-application-form') as HTMLFormElement|null;
    const native=Array.from(form?.elements??[]).flatMap(control=>{
      if(!(control instanceof HTMLInputElement||control instanceof HTMLSelectElement||control instanceof HTMLTextAreaElement)||!control.willValidate||control.validity.valid)return [];
      return [control.closest<HTMLElement>('[data-application-field]')?.dataset.applicationField??control.name].filter(Boolean);
    });
    return native.length||extra.length?fail('invalid',[...native,...extra]):true;
  }
  const goToProblem=(key:string)=>{
    pendingField.current=staffProblemField(key,data,!record);
    if(record&&!preparing)setStep(staffProblemStep(key));
    setFieldFocusTick(n=>n+1);
  };
  async function continueStep(){
    if(!validateCurrent(staffStepProblems(step,role,data,serviceAge!==null&&serviceAge>=18)))return;
    if(await save('save'))setStep(step+1);
  }
  const working=useRef<Promise<boolean>|null>(null),manualQueued=useRef(false),dirty=useRef(false),editVersion=useRef(0),revision=useRef<number|undefined>(undefined),latest=useRef({data,record});latest.current={data,record};usePendingFeedback(busy);
  useEffect(()=>{if(!id)return;let cancelled=false;fetch('/api/staff-applications?'+new URLSearchParams({id,key:token??''}),{cache:'no-store'}).then(async response=>{if(!response.ok)throw Error();return response.json();}).then(result=>{if(cancelled)return;dirty.current=false;revision.current=result.revision;setData(result.data);setRecord(result);setSupplemental(['guide','volunteer'].includes(result.role)&&result.status==='approved'&&(result.role==='guide'?staffScreeningProblems(result.data,(ageOn(result.data.birth,weeks.find(w=>(result.data.weeks??'').split(',').includes(String(w.id)))?.start??`${result.season}-01-01`)??0)>=18):volunteerProblems(result.data,(ageOn(result.data.birth,weeks.find(w=>(result.data.weeks??'').split(',').includes(String(w.id)))?.start??`${result.season}-01-01`)??0)>=18)).length>0);setRole(result.role);setSeason(String(result.season));setLoaded(true);}).catch(()=>{if(!cancelled)setMessage('locked');});return()=>{cancelled=true;};},[id,token,weeks]);
  const update=(key:string,value:string)=>{const remaining=problems.filter(problem=>problem!==key&&staffProblemField(problem,data,!record)!==key&&!(problem==='pastorContact'&&['pastorEmail','pastorPhone'].includes(key))&&!(problem==='name'&&['first','last'].includes(key))&&!(key.endsWith('Private')&&problem===key.replace(/Private$/,'Details')));if(remaining.length!==problems.length){setProblems(remaining);if(!remaining.length)setFailure('');}dirty.current=true;editVersion.current++;setData(d=>{const result={...d,[key]:value};for(const field of volunteerScreeningFields){if(key===field&&value!=='yes'){delete result[field+'Details'];delete result[field+'Private'];}if(key===field+'Private'&&value==='yes')delete result[field+'Details'];}return result;});setMessage('');};
  async function save(op:string,quiet=false,advance=true,additional:Record<string,unknown>={}):Promise<boolean>{
    if(!quiet&&['start','submit','submitPreparation'].includes(op)&&!validateCurrent())return false;
    if(working.current){
      if(quiet||manualQueued.current)return false;
      // An explicit Save/Next waits for the background request, then saves
      // the newest answers with the server revision returned by that request.
      manualQueued.current=true;setBusy(true);
      try{if(!await working.current)return fail('unavailable',[]);return await save(op,false,advance,additional);}
      finally{manualQueued.current=false;setBusy(false);}
    }
    const task=(async()=>{
      if(quiet)setAutosaving(true);else{setBusy(true);setMessage('');setProblems([]);setFailure('');}
      const sentVersion=editVersion.current;
      try{
        const current=latest.current;
        const response=await fetch('/api/staff-applications',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({op,id,key:token,revision:revision.current,data:current.data,season:Number(season),role,locale,...additional})});
        const result=await response.json();if(!response.ok){if(!quiet)fail(result.status??'unavailable',result.problems??[]);setMessage(result.status??'unavailable');return false;}
        // New keystrokes during autosave must remain dirty until their own save.
        dirty.current=editVersion.current!==sentVersion;
        if(result.status==='deleted'){dirty.current=false;setDeleted(true);setData({});return true;}
        if(op==='start'){window.location.assign('/'+locale+'/staff/apply?'+new URLSearchParams({id:result.id,key:result.key,...(advance?{step:'service'}:{})}));return true;}
        revision.current=result.revision;
        if(op==='submitPreparation'){setData(result.data);setEditingPreparation(false);}else if(op==='prepare'&&result.data&&!dirty.current)setData(result.data);
        setRecord(r=>r?{...r,revision:result.revision,status:result.applicationStatus??r.status,...(op==='withdraw'?{ready:false}:{})}:r);setSavedAt(new Date().toLocaleTimeString(locale));setMessage('saved');
        if(dirty.current)setAutosaveTick(value=>value+1);
        return true;
      }catch{if(!quiet)fail('unavailable',[]);setMessage('unavailable');return false;}finally{if(quiet)setAutosaving(false);else setBusy(false);}
    })();
    working.current=task;
    try{return await task;}finally{if(working.current===task)working.current=null;}
  }
  useEffect(()=>{if(!record||!dirty.current||!['draft','information','approved'].includes(record.status)||record.ready)return;const timer=setTimeout(()=>void save(record.status==='approved'?'prepare':'save',true),1800);return()=>clearTimeout(timer);/* Only answer changes schedule an autosave. */
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[data,autosaveTick]);
  useEffect(()=>{const warn=(event:BeforeUnloadEvent)=>{if(dirty.current){event.preventDefault();event.returnValue='';}};window.addEventListener('beforeunload',warn);return()=>window.removeEventListener('beforeunload',warn);},[]);
  const confirmationHeading=useRef<HTMLHeadingElement>(null);
  const stepHeading=useRef<HTMLHeadingElement>(null);
  useEffect(()=>{
    if(pendingField.current||!loaded||!record||!['draft','information'].includes(record.status)||!stepHeading.current)return;
    stepHeading.current.focus({preventScroll:true});
    window.scrollTo({top:0,left:0,behavior:'instant'});
  },[step,loaded,record?.status]);
  useEffect(()=>{
    if(errorRequest&&!busy){errorSummary.current?.focus({preventScroll:true});errorSummary.current?.scrollIntoView({block:'start',behavior:'smooth'});}
  },[errorRequest,busy]);
  useEffect(()=>{
    const key=pendingField.current;if(!key)return;pendingField.current=null;
    const wrapper=document.querySelector<HTMLElement>('[data-application-field="'+CSS.escape(key)+'"]');
    if(!wrapper){setFailure('campHelp');return;}
    for(let parent=wrapper.parentElement;parent;parent=parent.parentElement)if(parent instanceof HTMLDetailsElement)parent.open=true;
    const control=wrapper.querySelector<HTMLElement>('input:not([disabled]),select:not([disabled]),textarea:not([disabled])')??wrapper;
    control.focus({preventScroll:true});wrapper.scrollIntoView({block:'center',behavior:'smooth'});
  },[step,fieldFocusTick]);
  useEffect(()=>{
    if(deleted||(record&&(['submitted','review','declined','withdrawn'].includes(record.status)||record.ready||(record.status==='approved'&&data.preparationSubmittedAt&&!editingPreparation)))){
      confirmationHeading.current?.focus();
      confirmationHeading.current?.scrollIntoView({block:'start'});
    }
  },[record?.status,record?.ready,deleted,data.preparationSubmittedAt,editingPreparation]);
  const field=(key:string,type='text',required=false)=> <label key={key} data-application-field={key}><span>{t(key)}{required?' *':''}</span>{type==='textarea'?<textarea name={key} aria-invalid={hasProblem(key)||undefined} maxLength={3000} rows={3} value={data[key]??''} onChange={e=>update(key,e.target.value)} required={required}/>:<input name={key} aria-invalid={hasProblem(key)||undefined} type={type} maxLength={500} min={key==='believerYears'?0:undefined} max={key==='believerYears'?110:undefined} step={key==='believerYears'?1:undefined} value={data[key]??''} onChange={e=>update(key,e.target.value)} required={required}/>}</label>;
  const check=(key:string)=> <label className="check" key={key} data-application-field={key}><input name={key} aria-invalid={hasProblem(key)||undefined} required type="checkbox" checked={data[key]==='yes'} onChange={e=>update(key,e.target.checked?'yes':'')}/>{t(key)}{['sharing','referencePermission','truth','conduct'].includes(key)?' *':''}</label>;
  const list=(key:string,options:string[])=> <label key={key} data-application-field={key}><span>{t(key)} *</span><select name={key} aria-invalid={hasProblem(key)||undefined} required value={data[key]??''} onChange={e=>update(key,e.target.value)}><option value="">—</option>{options.map(value=><option key={value} value={value}>{t(key==='dataAuthority'&&value==='guardian'?'guardianAuthority':value)}</option>)}</select></label>;
  const screening=()=> minor?<p className="notice">{t(role==='guide'?'guideAdultRequired':'minorVolunteerScreening')}</p>:<fieldset><legend>{t(role==='guide'?'guideScreening':'volunteerScreening')}</legend><p>{t('volunteerScreeningHelp')}</p>{volunteerScreeningFields.map(key=><section key={key} className="card">{list(key,['yes','no'])}{data[key]==='yes'&&<><label className="check"><input type="checkbox" checked={data[key+'Private']==='yes'} onChange={event=>update(key+'Private',event.target.checked?'yes':'')}/>{t('privateDiscussion')}</label>{data[key+'Private']!=='yes'&&<label data-application-field={key+'Details'}>{t('briefExplanation')} *<textarea required name={key+'Details'} aria-invalid={hasProblem(key+'Details')||undefined} maxLength={3000} value={data[key+'Details']??''} onChange={event=>update(key+'Details',event.target.value)}/></label>}</>}</section>)}</fieldset>;
  const agreements=()=> <fieldset><legend>{t('volunteerAcknowledgments')}</legend><p>{t('volunteerAcknowledgmentHelp')}</p>{volunteerAgreements.map(item=><label key={item.key} className="check" data-application-field={item.key}><input name={item.key} required aria-invalid={hasProblem(item.key)||undefined} type="checkbox" checked={data[item.key]==='yes'} onChange={event=>update(item.key,event.target.checked?'yes':'')}/>{item[locale]} *</label>)}</fieldset>;
  if(deleted)return <section className="card"><h2 tabIndex={-1} ref={confirmationHeading}>{t('deleted')}</h2><p>{t('deletedNext')}</p>{staff?<Link className="action-link" href={'/'+locale+'/staff/applications'}>{t('backApplications')}</Link>:<a className="action-link" href="https://pdvpanama.com/eventos/" rel="noreferrer">{t('finish')}</a>}</section>;
  if(id&&!loaded)return <p role="status">{message?t(message):t('saving')}</p>;
  const preparing=record?.status==='approved',preparationSent=preparing&&!!data.preparationSubmittedAt&&!editingPreparation,editable=!record||['draft','information'].includes(record.status)||(preparing&&!record.ready),resume=id?'/'+locale+'/staff/apply?'+new URLSearchParams({id,key:token??''}):'';
  const stages=['about','service','faith','reviewAnswers'];
  const settings=seasons.find(s=>s.season===Number(season));
  const firstWeek=weeks.find(week=>(data.weeks??'').split(',').includes(String(week.id))),serviceAge=ageOn(data.birth,firstWeek?.start??String(season)+'-01-01'),minor=serviceAge!==null&&serviceAge<18;
  const requiredUploads=role!=='guide'?[...(minor?['guardian']:[]),...(record?.requirements?.backgroundDocument?['background']:[]),...(record?.requirements?.signedPolicy?['policy']:[])]:undefined;
  const copyReturnLink=async()=>{try{await navigator.clipboard.writeText(window.location.origin+resume);setMessage('copied');}catch{setMessage('copyFailed');}};
  const answer=(key:string,value:string)=>key==='weeks'?weeks.filter(w=>value.split(',').includes(String(w.id))).map(w=>w.name+' · '+w.start+' – '+w.end).join('; '):key==='volunteerAreas'?value.split(',').map(t).join(', '):['yes','no','none','unknown','female','male','self'].includes(value)?t(value):value;
  const corrections=record&&<ApplicationCorrections locale={locale} canDelete={record.status==='draft'} canWithdraw={['submitted','review','information'].includes(record.status)||(staff&&record.status==='approved')} staffImpact={record.status==='approved'} disabled={busy} onAction={(operation,reason)=>save(operation,false,true,{confirmed:true,reason})}/>;
  if(record&&(!editable||preparationSent))return <div className="registration-form staff-confirmation">
    <section className="card" aria-labelledby="staff-confirmation-title">
      <h2 id="staff-confirmation-title" tabIndex={-1} ref={confirmationHeading}>{t(record.status==='withdrawn'?'withdrawn':record.ready?'ready':preparationSent?'preparationReceived':record.status==='submitted'?'submissionTitle':record.status==='review'?'review':'decisionTitle')}</h2>
      <p><strong>{data.first} {data.last}</strong> · {t(role)} · {record.season}</p>
      <p><strong>{t('status')}: {t(record.ready?'ready':preparationSent?'preparationReceived':record.status)}</strong></p>
      <p>{t(record.status==='withdrawn'?'withdrawnNext':record.ready?'readyNext':preparationSent?'preparationNext':record.status==='declined'?'decisionNext':'submissionNext')}</p>
      {message&&!['saved','copied','copyFailed'].includes(message)&&<p role="alert" className="notice">{t(message)}</p>}
      {record.note&&<p className="notice staff-answer">{record.note}</p>}
      <h3>{t('resume')}</h3><p>{t('resumeHelp')}</p>
      <label>{t('resume')}<input readOnly value={origin+resume}/></label><button type="button" onClick={copyReturnLink}>{t('copy')}</button>
      <p className="staff-save-status" role="status">{message==='copied'||message==='copyFailed'?t(message):'\u00a0'}</p>
      {preparationSent&&!record.ready&&<button type="button" onClick={()=>setEditingPreparation(true)}>{t('editPreparation')}</button>}
      <div className="actions">{staff?<Link className="action-link" href={'/'+locale+'/staff/applications?id='+id}>{t('backApplications')}</Link>:<a className="action-link" href="https://pdvpanama.com/eventos/" rel="noreferrer">{t('finish')}</a>}</div>
    </section>
    <details className="card"><summary>{t('viewAnswers')}</summary><dl>{Object.entries(data).filter(([key])=>key!=='campRulesAcknowledgment').map(([key,value])=><div key={key}><dt><strong>{t(key)}</strong></dt><dd className="staff-answer">{answer(key,value)}</dd></div>)}</dl></details>
    {corrections}
  </div>;
  return <div className="registration-form">
    {staff&&<p><Link href={'/'+locale+'/staff/applications'}>{t('backApplications')}</Link></p>}
    {record&&<><h2>{data.first} {data.last}</h2><p>{t(role)} · {record.season}</p><p><strong>{t('status')}: {t(record.ready?'ready':record.status)}</strong></p><details><summary>{t('resume')}</summary><p>{t('resumeHelp')}</p><input aria-label={t('resume')} readOnly value={origin+resume}/><button type="button" onClick={async()=>{try{await navigator.clipboard.writeText(window.location.origin+resume);setMessage('copied');}catch{setMessage('copyFailed');}}}>{t('copy')}</button></details></>}
    <p className="staff-save-status" role="status" aria-live="polite" aria-atomic="true">{autosaving?t('saving'):message&&message!=='saved'?t(message):dirty.current?t('unsaved'):savedAt?t('saved')+' '+savedAt:'\u00a0'}</p>
    {failure&&<div ref={errorSummary} className="staff-validation-summary" role="alert" tabIndex={-1} aria-labelledby="staff-validation-title">
      <h2 id="staff-validation-title">{t('applicationNeedsAttention')}</h2><p>{t(failure)}</p>
      {problems.length>0&&<><p>{t('fixApplicationFields')}</p><ul>{problems.map(key=><li key={key}><button type="button" onClick={()=>goToProblem(key)}>{t(key==='name'?'applicantName':key)}</button>{!preparing&&record&&<span> · {t(stages[staffProblemStep(key)])}</span>}</li>)}</ul></>}
      {problems.includes('age')&&<p>{t('ageHelp')} {record&&t('birthHelp')}</p>}
      {problems.includes('dataAuthority')&&<p>{t('authorityHelp')}</p>}
    </div>}
    {record?.note&&<p className="notice staff-answer">{record.note}</p>}
    {settings&&<details><summary>{t('seasonSettings')}</summary><p>{t(role==='equipante'?'seasonHelp':'seasonDatesHelp')}</p>{role==='equipante'&&<p>{t('fee')}: ${(settings.fee_cents/100).toFixed(2)} · {t('shirtPrice')}: ${(settings.shirt_cents/100).toFixed(2)} · {t('due_on')}: {settings.due_on??'—'}</p>}<p>{t(role==='equipante'?'counselorOrientationSchedule':'trainingCheck')}: {settings.training_start??'—'} – {settings.training_end??'—'} · {t('celebration_on')}: {settings.celebration_on??'—'}</p></details>}
    <form id="staff-application-form" noValidate onSubmit={event=>{event.preventDefault();if(record&&!preparing&&step<3){void continueStep();return;}void save(!record?'start':preparing?'submitPreparation':'submit');}}>
      <fieldset disabled={busy||!editable}>
        {!record?<section className="card"><h2>{t('about')}</h2><div className="grid">
          <label data-application-field="season">{t('season')} *<select name="season" aria-invalid={hasProblem('season')||undefined} required value={season} onChange={e=>setSeason(e.target.value)}><option value="">—</option>{years.map(year=><option key={year}>{year}</option>)}</select></label>
          <label data-application-field="role">{t('role')} *<select name="role" aria-invalid={hasProblem('role')||undefined} required value={role} onChange={e=>setRole(e.target.value)}><option value="">—</option>{['guide','equipante','volunteer'].map(value=><option key={value} value={value}>{t(value)}</option>)}</select></label>
          {field('first','text',true)}{field('last','text',true)}{field('birth','date',true)}{list('gender',['female','male'])}{field('email','email',true)}{field('phone','tel',true)}{field('address','textarea',true)}
          {field('dataSigner','text',true)}{list('dataAuthority',['self','guardian'])}
        </div><p>{t('ageHelp')}</p><p className="muted">{t('birthHelp')}</p>{check('sharing')}
          <div className="actions"><button type="button" disabled={busy} onClick={()=>void save('start',false,false)}>{t('save')}</button><button disabled={busy}>{t('next')}</button></div>
        </section>:preparing?<section className="card"><h2>{t('preparation')}</h2><div className="grid">
          {['food','diet','medication','medicationAllergy','accommodation'].map(key=><div key={key}>{list(key,['none','yes','unknown'])}{data[key]==='yes'&&field(key+'Details','textarea',true)}</div>)}
          {field('emergency','text',true)}{field('emergencyPhone','tel',true)}{list('shirt',['S','M','L','XL','XXL'])}
          {minor&&<>{field('guardian','text',true)}{field('guardianRelationship','text',true)}</>}
        </div>{minor&&check('guardianPermission')}{role==='guide'&&check('conduct')}
          {role==='equipante'&&record?.requirements?.campRules?.required&&<fieldset><legend>{t('campRulesRequired')}</legend><p><strong>{record.requirements.campRules.title}</strong> · {t('campRulesRevision')}: {record.requirements.campRules.revision}</p><p><a target="_blank" rel="noreferrer" href={record.requirements.campRules.source==='link'?record.requirements.campRules.url:'/api/staff-applications/'+id+'/documents?'+new URLSearchParams({file:record.requirements.campRules.file,key:token??''})}>{t('campRulesRead')}</a></p><label className="check" data-application-field="campRulesAcknowledgment"><input name="campRulesAcknowledgment" aria-invalid={hasProblem('campRulesAcknowledgment')||undefined} type="checkbox" required checked={!!record.requirements.campRules.identity&&data.campRulesAcknowledgment===record.requirements.campRules.identity} onChange={event=>update('campRulesAcknowledgment',event.target.checked?record.requirements!.campRules!.identity:'')}/>{t('campRulesConsent')} *</label></fieldset>}
          {supplemental&&<details open><summary>{t(role==='guide'?'guideUpdates':'volunteerUpdates')}</summary>{field('believerYears','number',true)}{screening()}{role==='volunteer'&&agreements()}</details>}
          {role!=='guide'&&<section className="notice"><h3>{t('requestedDocuments')}</h3>{record?.requirements?.reference&&<p>{t('referenceHandledByCamp')}</p>}{record?.requirements?.signedPolicy&&<p>{t('policyDoc')}: {record.requirements.policyName}</p>}{record?.requirements?.backgroundDocument&&<p>{t('background')}</p>}{minor&&<p>{t('guardianDoc')}</p>}{!requiredUploads?.length&&<p>{t(role==='equipante'?'noRequestedCounselorDocuments':'noRequestedDocuments')}</p>}</section>}
          {role==='equipante'&&field('feeAcknowledgment','textarea')}<button type="button" onClick={()=>void save('prepare')}>{t('save')}</button></section>:<>
          <nav className="actions" aria-label={t('apply')}>{stages.map((key,index)=><button type="button" key={key} aria-current={step===index?'step':undefined} onClick={()=>setStep(index)}>{index+1}. {t(key)}</button>)}</nav>
          <section className="card"><h2 ref={stepHeading} tabIndex={-1}>{t(stages[step])}</h2>
            {step===0&&<><div className="grid">{field('first','text',true)}{field('last','text',true)}{list('gender',['female','male'])}{field('email','email',true)}{field('phone','tel',true)}{field('address','textarea',true)}</div><p data-application-field="birth" tabIndex={-1}>{t('birth')}: {data.birth}</p></>}
            {step===1&&<><p>{t('role')}: {t(role)}</p>{role==='volunteer'&&<fieldset data-application-field="volunteerAreas" aria-invalid={hasProblem('volunteerAreas')||undefined}><legend>{t('volunteerAreas')} *</legend>{['health','kitchen','program'].map(area=><label key={area} className="check"><input type="checkbox" checked={(data.volunteerAreas??'').split(',').includes(area)} onChange={e=>update('volunteerAreas',[...(data.volunteerAreas??'').split(',').filter(x=>x&&x!==area),...(e.target.checked?[area]:[])].join(','))}/>{t(area)}</label>)}</fieldset>}
              {field('experience','textarea',true)}{field('skills','textarea',true)}{field('motivation','textarea',true)}
              <fieldset data-application-field="weeks" aria-invalid={hasProblem('weeks')||undefined}><legend>{t('weeks')} *</legend>{weeks.filter(w=>Number(w.start.slice(0,4))===record.season).map(week=><label className="check" key={week.id}><input type="checkbox" checked={(data.weeks??'').split(',').includes(String(week.id))} onChange={e=>update('weeks',[...(data.weeks??'').split(',').filter(x=>x&&x!==String(week.id)),...(e.target.checked?[String(week.id)]:[])].join(','))}/>{week.name} · {week.start} – {week.end}</label>)}</fieldset>
              {field('training','textarea')}{field('celebration','textarea')}
            </>}
            {step===2&&<><div className="grid">{field('church','text',true)}{field('pastor','text',true)}{field('pastorEmail','email')}{field('pastorPhone','tel')}</div>{field('testimony','textarea',true)}{['guide','volunteer'].includes(role)&&<>{field('believerYears','number',true)}{screening()}</>}{check('referencePermission')}</>}
            {step===3&&<><dl>{Object.entries(data).filter(([key])=>!['sharing','dataAuthority','dataSigner','referencePermission','truth','campRulesAcknowledgment'].includes(key)).map(([key,value])=><div key={key}><dt><strong>{t(key)}</strong></dt><dd className="staff-answer">{answer(key,value)}</dd></div>)}</dl>{role==='volunteer'&&agreements()}{check('truth')}{check('referencePermission')}<button>{t('submit')}</button></>}
          </section>
          {editable&&<div className="actions"><button type="button" onClick={()=>void save('save')}>{t('save')}</button>{step>0&&<button type="button" onClick={()=>setStep(step-1)}>{t('back')}</button>}{step<3&&<button type="button" onClick={()=>void continueStep()}>{t('next')}</button>}</div>}
        </>}
      </fieldset>
    </form>
    {preparing&&!record?.ready&&id&&token&&<StaffApplicationDocuments locale={locale} id={id} token={token} revision={record.revision} allowedCategories={requiredUploads} allowUpload={role==='guide'||!!requiredUploads?.length} disabled={busy||autosaving||dirty.current} onBusy={setBusy} onRevision={next=>{if(next>(revision.current??0)){revision.current=next;setRecord(record=>record?{...record,revision:next}:record);}}}/>}
    {preparing&&!record?.ready&&<div className="actions"><button type="submit" form="staff-application-form" disabled={busy}>{t('submitPreparation')}</button></div>}
    {corrections}
  </div>;
}
