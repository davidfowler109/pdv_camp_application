import {notFound,redirect} from 'next/navigation';
import Link from '../../app-link';
import {requireReview,ReviewFrame} from '../../intake/review-frame';
import {getDatabase} from '../../../../lib/database';
import {campOverview} from '../../../../lib/camp-overview';
import {campWeekLabel} from '../../../../lib/camp-week';
import {panamaDate} from '../../../../lib/registration';
import {campReviewCopy} from '../../../../lib/camp-review-copy';
import {reviewTarget,targetExists,loadReview,reviewMetrics} from '../../../../lib/camp-reviews';
import {ReviewEditor} from './editor';

export default async function ReviewPage({params,searchParams}:{params:Promise<{locale:string}>;searchParams:Promise<{week?:string;season?:string}>}) {
 const {locale,role}=await requireReview((await params).locale);
 if(role!=='leadership')redirect('/'+locale+'/overview');
 const query=await searchParams,target=reviewTarget(query.week,query.season),t=campReviewCopy[locale];
 if(!target)notFound();
 const db=await getDatabase();if(!await targetExists(db,target))notFound();
 const weeks=await campOverview(db),week=weeks.find(w=>w.id===target.week),season=target.season?String(target.season):week?.start?.slice(0,4)??'undated';
 const sources=target.season?await Promise.all(weeks.filter(w=>w.start?.slice(0,4)===String(target.season)).map(async w=>({week:w.id,label:campWeekLabel(w,locale),record:await loadReview(db,reviewTarget(String(w.id),undefined)!)}))):[];
 const title=target.week?t.weekReview+' · '+campWeekLabel(week!,locale):t.seasonReview+' · '+season;
 return <ReviewFrame locale={locale} section="overview/review" title={title} week={target.week??undefined} season={target.week?undefined:season}>
  <p><Link href={'/'+locale+'/overview?season='+season}>{t.back}</Link>{target.week&&season!=='undated'&&<> · <Link href={'/'+locale+'/overview/review?season='+season}>{t.seasonReview}</Link></>}</p>
  <ReviewEditor key={target.scope} locale={locale} target={target} initial={await loadReview(db,target)} live={await reviewMetrics(db,target)} today={panamaDate()} sources={sources}/>
 </ReviewFrame>;
}
