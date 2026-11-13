import Image from "next/image";
import Link from "next/link";
import { StaffNav } from "./staff-nav";
import { campWeekOptions } from "../../lib/camp-week";
import { WeekSelector } from "./week-selector";
import { DateRangeFields } from "./date-range-fields";
import { reviewCopy, formatMoney } from "../../lib/review-copy";
import { registrationCopy } from "../../lib/registration-copy";
import { notFound, redirect } from "next/navigation";
import { campPaymentCopy } from "../../lib/camp-payment-copy";
import { changeLanguage, login, logout, saveDorm, saveWeek } from "./actions";
import { copy, isLocale, type Locale } from "../../lib/copy";
import { getDatabase } from "../../lib/database";
import { facilitiesCopy } from "../../lib/facilities-copy";
import { housingCopy } from "../../lib/housing-copy";
import { availability, camperBedCapacity } from "../../lib/housing";
import { currentRole, roles } from "../../lib/session";

type Week = { id: number; name: string; minimum_age: number; maximum_age: number|null; capacity: number; fee_cents: number | null; early_bird_cents:number|null; early_deadline:string|null; award_limit: number; start: string|null; end: string|null };
type Staff = { id: number; name: string; skills:string[]; active:boolean; adult: boolean; cabin_ids:number[] };
type Dorm = {
  id: number; name: string; building: string; physical_beds: number; usable_beds: number; override_beds: number|null; active:boolean; needs_cleaning:boolean; configured:boolean;
  guest_beds: number; occupants: number; minimum_age: number; maximum_age: number|null; gender_group: "female" | "male" | null;
  in_service: boolean; staff_slots: string[];
};

function DormForm({ locale, week, staff, dorm }: { locale: Locale; week: Week; staff: Staff[]; dorm: Dorm }) {
  const t = copy[locale], h = housingCopy[locale];
  return <form action={saveDorm}>
    <input type="hidden" name="locale" value={locale} />
    <input type="hidden" name="week" value={week.id} />
    <input type="hidden" name="dorm" value={dorm.id} />
    <div className="grid">
      <label>{housingCopy[locale].weeklyBeds}<input type="number" name="usable" min={0} max={dorm.physical_beds} defaultValue={dorm.override_beds ?? ""} /></label>
      <label>{t.guests}<input type="number" name="guests" min={0} max={1000} defaultValue={dorm?.guest_beds ?? 0} required /></label>
      <label>{t.group}<select name="group" defaultValue={dorm?.gender_group ?? ""} required>
        <option value="" disabled>—</option><option value="female">{t.female}</option><option value="male">{t.male}</option>
      </select></label>
      <label>{t.min}<input type="number" name="min" min={7} max={18} defaultValue={dorm?.minimum_age ?? week.minimum_age} required /></label>
      <label><span>{t.max} <small>{h.openAge}</small></span><input type="number" name="max" min={7} max={18} defaultValue={(dorm.configured ? dorm.maximum_age : week.maximum_age) ?? ""} /></label>
    </div>
    <label className="check"><input type="checkbox" name="active" defaultChecked={dorm?.in_service ?? true} />{t.active}</label>
    {(["guide", "equipante"] as const).map(role => <fieldset key={role}>
      <legend>{role === "guide" ? t.guides : t.helpers}</legend>
      {staff.filter(member => dorm.staff_slots.includes(role+":"+member.id) || (member.active && member.cabin_ids.every(id => id === dorm.id) && member.skills.includes(role) && (role === "equipante" || member.adult))).map(member =>
        <label className="check" key={member.id}><input type="checkbox" name="staff" value={role+":"+member.id} defaultChecked={dorm.staff_slots.includes(role+":"+member.id)} />{member.name}</label>
      )}
    </fieldset>)}
    <button>{t.saveDorm}</button>
  </form>;
}

