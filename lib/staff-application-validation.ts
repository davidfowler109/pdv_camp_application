import {staffScreeningProblems} from './staff-screening.ts';
import {volunteerAgreements} from './volunteer-application.ts';

export function staffStepProblems(step:number,role:string,data:Record<string,string>,adult:boolean) {
 const missing:string[]=[];
 const fields=step===0?['first','last','gender','email','phone','address']:step===1?['experience','skills','motivation','weeks']:step===2?['church','pastor','testimony','referencePermission']:['truth','referencePermission'];
 for(const key of fields)if(!data[key]?.trim()||(['truth','referencePermission'].includes(key)&&data[key]!=='yes'))missing.push(key);
 if(step===1&&role==='volunteer'&&!data.volunteerAreas)missing.push('volunteerAreas');
 if(step===2){
  if(!data.pastorEmail&&!data.pastorPhone)missing.push('pastorContact');
  if(role==='guide'||role==='volunteer')missing.push(...staffScreeningProblems(data,adult));
 }
 if(step===3&&role==='volunteer')missing.push(...volunteerAgreements.filter(item=>data[item.key]!=='yes').map(item=>item.key));
 return [...new Set(missing)];
}
export function staffProblemField(key:string,data:Record<string,string>,initial=false) {
 if(key==='age')return initial?'birth':'weeks';
 if(key==='name')return 'first';
 if(key==='pastorContact')return 'pastorEmail';
 if(key==='campRulesWaiting')return 'campRulesAcknowledgment';
 if(['food','diet','medication','medicationAllergy','accommodation'].includes(key)&&data[key]==='yes'&&!data[key+'Details']?.trim())return key+'Details';
 if(key==='guardianPermission')return !data.guardian?'guardian':!data.guardianRelationship?'guardianRelationship':key;
 return key;
}
export function staffProblemStep(key:string) {
 if(['first','last','name','email','phone','address','gender','birth'].includes(key))return 0;
 if(['weeks','age','volunteerAreas','experience','skills','motivation'].includes(key))return 1;
 if(['truth','volunteerConduct','volunteerBelongings','volunteerAdmission'].includes(key))return 3;
 return 2;
}
