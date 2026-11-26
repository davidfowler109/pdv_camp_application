import Link from "../../app-link";
import { AppForm } from "../../app-form";
import { RegistrationWeekFilter } from "../week-filter";
import { requireReview, ReviewFrame } from "../review-frame";
import { getDatabase } from "../../../../lib/database";
import { listCampWeeks,campWeekOptions } from "../../../../lib/camp-week";
import { loadCabinPlanning } from "../../../../lib/cabin-planning";
import { cabinPlanningCopy } from "../../../../lib/cabin-planning-copy";
import { panamaDate } from "../../../../lib/registration";

export default async function CabinPlanning({params,searchParams}:{params:Promise<{locale:string}>;searchParams:Promise<{week?:string;from?:string}>}) {
  const {locale,role} = await requireReview((await params).locale);
  const t = cabinPlanningCopy[locale];
  const db = await getDatabase();
  const weeks = await listCampWeeks(db);
  const query = await searchParams;
  const requested = query.week;
  const from = query.from === "week" ? "week" : "registrations";
  const selected = weeks.find(week=>String(week.id)===requested) ?? weeks[0];
  const plan = selected ? await loadCabinPlanning(db,selected.id,panamaDate()) : null;
  const group = (value:string|null)=>value==="female"?t.girls:value==="male"?t.boys:t.unknown;
  const range = (min:number|null,max:number|null)=>min===null?"—":max===null?min+"+":min===max?String(min):min+"–"+max;
  const setup = "/"+locale+(selected ? "?week="+selected.id : "")+"#weekly-dorm-setup";
  const backLink = {href:from==="week"?setup:"/"+locale+"/intake"+(selected?"?week="+selected.id:""),label:from==="week"?t.backWeek:t.backRegistrations};
  return <ReviewFrame locale={locale} section="intake/cabin-planning" title={t.title} week={selected?.id} backLink={backLink} backQuery={from}>
    <p>{t.intro}</p>
    {selected && <AppForm method="get" action={"/"+locale+"/intake/cabin-planning"}>
      <input type="hidden" name="from" value={from}/>
      <RegistrationWeekFilter label={locale==="en"?"Camp week":"Semana de campamento"} selected={selected.id} weeks={campWeekOptions(weeks,locale)} />
      <noscript><button>{locale==="en"?"View":"Ver"}</button></noscript>
    </AppForm>}
    {plan && <>
      <p><Link href={"/"+locale+"?week="+plan.week.id}>{t.setup}</Link> · {t.setting}: <strong>{plan.week.cabin_age_group_size}</strong></p>
      <p className="muted">{t.scope}</p>
      {plan.provisional && <p className="notice" role="status">{t.provisional}</p>}
      <section className="card"><h2>{t.demand}</h2>
        <p className="muted">{t.countsHelp}</p>
        {!plan.entries.length && <p>{t.none}</p>}
        <div className="roster-scroll"><table className="cabin-planning-table"><thead><tr><th>{t.ages}</th><th>{t.group}</th><th>{t.registered}</th><th>{t.confirmed}</th><th>{t.review}</th><th>{t.campers}</th>{role==="leadership"&&<th>{t.configure}</th>}</tr></thead>
          <tbody>{plan.bands.map(band=><tr key={band.min+band.group}>
            <td>{range(band.min,band.max)}</td><td>{group(band.group)}</td><td>{band.members.length}</td><td>{band.confirmed}</td>
            <td>{band.members.filter(camper=>camper.needsReview).length}</td>
            <td>{band.members.length>0 && <details><summary>{t.details} ({band.members.length})</summary><ul className="cabin-planning-campers">{band.members.map(camper=><li key={camper.id}>
              <Link href={"/"+locale+"/intake/"+camper.id}>{camper.name}</Link> · {t.age}: {camper.age}
            </li>)}</ul></details>}</td>
            {role==="leadership"&&<td><Link href={"/"+locale+"?"+new URLSearchParams({week:String(plan.week.id),planningGroup:band.group,planningMin:String(band.min),planningMax:String(band.max)})+"#weekly-dorm-setup"}>{t.configure}</Link></td>}
          </tr>)}</tbody></table></div>
      </section>
      <section className="card"><h2>{t.capacity}</h2><p className="muted">{t.capacityHelp}</p>
        <div className="roster-scroll"><table><thead><tr><th>{t.group}</th><th>{t.registered}</th><th>{t.beds}</th><th>{t.shortfall}</th></tr></thead>
          <tbody>{plan.totals.map(total=><tr key={total.group}><td>{group(total.group)}</td><td>{total.registered}</td><td>{total.beds}</td><td>{total.shortfall>0?<strong className="badge warn">{total.shortfall}</strong>:0}</td></tr>)}</tbody>
        </table></div>
        <p className="muted">{t.shared}</p>
      </section>
      <section className="card"><h2>{t.cabins}</h2><div className="dorms">{plan.rooms.map(room=><article key={room.id}>
        <h3>{room.building} · {room.name}</h3>
        {!room.configured||!room.open?<p className="badge warn">{t.unconfigured}</p>:<>
          <p>{group(room.group)} · {t.range}: {range(room.min,room.max)}<br/>{t.beds}: {room.beds}<br/>{t.leaders}: {room.leaders}</p>
          {room.min!==null&&(room.max===null||room.max-room.min+1>plan.week.cabin_age_group_size)&&<p className="badge warn">{t.wide}</p>}
          {room.leaders<2&&<p className="badge warn">{locale==="en"?"Needs at least two adult Cabin Leaders":"Se requieren al menos dos Guías de Cabañas adultos"}</p>}
          {room.needs_cleaning&&<p className="badge warn">{t.cleaning}</p>}
        </>}
      </article>)}</div></section>
      <section className="card"><h2>{t.exceptions} ({plan.exceptions.length})</h2>
        {plan.exceptions.length?<ul>{plan.exceptions.map(camper=><li key={camper.id}><Link href={"/"+locale+"/intake/"+camper.id}>{camper.name}</Link> · {group(camper.group)} · {t.age}: {camper.age??t.unknown} · {camper.withinWeek?t.noCabin:t.outside}</li>)}</ul>:<p>{t.noExceptions}</p>}
      </section>
    </>}
  </ReviewFrame>;
}
