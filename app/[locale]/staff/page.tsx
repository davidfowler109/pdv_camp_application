import { staffAvailability,type StaffAvailability } from "../../../lib/staff-availability";
import { staffAvailabilityCopy } from "../../../lib/staff-availability-copy";
import { AvailabilityOverrideFields } from "./availability-fields";
import { AppForm } from "../app-form";
import Link from "../app-link";
import { notFound, redirect } from "next/navigation";
import { campWeekOptions, listCampWeeks } from "../../../lib/camp-week";
import { getDatabase } from "../../../lib/database";
import { copy, isLocale, type Locale } from "../../../lib/copy";
import { currentRole } from "../../../lib/session";
import { staffCopy, staffSkills, weeklyStaffRoles } from "../../../lib/staff-copy";
import { changeLanguage, logout } from "../actions";
import { StaffNav } from "../staff-nav";
import { WeekSelector } from "../week-selector";
import { saveStaff } from "./actions";
import { staffApplicationText } from "../../../lib/staff-application-copy";

type Staff = {id:number;name:string;adult:boolean;active:boolean;skills:string[];qualifications:string|null};
type WeeklyRole = typeof weeklyStaffRoles[number];
type Assignment = {id:number;name:string;assignment_role:WeeklyRole};
type Cabin = {id:number;staff_id:number;name:string;building:string;staff:string;assignment_role:"guide"};

function MemberForm({ locale, week, member }: {locale:Locale;week?:number;member?:Staff}) {
  const t = staffCopy[locale];
  return <AppForm action={saveStaff}>
    <input name="locale" type="hidden" value={locale} /><input name="operation" type="hidden" value="member" />
    {week && <input name="week" type="hidden" value={week} />}
    {member && <input name="staff" type="hidden" value={member.id} />}
    <div className="grid">
      <label>{t.name}<input name="name" required maxLength={100} defaultValue={member?.name} /></label>
      <label>{t.notes}<input name="notes" maxLength={500} defaultValue={member?.qualifications ?? ""} /></label>
    </div>
    <fieldset><legend>{t.skills}</legend>
      {staffSkills.map(skill => <label className="check" key={skill}>
        <input type="checkbox" name="skill" value={skill} defaultChecked={member?.skills.includes(skill)} />{t[skill]}
      </label>)}
    </fieldset>
    <label className="check"><input type="checkbox" name="adult" defaultChecked={member?.adult ?? false} />{t.adult}</label>
    <label className="check"><input type="checkbox" name="active" defaultChecked={member?.active ?? true} />{t.active}</label>
    <button>{t.save}</button>
  </AppForm>;
}

