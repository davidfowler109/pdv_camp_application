import {campReviewCopy} from '../../../lib/camp-review-copy';
import Link from '../app-link';
import {AppForm} from '../app-form';
import {RegistrationWeekFilter} from '../intake/week-filter';
import {requireReview,ReviewFrame} from '../intake/review-frame';
import {getDatabase} from '../../../lib/database';
import {campOverview,overviewSeasons,defaultOverviewSeason} from '../../../lib/camp-overview';
import {campOverviewCopy} from '../../../lib/camp-overview-copy';
import {campWeekLabel} from '../../../lib/camp-week';
import {panamaDate} from '../../../lib/registration';

export default async function Overview({params,searchParams}:{params:Promise<{locale:string}>;searchParams:Promise<{season?:string}>}) {
 const {locale,role}=await requireReview((await params).locale),t=campOverviewCopy[locale];
 const allWeeks=await campOverview(await getDatabase()),today=panamaDate(),seasons=overviewSeasons(allWeeks);
 const requested=(await searchParams).season,season=seasons.find(s=>s===requested)??defaultOverviewSeason(seasons,today);
 const weeks=allWeeks.filter(w=>(w.start?.slice(0,4)??'undated')===season);
 const current=weeks.filter(w=>w.start&&w.end&&w.start<=today&&w.end>=today);
 const sum=(key:'registered'|'confirmed'|'remaining'|'capacity'|'released')=>weeks.reduce((n,w)=>n+w[key],0);
 const attendanceLink=(id:number,key:string,count:number)=><Link href={'/'+locale+'/check-in?'+new URLSearchParams({week:String(id),attendance:key})}>{count}</Link>;
 const registrationLink=(id:number,key:string,count:number)=><Link href={'/'+locale+'/intake?'+new URLSearchParams({week:String(id),place:key})}>{count}</Link>;
 return <ReviewFrame locale={locale} section="overview" title={t.title} season={season}>
  <p>{t.updated}</p><p className="muted">{t.asOf}: <time dateTime={today}>{today}</time></p>
  {!allWeeks.length?<p>{t.empty}</p>:<>
   <section className="card"><AppForm method="get">
    <RegistrationWeekFilter label={t.season} selected={season} weeks={seasons.map(s=>({id:s,label:s==='undated'?t.undated:s}))}/><button>{t.view}</button>
   </AppForm></section>
   <section aria-labelledby="season-totals"><h2 id="season-totals">{t.totals} · {season==='undated'?t.undated:season}</h2>
    {role==='leadership'&&season!=='undated'&&<p><Link className="action-link" href={'/'+locale+'/overview/review?season='+season}>{campReviewCopy[locale].seasonReview}</Link></p>}
    <div className="dorms">{(['registered','confirmed','remaining','capacity','released'] as const).map(key=><section className="card" key={key}><h3>{t[key]}</h3><p><strong>{sum(key)}</strong></p></section>)}</div>
   </section>
   <h2>{t.current}</h2>{!current.length&&<p>{t.noCurrent}</p>}
   {current.map(w=><section className="card" key={w.id}><h3>{campWeekLabel(w,locale)}</h3>
    <h2>{t.atCamp}: {attendanceLink(w.id,'atCamp',w.atCamp)}</h2>
    <p>{t.arrived}: {attendanceLink(w.id,'arrived',w.arrived)} · {t.departed}: {attendanceLink(w.id,'departed',w.departed)} · {t.expected}: {attendanceLink(w.id,'expected',w.expected)}</p>
   </section>)}
   <section className="card"><h2>{t.weeks}</h2><div className="roster-scroll"><table className="roster-table">
    <thead><tr>{(['week','capacity','registered','confirmed','remaining','arrived','atCamp','departed','released'] as const).map(key=><th scope="col" key={key}>{t[key]}</th>)}</tr></thead>
    <tbody>{weeks.map(w=><tr key={w.id}>
     <th scope="row"><Link href={'/'+locale+'?week='+w.id}>{campWeekLabel(w,locale)}</Link>{role==='leadership'&&<p><Link href={'/'+locale+'/overview/review?week='+w.id}>{campReviewCopy[locale].weekReview}</Link></p>}{w.end&&w.end<today&&w.atCamp>0&&<p className="notice">{t.warning} {attendanceLink(w.id,'atCamp',w.atCamp)}</p>}</th>
     <td>{w.capacity}</td><td>{registrationLink(w.id,'active',w.registered)}</td><td>{registrationLink(w.id,'confirmed',w.confirmed)}</td><td>{w.remaining}</td>
     <td>{attendanceLink(w.id,'arrived',w.arrived)}</td><td>{attendanceLink(w.id,'atCamp',w.atCamp)}</td><td>{attendanceLink(w.id,'departed',w.departed)}</td><td>{registrationLink(w.id,'released',w.released)}</td>
    </tr>)}</tbody>
   </table></div></section>
   <section className="card"><p>{t.definitions}</p><p>{t.attendance}</p><p>{t.recorded}</p></section>
  </>}
 </ReviewFrame>;
}
