import { notFound } from 'next/navigation';
import { isLocale } from '../../../../lib/copy';
import { getDatabase } from '../../../../lib/database';
import { PublicRegistrationHeader } from '../../public-registration-header';
import { StaffApplicationForm } from './staff-application-form';
import { staffApplicationText as text } from '../../../../lib/staff-application-copy';
import { applicationSeasons } from '../../../../lib/staff-application';
import { currentRole } from '../../../../lib/session';

export const dynamic='force-dynamic';
export const metadata={robots:{index:false,follow:false},referrer:'no-referrer'};
export default async function Apply({params,searchParams}:{params:Promise<{locale:string}>;searchParams:Promise<{id?:string;key?:string;role?:string;step?:string}>}){
  const {locale}=await params;if(!isLocale(locale))notFound();
  const q=await searchParams;
  if(process.env.PDV_LOCAL_DEMO!=='1')notFound();
  const db=await getDatabase(),weeks=(await db.query<{id:number;name:string;start:string;end:string}>("SELECT id,name,starts_on::text start,ends_on::text AS end FROM camp_week WHERE starts_on IS NOT NULL ORDER BY starts_on,id")).rows;
  const query=new URLSearchParams();for(const key of ['id','key','role','step'] as const)if(q[key])query.set(key,q[key]!);
  return <div className="public-registration"><PublicRegistrationHeader><a href={'/'+(locale==='en'?'es':'en')+'/staff/apply?'+query}>{locale==='en'?'Español':'English'}</a></PublicRegistrationHeader><main>
    <h1>{text(locale,'apply')}</h1><p className="notice">{text(locale,'intro')}</p>
    <StaffApplicationForm locale={locale} weeks={weeks} seasons={await applicationSeasons(db)} id={q.id} token={q.key} initialRole={q.role} initialStep={q.step==='service'?1:0} staff={await currentRole()==='leadership'}/>
  </main></div>;
}