function WeekForm({ locale, week }: { locale:Locale; week?:Week }) {
  const t = copy[locale], h = housingCopy[locale], review = reviewCopy[locale];
  return <form action={saveWeek}>
    <input type="hidden" name="locale" value={locale} />
    {week && <input type="hidden" name="week" value={week.id} />}
    <div className="grid">
      <label>{t.label}<input name="name" defaultValue={week?.name} maxLength={80} required /></label>
      <DateRangeFields key={week?.id ?? "new"} startLabel={h.start} endLabel={h.end}
        start={week?.start ?? ""} end={week?.end ?? ""} required={!week} />
      <label>{t.min}<input name="min" type="number" min={7} max={18} defaultValue={week?.minimum_age} required /></label>
      <label><span>{t.max} <small>{h.openAge}</small></span><input name="max" type="number" min={7} max={18} defaultValue={week?.maximum_age ?? ""} /></label>
      <label>{t.capacity}<input name="capacity" type="number" min={1} max={250} defaultValue={week?.capacity ?? 250} required /></label>
      <label>{review.fee}<input name="fee" inputMode="decimal" defaultValue={((week?.fee_cents ?? 8000)/100).toFixed(2)} required /></label>
      <label>{campPaymentCopy[locale].earlyPrice}<input name="earlyPrice" inputMode="decimal" defaultValue={week?.early_bird_cents == null ? "" : (week.early_bird_cents/100).toFixed(2)} /></label>
      <label>{campPaymentCopy[locale].earlyDeadline}<input name="earlyDeadline" type="date" defaultValue={week?.early_deadline ?? ""} /></label>
      <label>{review.limit}<input id={week ? "scholarship-limit" : undefined} name="awardLimit" type="number" min={0} max={250} defaultValue={week?.award_limit ?? 0} required /></label>
    </div><p className="muted">{campPaymentCopy[locale].earlyHelp}</p><button>{week ? t.saveWeek : h.newWeek}</button>
  </form>;
}

