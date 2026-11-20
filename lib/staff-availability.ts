import type {Database} from './database.ts';
import {lockWeek} from './review.ts';
import {ageOn} from './registration.ts';
import {weeklyStaffRoles} from './staff-copy.ts';
export type StaffAvailability={staff_id:number;season:number|null;age:number|null;state:'available'|'unavailable'|'unknown';source:'staff'|'application'|'unknown';weeks:number[];revision:number;application:string};
export type AvailabilityOverride={confirmed:boolean;reason:string};
const actor='Camp Leadership (local pilot)';
export async function staffAvailability(db:Database,week:number,ids:number[]|null=null){
  const campWeek=(await db.query<{season:number|null;start:string|null}>('SELECT starts_on::text AS start,EXTRACT(YEAR FROM starts_on)::integer season FROM camp_week WHERE id=$1',[week])).rows[0];
  const season=campWeek?.season??null;
  const rows=(await db.query<{id:number;week_ids:number[]|null;revision:number|null;app_id:string|null;app_revision:number|null;app_weeks:string|null;app_birth:string|null}>(
    `SELECT s.id,p.week_ids,p.revision,a.id AS app_id,a.revision AS app_revision,a.data->>'weeks' AS app_weeks,a.data->>'birth' AS app_birth
      FROM staff_member s LEFT JOIN staff_availability_plan p ON p.staff_id=s.id AND p.season=$1
      LEFT JOIN LATERAL (SELECT id,revision,data FROM staff_application WHERE staff_id=s.id AND season=$1 AND status='approved' AND ready
        ORDER BY submitted_at DESC NULLS LAST,created_at DESC,id DESC LIMIT 1) a ON true
      WHERE ($2::integer[] IS NULL OR s.id=ANY($2::integer[])) ORDER BY s.id`,[season,ids])).rows;
  return new Map(rows.map(row=>{
    const source=row.revision!==null?'staff':row.app_id?'application':'unknown';
    const weeks=row.week_ids??(row.app_weeks??'').split(',').filter(value=>/^\d+$/.test(value)).map(Number);
    const value:StaffAvailability={staff_id:row.id,season,source,weeks,age:row.app_birth&&campWeek?.start?ageOn(row.app_birth,campWeek.start):null,revision:row.revision??0,application:source==='application'?row.app_id+':'+row.app_revision:'',state:source==='unknown'?'unknown':weeks.includes(week)?'available':'unavailable'};
    return [row.id,value] as const;
  }));
}
export function staffRoleEligible(availability:StaffAvailability|undefined,role:string,adult:boolean){
  const age=availability?.age;
  if(role==='guide')return adult&&(age==null||age>=18);
  return role!=='equipante'||age==null||age>=15;
}
export async function saveStaffAvailability(db:Database,input:{staff:number;week:number;weeks:number[];revision:number;application:string;reason:string}){
  const {staff,week,weeks,revision,application}=input,reason=input.reason.trim();
  if(!Number.isInteger(revision)||revision<0||!reason||reason.length>2000||weeks.some(id=>!Number.isSafeInteger(id)||id<1)||new Set(weeks).size!==weeks.length)return 'invalid';
  if(!(await db.query('SELECT id FROM staff_member WHERE id=$1 FOR UPDATE',[staff])).rows.length)return 'invalid';
  const previous=(await staffAvailability(db,week,[staff])).get(staff)!;
  if(previous.season===null)return 'invalid';
  if(previous.revision!==revision||previous.application!==application)return 'stale';
  const valid=(await db.query<{id:number}>('SELECT id FROM camp_week WHERE extract(year FROM starts_on)=$1 AND id=ANY($2::integer[])',[previous.season,weeks])).rows;
  if(valid.length!==weeks.length)return 'invalid';
  const sorted=[...weeks].sort((a,b)=>a-b);
  await db.query(`INSERT INTO staff_availability_plan(staff_id,season,week_ids) VALUES($1,$2,$3::integer[])
    ON CONFLICT(staff_id,season) DO UPDATE SET week_ids=excluded.week_ids,revision=staff_availability_plan.revision+1,updated_at=CURRENT_TIMESTAMP`,[staff,previous.season,sorted]);
  await db.query(`INSERT INTO staff_availability_event(staff_id,season,operation,actor,reason,detail) VALUES($1,$2,'availabilitySaved',$3,$4,$5::jsonb)`,[staff,previous.season,actor,reason,JSON.stringify({previous,resulting:sorted})]);
  return 'saved';
}
export function availabilityOverrideValid(override:AvailabilityOverride){return override.confirmed&&!!override.reason.trim()&&override.reason.trim().length<=2000;}
export async function recordAvailabilityOverrides(db:Database,week:number,people:{availability:StaffAvailability;role:string}[],override:AvailabilityOverride,dorm:number|null=null){
  if(!people.length)return;
  if(!availabilityOverrideValid(override))throw Error('Availability confirmation and reason required');
  for(const person of people)await db.query(`INSERT INTO staff_availability_event(staff_id,season,week_id,dorm_id,assignment_role,operation,actor,reason,detail)
    VALUES($1,$2,$3,$4,$5,'assignmentOverride',$6,$7,$8::jsonb)`,[person.availability.staff_id,person.availability.season,week,dorm,person.role,actor,override.reason.trim(),JSON.stringify({availability:person.availability,confirmed:true})]);
}
export async function assignWeeklyStaff(db:Database,week:number,staff:number,role:string,override:AvailabilityOverride){
  if(!weeklyStaffRoles.some(valid=>valid===role)||!await lockWeek(db,week))return 'invalid';
  if(!(await db.query('SELECT id FROM staff_member WHERE id=$1 AND active AND $2=ANY(COALESCE(skills,ARRAY[team_role])) FOR UPDATE',[staff,role])).rows.length)return 'invalid';
  if((await db.query('SELECT 1 FROM weekly_staff_assignment WHERE week_id=$1 AND staff_id=$2 AND assignment_role=$3',[week,staff,role])).rows.length)return 'saved';
  const availability=(await staffAvailability(db,week,[staff])).get(staff)!;
  if(availability.state!=='available'&&!availabilityOverrideValid(override))return 'availabilityRequired';
  await db.query('INSERT INTO weekly_staff_assignment(week_id,staff_id,assignment_role) VALUES($1,$2,$3)',[week,staff,role]);
  if(availability.state!=='available')await recordAvailabilityOverrides(db,week,[{availability,role}],override);
  return 'saved';
}
