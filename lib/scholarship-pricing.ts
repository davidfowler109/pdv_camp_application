export type ScholarshipFee={week:number;name:string;fee:number|null};
export function camperCost(fee:number|null,award:number):number|null {
 return fee===null?null:Math.max(0,fee-award);
}
export function awardPreview(input:string):number|null {
 if(!/^\d{1,6}(?:[.,]\d{1,2})?$/.test(input.trim()))return null;
 const [units,cents='']=input.trim().split(/[.,]/);
 return Number(units)*100+Number(cents.padEnd(2,'0'));
}
