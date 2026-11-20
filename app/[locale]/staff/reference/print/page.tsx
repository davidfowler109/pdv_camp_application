import { notFound } from 'next/navigation';
import { isLocale } from '../../../../../lib/copy';
import { staffApplicationText } from '../../../../../lib/staff-application-copy';
import { PublicRegistrationHeader } from '../../../public-registration-header';
import { PastorReference } from '../reference-form';
export const metadata={robots:{index:false,follow:false}};
export default async function PrintReference({params}:{params:Promise<{locale:string}>}){
  const {locale}=await params;if(!isLocale(locale))notFound();
  return <div className="public-registration staff-reference-print"><PublicRegistrationHeader>{null}</PublicRegistrationHeader><main><h1>{staffApplicationText(locale,'referenceTitle')}</h1><p>{staffApplicationText(locale,'referenceIntro')}</p><PastorReference locale={locale} print/></main></div>;
}