export default async function Page({ params, searchParams }: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ status?: string; week?: string }>;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const { status, week: requestedWeek } = await searchParams;
  const t = copy[locale];
  const role = await currentRole();
  if (role === "health" || role === "kitchen") redirect("/"+locale+"/health");
  const editable = role === "leadership";
  const review = reviewCopy[locale];
  const h = housingCopy[locale];
  let week: Week | undefined;
  let availableWeeks: Week[] = [];
  let dorms: Dorm[] = [];
  let staff: Staff[] = [];

  if (editable || role === "registration") {
    try {
      const db = await getDatabase();
      const weeks = await db.query<Week>("SELECT *,starts_on::text AS start,ends_on::text AS end,early_bird_ends_on::text AS early_deadline FROM camp_week ORDER BY starts_on NULLS LAST,id");
      if (weeks.rows.length) {
        availableWeeks = weeks.rows;
        const selected = availableWeeks.find(item => String(item.id) === requestedWeek) ?? availableWeeks[0];
        const [housing, members] = await Promise.all([
          db.query<Dorm>(`SELECT d.id,d.name,b.name AS building,d.physical_beds,d.active,d.needs_cleaning,(wd.dorm_id IS NOT NULL) AS configured,
            COALESCE(wd.usable_beds,d.default_usable_beds,d.physical_beds) AS usable_beds,wd.usable_beds AS override_beds,
            COALESCE(wd.guest_beds,0) AS guest_beds,
            (SELECT count(*)::integer FROM camper_placement p WHERE p.week_id=$1 AND p.dorm_id=d.id) AS occupants,wd.minimum_age,wd.maximum_age,wd.gender_group,COALESCE(wd.in_service,true) AS in_service,
            ARRAY(SELECT COALESCE(x.assignment_role,s.team_role) || ':' || s.id FROM weekly_dorm_staff x JOIN staff_member s ON s.id=x.staff_id WHERE x.week_id=wd.week_id AND x.dorm_id=d.id ORDER BY s.id) AS staff_slots
            FROM dorm d JOIN building b ON b.id=d.building_id LEFT JOIN weekly_dorm wd ON wd.dorm_id=d.id AND wd.week_id=$1
            WHERE d.room_kind='camper' ORDER BY b.name,d.name`, [selected.id]),
          db.query<Staff>(`SELECT s.id,s.name,s.adult,s.active,COALESCE(s.skills,ARRAY_REMOVE(ARRAY[s.team_role],NULL)) AS skills,
            ARRAY(SELECT x.dorm_id FROM weekly_dorm_staff x WHERE x.week_id=$1 AND x.staff_id=s.id) AS cabin_ids
            FROM staff_member s ORDER BY s.name,s.id`, [selected.id]),
        ]);
        week = selected;
        dorms = housing.rows;
        staff = members.rows;
      }
    } catch (error) {
      console.error("Pilot database unavailable", error instanceof Error ? error.name : "Unknown error");
    }
  }

  return <>
    <header><div>
      <div className="brand"><Image src="/palabra-de-vida.png" width={118} height={54} alt="Palabra de Vida Panamá" /><small>{t.pilot}</small></div>
      <div className="actions">
        <form action={changeLanguage}><input type="hidden" name="locale" value={locale === "es" ? "en" : "es"} />{week && <input type="hidden" name="week" value={week.id} />}<button lang={locale === "es" ? "en" : "es"}>{t.switch}</button></form>
        {role && <form action={logout}><input type="hidden" name="locale" value={locale} /><button>{t.logout}</button></form>}
      </div>
    </div></header>
    <main>
      {(editable || role === "registration") && <StaffNav locale={locale} active="week" week={week?.id} />}
      <h1>{t.title}</h1><p className="muted">{t.subtitle}</p>
      {editable && <section className="card"><details open={!week}><summary>{h.newWeek}</summary><WeekForm locale={locale} /></details></section>}
      {!role && <p><Link href={"/" + locale + "/register"}>{registrationCopy[locale].title}</Link></p>}
      {status === "saved" && <p role="status" className="notice">{t.saved}</p>}
      {status === "facilityConflict" && <p role="alert" className="notice">{facilitiesCopy[locale].weekConflict}</p>}
      {status === "groupConflict" && <p role="alert" className="notice">{h.groupConflict}</p>}
      {status === "invalid" && <p role="alert" className="notice">{t.invalid}</p>}
      {status === "denied" && <p role="alert" className="notice">{t.denied}</p>}
      {status === "unavailable" && <p role="alert" className="notice">{t.unavailable}</p>}
      {!role ? <section className="card">
        <h2>{t.access}</h2>
        {process.env.PDV_LOCAL_DEMO === "1" ? <form action={login}>
          <input type="hidden" name="locale" value={locale} />
          <div className="grid">
            <label>{t.role}<select name="role">{roles.map(item => <option value={item} key={item}>{t[item]}</option>)}</select></label>
            <label>{t.password}<input name="password" type="password" autoComplete="current-password" required /></label>
          </div>
          <button>{t.login}</button>
        </form> : <p>{t.unavailable}</p>}
      </section> : role === "guide" ? <p>{t.denied}</p> : !week ? <p role="alert">{t.unavailable}</p> : <>
        <section className="card">
          <h2>{t.week}</h2>
          {availableWeeks.length > 1 && <WeekSelector key={"week-selector-" + week.id} weeks={campWeekOptions(availableWeeks,locale)}
            selected={week.id} label={t.week} submitLabel={locale === "en" ? "View week" : "Ver semana"} />}
          <p>{week.name} · {t.capacity} {week.capacity} · {review.fee}: {week.fee_cents === null ? review.noFee : formatMoney(week.fee_cents,locale)}</p>
          {!editable ? <p>{t.reader}</p> : <WeekForm key={"week-form-" + week.id} locale={locale} week={week} />}
        </section>
        <h2>{h.weeklyTeam}</h2>
        <div className="dorms">{dorms.map(dorm => {
          const guides = staff.filter(member => member.adult && dorm.staff_slots.includes("guide:"+member.id));
          const helpers = staff.filter(member => dorm.staff_slots.includes("equipante:"+member.id));
          const beds = Math.max(0,camperBedCapacity(dorm.usable_beds, dorm.guest_beds, guides.length) - dorm.occupants);
          const counselorsRequired = week.minimum_age < 18;
          const state = availability(dorm.active && dorm.in_service, beds, guides.length, helpers.length, counselorsRequired);
          const stateLabel = state === "noTeam" && !counselorsRequired ? t.noAdultTeam : t[state];
          return <section className="card" key={dorm.id}>
            <h3>{dorm.name}</h3><p className="muted">{dorm.building} · {dorm.gender_group ? t[dorm.gender_group] + " · " + (dorm.maximum_age === null ? dorm.minimum_age + "+" : dorm.minimum_age + "–" + dorm.maximum_age) : h.unset}</p>
            <span className={state === "ready" && !dorm.needs_cleaning ? "badge" : "badge warn"}>{state !== "closed" && dorm.needs_cleaning ? h.cleaning : stateLabel}</span>
            <p>{t.open}: {beds}<br />{t.usable}: {dorm.usable_beds} · {t.guests}: {dorm.guest_beds}<br />{t.guides}: {guides.map(person => person.name).join(", ") || "—"}<br />{t.helpers}: {helpers.map(person => person.name).join(", ") || "—"}</p>
            {editable && <details><summary>{h.configure}</summary><DormForm key={JSON.stringify(dorm)} locale={locale} week={week!} staff={staff} dorm={dorm} /></details>}
          </section>;
        })}</div>

      </>}
    </main>
  </>;
}
