// Shared adult-applicant screening. Stored field IDs are retained for existing records.
export const staffScreeningVersion='staff-screening-1';
export const staffScreeningFields=['volunteerConviction','volunteerCharges','volunteerRestrictions','volunteerSafeguarding'] as const;
export const staffScreeningQuestions={
  en:{
    volunteerConviction:'Have you ever been convicted of a criminal offense involving abuse, sexual misconduct, violence, or exploitation?',
    volunteerCharges:'Are you currently facing criminal charges involving any of those matters?',
    volunteerRestrictions:'Are you currently subject to a court order or other formal restriction that limits your contact with children or your ability to perform the duties requested?',
    volunteerSafeguarding:'Have you ever been suspended, removed, or asked to leave a job, ministry, or volunteer position because of concerns about your conduct toward children or young people?',
  },
  es:{
    volunteerConviction:'¿Alguna vez has sido condenado por un delito relacionado con abuso, conducta sexual indebida, violencia o explotación?',
    volunteerCharges:'¿Actualmente enfrentas cargos penales relacionados con alguno de esos asuntos?',
    volunteerRestrictions:'¿Actualmente estás sujeto a una orden judicial u otra restricción formal que limite tu contacto con menores o tu capacidad para realizar las funciones solicitadas?',
    volunteerSafeguarding:'¿Alguna vez has sido suspendido, separado o se te ha pedido dejar un empleo, ministerio o puesto de voluntariado por preocupaciones sobre tu conducta hacia niños o jóvenes?',
  },
};

export const staffScreeningDataFields=['believerYears',...staffScreeningFields,...staffScreeningFields.flatMap(key=>[key+'Details',key+'Private'])] as const;
export function staffScreeningProblems(data:Record<string,string>,adultScreening=true){
 const missing:string[]=[];
 if(!/^\d{1,3}$/.test(data.believerYears??'')||Number(data.believerYears)>110)missing.push('believerYears');
 for(const key of adultScreening?staffScreeningFields:[]){
  if(!['yes','no'].includes(data[key]))missing.push(key);
  else if(data[key]==='yes'&&!data[key+'Details']?.trim()&&data[key+'Private']!=='yes')missing.push(key+'Details');
 }
 return missing;
}
export function staffScreeningFollowup(data:Record<string,string>){return staffScreeningFields.some(key=>data[key]==='yes');}
