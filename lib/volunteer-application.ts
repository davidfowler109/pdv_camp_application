import {staffScreeningVersion,staffScreeningFields,staffScreeningQuestions,staffScreeningDataFields,staffScreeningProblems,staffScreeningFollowup} from './staff-screening.ts';
// Compatibility exports preserve existing Volunteer application records and callers.
export const volunteerScreeningVersion=staffScreeningVersion;
export const volunteerScreeningFields=staffScreeningFields;
export const volunteerScreeningQuestions=staffScreeningQuestions;
export const volunteerAgreementVersion='volunteer-agreements-1';
export const volunteerAgreements=[
  {key:'volunteerConduct',en:'Within the Foundation’s premises, the consumption of any type of alcoholic beverage is strictly prohibited, as well as the use and/or smoking of cigarettes — whether chemical, electronic, or natural — and any consumption of toxic substances. It is also completely forbidden to bring in any sharp objects or firearms.',es:'Dentro de las instalaciones de la Fundación está totalmente prohibida la ingesta de cualquier tipo de bebida alcohólica, así como consumir o fumar cigarrillos de composición química, electrónica o natural, y el consumo de sustancias tóxicas. Está completamente prohibido el ingreso de elementos cortopunzantes o armas de fuego.'},
  {key:'volunteerBelongings',en:'The Foundation is NOT responsible in case of theft, robbery, or loss of any personal belongings of the volunteer team member or visitor.',es:'La Fundación NO se hace responsable en caso de robo, hurto o extravío de cualquier pertenencia personal del integrante voluntario o visitante.'},
  {key:'volunteerAdmission',en:'If any of the points stated here are not followed, the FOUNDATION reserves the right of admission and permanence, thereby terminating the volunteer team member’s stay at the activity.',es:'De no cumplir con alguno de los puntos aquí expuestos, la FUNDACIÓN se reserva el derecho de admisión y permanencia, dando por finalizada la estadía del integrante voluntario en la actividad.'},
] as const;
export const volunteerFields=[...staffScreeningDataFields,...volunteerAgreements.map(item=>item.key)] as const;
export function volunteerProblems(data:Record<string,string>,adultScreening=true){
 return [...staffScreeningProblems(data,adultScreening),...volunteerAgreements.filter(item=>data[item.key]!=='yes').map(item=>item.key)];
}
export const volunteerFollowup=staffScreeningFollowup;
