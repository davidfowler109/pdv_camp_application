import {staffScreeningProblems,staffScreeningFollowup} from '../../../../lib/staff-screening';
import { StaffApplicationFilters } from './roster-filters';
import { staffApplicationStatus,staffApplicationStatuses } from '../../../../lib/staff-application-status';
import { notFound,redirect } from 'next/navigation';
import Link from '../../app-link';
import { ReviewFrame } from '../../intake/review-frame';
import { getDatabase } from '../../../../lib/database';
import { currentRole } from '../../../../lib/session';
import { isLocale } from '../../../../lib/copy';
import { staffApplicationText } from '../../../../lib/staff-application-copy';
import { applicationId,preparationProblems,applicationSeasons,staffApplicationSearchWhere,canDeleteApplication,applicationWeeks,type StaffApplication } from '../../../../lib/staff-application';
import { ageOn } from '../../../../lib/registration';
import { volunteerFollowup,volunteerProblems } from '../../../../lib/volunteer-application';
import { ApplicationReview,SeasonSettings } from './review';
import { RegistrationLink } from '../../church-visits/registration-link';

export const dynamic='force-dynamic';
export const metadata={robots:{index:false,follow:false},referrer:'no-referrer'};
export default async function Applications({params,searchParams}:{params:Promise<{locale:string}>;searchParams:Promise<{id?:string;status?:string;name?:string;season?:string;page?:string;notice?:string}>}){
  const {locale}=await params;if(!isLocale(locale))notFound();if(await currentRole()!=='leadership')redirect('/'+locale);
  const q=await searchParams,t=(key:string)=>staffApplicationText(locale,key),db=await getDatabase();
  const page=Math.max(1,Math.min(100000,Number(q.page)||1)),offset=(page-1)*25;
  const statuses:readonly string[]=staffApplicationStatuses;
  const status=statuses.includes(q.status??'')?q.status:null,season=/^\d{4}$/.test(q.season??'')?Number(q.season):null,name=(q.name??'').slice(0,100);
  const where=staffApplicationSearchWhere;
  const rows=(await db.query<StaffApplication&{first_service_date:string|null}>("SELECT a.*,(SELECT min(w.starts_on)::text FROM camp_week w WHERE w.id::text=ANY(string_to_array(a.data->>'weeks',','))) AS first_service_date FROM staff_application a "+where+" ORDER BY updated_at DESC,id LIMIT 25 OFFSET $4",[status,season,name,offset])).rows;
  const total=Number((await db.query<{n:number}>("SELECT count(*)::integer AS n FROM staff_application "+where,[status,season,name])).rows[0].n);
  const selected=q.id&&applicationId.test(q.id)?(await db.query<StaffApplication>('SELECT * FROM staff_application WHERE id=$1',[q.id])).rows[0]:undefined;
  const firstSelectedWeek=selected?(await applicationWeeks(db,selected.season)).find(week=>(selected.data.weeks??'').split(',').includes(String(week.id))):undefined;
  const members=(await db.query<{id:number;name:string}>('SELECT id,name FROM staff_member ORDER BY lower(name),id')).rows;
  const history=selected?(await db.query<{id:string;operation:string;actor:string;reason:string;date:string}>("SELECT id::text,operation,actor,reason,to_char(recorded_at AT TIME ZONE 'America/Panama','YYYY-MM-DD HH24:MI') AS date FROM staff_application_event WHERE application_id=$1 ORDER BY id DESC LIMIT 50",[selected.id])).rows:[];
  const assignments=selected?.staff_id?(await db.query<{week_id:number;week_name:string;assignment:string}>(`SELECT a.week_id,w.name AS week_name,a.assignment_role AS assignment FROM weekly_staff_assignment a JOIN camp_week w ON w.id=a.week_id WHERE a.staff_id=$1
    UNION ALL SELECT x.week_id,w.name,b.name||' · '||d.name FROM weekly_dorm_staff x JOIN camp_week w ON w.id=x.week_id JOIN dorm d ON d.id=x.dorm_id JOIN building b ON b.id=d.building_id WHERE x.staff_id=$1 ORDER BY week_id,assignment`,[selected.staff_id])).rows:[];
  const safe=selected?{id:selected.id,season:selected.season,role:selected.requested_role,status:selected.status,public_note:selected.public_note,data:selected.data,preparation:selected.preparation,revision:selected.revision,staff_id:selected.staff_id,ready:selected.ready,reference:selected.reference,canDelete:await canDeleteApplication(db,selected,true),staff_review_required:selected.staff_review_required??false,minor:Boolean(firstSelectedWeek&&ageOn(selected.data.birth,firstSelectedWeek.start)!<18)}:null;
  const base='/'+locale+'/staff/applications';
  const pageHref=(next:number)=>base+'?'+new URLSearchParams({...(q.status?{status:q.status}:{}),...(q.season?{season:q.season}:{}),...(name?{name}:{}),page:String(next)});
  return <ReviewFrame locale={locale} section="staff/applications" title={t('title')}>
    {q.notice==='deleted'&&<p className="notice" role="status">{t('deleted')}</p>}
    <p><Link href={'/'+locale+'/staff'}>{t('directory')}</Link></p>
    <section className="card" id="start-application"><h2>{t('startApplication')}</h2><p className="actions">{['guide','equipante','volunteer'].map(role=><Link className="action-link" key={role} href={'/'+locale+'/staff/apply?role='+role}>{t(role)}</Link>)}</p><RegistrationLink locale={locale} path={'/'+locale+'/staff/apply'} label={t('publicLink')}/></section>
    <SeasonSettings locale={locale} seasons={await applicationSeasons(db)}/>
    <section className="card"><StaffApplicationFilters><div className="grid"><label>{t('name')}<input name="name" defaultValue={name}/></label><label>{t('season')}<input name="season" type="number" min={2020} max={2100} defaultValue={season??''}/></label><label>{t('status')}<select name="status" defaultValue={status??''}><option value="">{t('all')}</option>{statuses.map(s=><option key={s} value={s}>{t(s)}</option>)}</select></label></div><button>{t('search')}</button></StaffApplicationFilters>
      {rows.length?<div className="roster-scroll"><table className="roster-table"><thead><tr><th>{t('name')}</th><th>{t('role')}</th><th>{t('season')}</th><th>{t('status')}</th></tr></thead><tbody>{rows.map(app=><tr key={app.id}><th scope="row"><Link href={base+'?id='+app.id+'#application-review'}>{app.data.first} {app.data.last}</Link></th><td>{t(app.requested_role)}</td><td>{app.season}</td><td>{t(staffApplicationStatus(app))}{app.requested_role==='volunteer'&&volunteerFollowup(app.data)&&app.preparation.volunteerScreeningReview!=='yes'&&<div className="notice">{t('screeningFollowup')}</div>}{app.requested_role==='volunteer'&&volunteerProblems(app.data,(ageOn(app.data.birth,app.first_service_date??String(app.season)+'-01-01')??0)>=18).length>0&&<div className="notice">{t('volunteerIncomplete')}</div>}{app.requested_role==='guide'&&!app.ready&&staffScreeningFollowup(app.data)&&app.preparation.guideScreeningReview!=='yes'&&<div className="notice">{t('screeningFollowup')}</div>}{app.requested_role==='guide'&&!app.ready&&staffScreeningProblems(app.data).length>0&&<div className="notice">{t('guideIncomplete')}</div>}{app.staff_review_required&&<div className="notice">{t('needsStaffReview')}</div>}</td></tr>)}</tbody></table></div>:<p>{t('empty')}</p>}
      <div className="actions">{page>1&&<Link href={pageHref(page-1)}>←</Link>}<span>{page} / {Math.max(1,Math.ceil(total/25))} · {total}</span>{page*25<total&&<Link href={pageHref(page+1)}>→</Link>}</div>
    </section>
    {safe&&<section className="card" id="application-review"><ApplicationReview locale={locale} app={safe} members={members} missing={await preparationProblems(db,selected!)} assignments={assignments}/>
      <details><summary>{t('history')}</summary><ul>{history.map(event=><li key={event.id}>{event.date} · {t(event.operation)} · {event.actor} · {event.reason}</li>)}</ul></details>
    </section>}
  </ReviewFrame>;
}
