// Browser-safe rules requirement and acknowledgment identity.
export const campRulesPreparationFields=['campRulesRequired','campRulesTitle','campRulesRevision','campRulesSource','campRulesUrl','campRulesFile'] as const;
export function campRulesUrlValid(value:string){try{const url=new URL(value);return url.protocol==='https:'&&!url.username&&!url.password;}catch{return false;}}
export function campRulesConfigurationProblems(p:Record<string,string>){
 if(p.campRulesRequired!=='yes')return [];
 const problems:string[]=[];
 if(!p.campRulesTitle?.trim())problems.push('campRulesTitle');
 if(!p.campRulesRevision?.trim())problems.push('campRulesRevision');
 if(p.campRulesSource==='link'){if(!campRulesUrlValid(p.campRulesUrl??''))problems.push('campRulesUrl');}
 else if(p.campRulesSource==='file'){if(!/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(p.campRulesFile??''))problems.push('campRulesFile');}
 else problems.push('campRulesSource');
 return problems;
}
export function campRulesIdentity(p:Record<string,string>){
 if(p.campRulesRequired!=='yes'||campRulesConfigurationProblems(p).length)return '';
 return JSON.stringify([p.campRulesTitle.trim(),p.campRulesRevision.trim(),p.campRulesSource,p.campRulesSource==='file'?p.campRulesFile:p.campRulesUrl]);
}
export function campRulesAcknowledged(p:Record<string,string>,data:Record<string,string>){
 const identity=campRulesIdentity(p);
 return !!identity&&data.campRulesAcknowledgment===identity&&!!data.campRulesAcknowledgedAt&&Number.isFinite(Date.parse(data.campRulesAcknowledgedAt));
}
