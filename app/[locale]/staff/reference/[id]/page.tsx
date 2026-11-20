import { notFound } from 'next/navigation';
import { isLocale } from '../../../../../lib/copy';
import { getDatabase } from '../../../../../lib/database';
import { applicationId,hasApplicationToken,type StaffApplication } from '../../../../../lib/staff-application';
import { staffApplicationText } from '../../../../../lib/staff-application-copy';
import { PublicRegistrationHeader } from '../../../public-registration-header';
import { PastorReference } from '../reference-form';
export const dynamic='force-dynamic';
export const metadata={robots:{index:false,follow:false},referrer:'no-referrer'};
export default async function Reference({params,searchParams}:{params:Promise<{locale:string;id:string}>;searchParams:Promise<{key?:string}>}){
  const {locale,id}=await params,q=await searchParams;
  if(!isLocale(locale)||!applicationId.test(id)||process.env.PDV_LOCAL_DEMO!=='1')notFound();
  const db=await getDatabase(),app=(await db.query<StaffApplication>('SELECT * FROM staff_application WHERE id=$1',[id])).rows[0];
  if(!app||!hasApplicationToken(app,q.key??'','reference'))notFound();
  const t=(key:string)=>staffApplicationText(locale,key);
  return <div className="public-registration"><PublicRegistrationHeader><a href={'/'+(locale==='en'?'es':'en')+'/staff/reference/'+id+'?'+new URLSearchParams({key:q.key??''})}>{locale==='en'?'Español':'English'}</a></PublicRegistrationHeader><main>
    <h1>{t('referenceTitle')}</h1><p className="notice">{t('intro')}</p><h2>{app.data.first} {app.data.last}</h2><p>{app.season} · {t(app.requested_role)}</p><p>{t('referenceIntro')}</p>
    <PastorReference locale={locale} id={id} token={q.key??''}/>
  </main></div>;
}
