import type {Locale} from './copy';
import {scholarshipCopy} from './scholarship-copy';
import {formatMoney} from './review-copy';
import {camperCost,type ScholarshipFee} from './scholarship-pricing';

export function scholarshipEmail(locale:Locale,scope:string,issued:{distributor:string;instructions:string|null;expires_on:string|null;fee_snapshot:ScholarshipFee[]|null},codes:{code:string;value_cents:number}[],fallback:ScholarshipFee[]) {
 const s=scholarshipCopy[locale],fees=issued.fee_snapshot??fallback;
 const expiration=issued.expires_on?new Intl.DateTimeFormat(locale==='en'?'en-US':'es-PA',{dateStyle:'long',timeZone:'UTC'}).format(new Date(issued.expires_on+'T00:00:00Z')):null;
 const cost=(fee:number|null,value:number)=>{const amount=camperCost(fee,value);return amount===null?s.costUnknown:formatMoney(amount,locale);};
 const pricing=fees.length===1
  ?codes.map(c=>c.code+' · '+s.camperCost+': '+cost(fees[0].fee,c.value_cents)).join('\r\n')
  :codes.map(c=>c.code+'\r\n'+fees.map(f=>f.name+' · '+s.camperCost+': '+cost(f.fee,c.value_cents)).join('\r\n')).join('\r\n\r\n');
 return [s.greeting(issued.distributor),s.intro(scope),expiration?s.validThrough(expiration):s.noExpiration,s.costHelp,issued.instructions,pricing].filter(Boolean).join('\r\n\r\n');
}
