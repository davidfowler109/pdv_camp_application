"use client";
import {useState} from 'react';
import type {Locale} from '../../../../lib/copy';
import {reviewCopy,formatMoney} from '../../../../lib/review-copy';
import {scholarshipCopy} from '../../../../lib/scholarship-copy';
import {awardPreview,camperCost,type ScholarshipFee} from '../../../../lib/scholarship-pricing';

export function AwardFields({locale,fees}:{locale:Locale;fees:ScholarshipFee[]}) {
 const [value,setValue]=useState(''),t=reviewCopy[locale],s=scholarshipCopy[locale],award=awardPreview(value);
 return <>
  <label>{t.value}<input name="value" inputMode="decimal" required value={value} onChange={e=>setValue(e.target.value)}/></label>
  {fees.map(f=>{
   const amount=award===null?null:camperCost(f.fee,award);
   return <label key={f.week}>{s.camperCost}{fees.length>1?' · '+f.name:''}<input readOnly aria-live="polite" value={f.fee===null?t.noFee:amount===null?'—':formatMoney(amount,locale)}/></label>;
  })}
 </>;
}