export default async function StaffPage({ params, searchParams }: {
  params:Promise<{locale:string}>;searchParams:Promise<{week?:string;status?:string}>;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  if (await currentRole() !== "leadership") redirect("/"+locale);
  const { week:requested, status } = await searchParams;
  const t = staffCopy[locale], c = copy[locale];
  const db = await getDatabase();
  const [weeks,members] = await Promise.all([
    listCampWeeks(db),
    db.query<Staff>(`SELECT id,name,adult,active,qualifications,COALESCE(skills,ARRAY_REMOVE(ARRAY[team_role],NULL)) AS skills
      FROM staff_member ORDER BY NOT active,lower(name),id`).then(result => result.rows),
  ]);
  const week = weeks.find(item => String(item.id) === requested) ?? weeks[0];
  const [assigned,cabins] = week ? await Promise.all([
    db.query<Assignment>(`SELECT s.id,s.name,a.assignment_role FROM weekly_staff_assignment a JOIN staff_member s ON s.id=a.staff_id
      WHERE a.week_id=$1 ORDER BY lower(s.name),s.id`,[week.id]).then(result => result.rows),
    db.query<Cabin>(`SELECT d.id,d.name,b.name AS building,s.id AS staff_id,s.name AS staff,COALESCE(x.assignment_role,s.team_role) AS assignment_role
      FROM weekly_dorm_staff x JOIN staff_member s ON s.id=x.staff_id JOIN dorm d ON d.id=x.dorm_id JOIN building b ON b.id=d.building_id
      WHERE x.week_id=$1 AND COALESCE(x.assignment_role,s.team_role)='guide' ORDER BY b.name,d.id,s.name,s.id`,[week.id]).then(result => result.rows),
  ]) : [[],[]];
  const a=staffAvailabilityCopy[locale];
  const availabilityMap=week?await staffAvailability(db,week.id):new Map<number,StaffAvailability>();
  const season=week?.start?Number(week.start.slice(0,4)):null;
  const seasonWeeks=season?weeks.filter(item=>item.start?.startsWith(String(season))):[];
  const availabilityEvents=season?(await db.query<{staff_id:number;operation:'availabilitySaved'|'assignmentOverride';reason:string;date:string}>("SELECT staff_id,operation,reason,to_char(recorded_at AT TIME ZONE 'America/Panama','YYYY-MM-DD HH24:MI') AS date FROM staff_availability_event WHERE season=$1 ORDER BY id DESC LIMIT 2000",[season])).rows:[];
  const messages = {saved:t.saved,invalid:t.invalid,unavailable:t.unavailable,availabilityRequired:a.availabilityRequired,stale:a.stale};
  const groupedCabins = new Map<number,Cabin[]>();
  for (const cabin of cabins) {
    const team = groupedCabins.get(cabin.id) ?? [];
    team.push(cabin);
    groupedCabins.set(cabin.id,team);
  }
  function assignmentForm(role:WeeklyRole, member?:Assignment, outside=false) {
    const available = members.filter(item => item.active && item.skills.includes(role) && (availabilityMap.get(item.id)?.state==='available')!==outside && !assigned.some(a => a.id === item.id && a.assignment_role === role));
    if (!member && !available.length) return null;
    return <AppForm action={saveStaff}>
      <input name="locale" type="hidden" value={locale} /><input name="week" type="hidden" value={week.id} />
      <input name="role" type="hidden" value={role} /><input name="operation" type="hidden" value={member ? "remove" : "assign"} />
      {member ? <input name="staff" type="hidden" value={member.id} /> :
        <label>{t.team}<select name="staff" defaultValue="" required>
          <option value="">—</option>{available.map(item => <option value={item.id} key={item.id}>{item.name}</option>)}
        </select></label>}
      {outside&&<AvailabilityOverrideFields locale={locale as Locale}/>}
      <button>{member ? t.remove : t.assign}</button>
    </AppForm>;
  }

  return <>
    <header><div><div className="brand"><img src="/palabra-de-vida.png" width={118} height={54} alt="Palabra de Vida Panamá" /><small>{c.pilot}</small></div>
      <div className="actions">
        <AppForm action={changeLanguage}><input name="locale" type="hidden" value={locale === "en" ? "es" : "en"} /><input name="section" type="hidden" value="staff" />
          {week && <input name="week" type="hidden" value={week.id} />}<button lang={locale === "en" ? "es" : "en"}>{c.switch}</button></AppForm>
        <AppForm action={logout}><input name="locale" type="hidden" value={locale} /><button>{c.logout}</button></AppForm>
      </div>
    </div></header>
    <main><StaffNav locale={locale} active="staff" week={week?.id} /><h1>{t.title}</h1><p className="muted">{t.access}</p>
      {status && Object.hasOwn(messages,status) && <p className="notice" role={status === "saved" ? "status" : "alert"}>{messages[status as keyof typeof messages]}</p>}
      <section className="card"><h2>{staffApplicationText(locale,'applications')}</h2><p className="actions"><Link className="action-link" href={'/'+locale+'/staff/applications'}>{staffApplicationText(locale,'title')}</Link></p></section>
      <section className="card"><h2>{t.weekly}</h2>
        {week ? <>
          {weeks.length > 1 && <WeekSelector key={week.id} weeks={campWeekOptions(weeks,locale)} selected={week.id} label={t.week} submitLabel={t.view} />}
          <p><strong>{week.name}</strong></p>
          <div className="dorms">{weeklyStaffRoles.map(role => {
            const team = assigned.filter(item => item.assignment_role === role);
            return <section className="card" key={role}><h3>{t[role]}</h3>
              {team.length ? <ul>{team.map(item => <li key={item.id}>{item.name}{availabilityMap.get(item.id)?.state!=='available'&&<span className="badge warn">{a[availabilityMap.get(item.id)?.state??'unknown']}</span>}{assignmentForm(role,item)}</li>)}</ul> : <p>{t.nobody}</p>}
              {assignmentForm(role)??<p>{a.noAvailable}</p>}
              {members.some(item=>item.active&&item.skills.includes(role)&&availabilityMap.get(item.id)?.state!=='available'&&!assigned.some(person=>person.id===item.id&&person.assignment_role===role))&&<details><summary>{a.override}</summary>{assignmentForm(role,undefined,true)}</details>}
            </section>;
          })}</div>
          <details><summary>{t.cabin}</summary><p><Link href={"/"+locale+"?week="+week.id}>{t.setup}</Link></p>
            <ul>{[...groupedCabins.values()].map(team => <li key={team[0].id}><strong>{team[0].building} · {team[0].name}</strong>
              <ul>{team.map(member => <li key={member.staff_id}>{t[member.assignment_role]} · {member.staff}{availabilityMap.get(member.staff_id)?.state!=='available'&&<span className="badge warn">{a[availabilityMap.get(member.staff_id)?.state??'unknown']}</span>}</li>)}</ul>
            </li>)}</ul>
          </details>
        </> : <p>{t.weekRequired}</p>}
      </section>
      <section className="card"><h2>{t.directory}</h2>
        <details><summary>{t.add}</summary><MemberForm locale={locale} week={week?.id} /></details>
        {members.length ? <div className="roster-scroll"><table className="roster-table"><thead><tr>
          <th scope="col">{t.name}</th><th scope="col">{t.skills}</th><th scope="col">{t.active}</th><th scope="col">{a.title}</th>
        </tr></thead><tbody>{members.map(member => <tr key={member.id}>
          <th scope="row">{member.name}</th>
          <td>{member.skills.map(skill => t[skill as typeof staffSkills[number]]).join(", ")}
            <details><summary>{t.edit}</summary><MemberForm key={JSON.stringify(member)} locale={locale} week={week?.id} member={member} /></details>
          </td><td>{member.active ? t.active : t.inactive}</td><td>{a[availabilityMap.get(member.id)?.state??'unknown']}
            {availabilityMap.get(member.id)?.source!=='unknown'&&availabilityMap.get(member.id)&&<p className="muted">{a[availabilityMap.get(member.id)!.source as 'staff'|'application']}</p>}
            {week&&season?<details><summary>{a.edit} · {season}</summary><p>{a.help}</p><AppForm action={saveStaff}>
              <input type="hidden" name="locale" value={locale}/><input type="hidden" name="operation" value="availability"/><input type="hidden" name="staff" value={member.id}/><input type="hidden" name="week" value={week.id}/>
              <input type="hidden" name="availabilityRevision" value={availabilityMap.get(member.id)?.revision??0}/><input type="hidden" name="availabilityApplication" value={availabilityMap.get(member.id)?.application??''}/>
              <fieldset><legend>{a.weeks}</legend>{campWeekOptions(seasonWeeks,locale).map(item=><label className="check" key={item.id}><input type="checkbox" name="availableWeek" value={item.id} defaultChecked={availabilityMap.get(member.id)?.weeks.includes(item.id)??false}/>{item.label}</label>)}</fieldset>
              <label>{a.reason} *<textarea name="availabilityReason" required maxLength={2000}/></label><button>{a.save}</button>
            </AppForm></details>:<p>{a.datesRequired}</p>}
            {availabilityEvents.some(event=>event.staff_id===member.id)&&<details><summary>{a.history}</summary><ul>{availabilityEvents.filter(event=>event.staff_id===member.id).slice(0,8).map((event,index)=><li key={index}>{event.date} · {a[event.operation]} · {event.reason}</li>)}</ul></details>}
          </td>
        </tr>)}</tbody></table></div> : <p>{t.empty}</p>}
      </section>
    </main>
  </>;
}
