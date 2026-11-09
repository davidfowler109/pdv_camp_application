import { notFound, redirect } from "next/navigation";
import { copy, isLocale } from "../../../lib/copy";
import { checkInCopy } from "../../../lib/check-in-copy";
import { campWeekLabel, listCampWeeks } from "../../../lib/camp-week";
import { getDatabase } from "../../../lib/database";
import { registrationCopy } from "../../../lib/registration-copy";
import { reviewCopy } from "../../../lib/review-copy";
import { currentRole } from "../../../lib/session";
import { changeLanguage, logout } from "../actions";
import { StaffNav } from "../staff-nav";

const categories = ["food", "medicationAllergy", "medication"] as const;
type Category = typeof categories[number];
type Row = { id:string; camper:string; dorm:string|null; place_status:"pending"|"confirmed"; answers:Record<Category, { answer:string|null; details:string|null }> };

export default async function Health({ params, searchParams }: {
  params:Promise<{locale:string}>; searchParams:Promise<{week?:string; category?:string; view?:string; places?:string}>;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const role = await currentRole();
  if (role !== "leadership" && role !== "health" && role !== "kitchen") redirect("/"+locale);
  const kitchen = role === "kitchen";
  const query = await searchParams;
  const selected = categories.find(key => key === query.category);
  const fields = kitchen ? ["food"] as const : selected ? [selected] : categories;
  const includePending = kitchen && query.places === "all";
  const unknown = !kitchen && query.view === "unknown";
  const t = registrationCopy[locale], r = reviewCopy[locale], c = copy[locale], housing = checkInCopy[locale];
  const h = locale === "es" ? {
    title:kitchen ? "Alergias alimentarias" : "Salud de campistas", camper:"Campista", category:"Categoría", all:"Todas las categorías",
    view:"Vista", reported:"Necesidades reportadas", unknown:"Respuestas desconocidas", apply:"Aplicar filtros",
    empty:"No hay campistas que coincidan con esta vista.", kitchenHelp:"Solo se muestran alergias alimentarias reportadas.", confirmedOnly:"Solo confirmados", includePending:"Confirmados y pendientes", emptyKitchen:"No hay alergias alimentarias reportadas para los campistas que coinciden con esta selección.",
  } : {
    title:kitchen ? "Food allergies" : "Camper health", camper:"Camper", category:"Category", all:"All categories",
    view:"View", reported:"Reported needs", unknown:"Unknown answers", apply:"Apply filters",
    empty:"No campers match this view.", kitchenHelp:"This view shows reported food allergies only.", confirmedOnly:"Confirmed only", includePending:"Confirmed and pending", emptyKitchen:"No food allergies have been reported for the campers in this selection.",
  };
  const db = await getDatabase();
  const weeks = await listCampWeeks(db);
  const week = weeks.find(item => String(item.id) === query.week) ?? weeks[0];
  const rows = week ? (await db.query<Row>(
    `SELECT r.id,r.first_name || ' ' || r.last_name AS camper,r.place_status,
      b.name || ' · ' || d.name AS dorm,
      (SELECT jsonb_object_agg(field,jsonb_build_object('answer',r.details->>field,
        'details',CASE WHEN r.details->>field='yes' THEN r.details->>(field || 'Details') END))
       FROM unnest($2::text[]) AS f(field)) AS answers
     FROM registration r
     LEFT JOIN camper_placement p ON p.registration_id=r.id AND p.week_id=r.week_id AND NOT $5::boolean
     LEFT JOIN dorm d ON d.id=p.dorm_id
     LEFT JOIN building b ON b.id=d.building_id
     WHERE r.week_id=$1
     AND r.place_status<>'released' AND (NOT $4::boolean OR r.place_status='confirmed')
     AND EXISTS(SELECT 1 FROM unnest($2::text[]) AS f(field) WHERE r.details->>field=$3)
     ORDER BY lower(r.last_name),lower(r.first_name),r.id`,
    [week.id,fields,unknown ? "unknown" : "yes",kitchen && !includePending,kitchen],
  )).rows : [];

  return <>
    <header><div>
      <div className="brand"><img src="/palabra-de-vida.png" width={118} height={54} alt="Palabra de Vida Panamá" /><small>{c.pilot}</small></div>
      <div className="actions">
        <form action={changeLanguage}>
          <input type="hidden" name="locale" value={locale === "en" ? "es" : "en"} />
          <input type="hidden" name="section" value="health" />
          {week && <input type="hidden" name="week" value={week.id} />}
          <button lang={locale === "en" ? "es" : "en"}>{c.switch}</button>
        </form>
        <form action={logout}><input type="hidden" name="locale" value={locale} /><button>{c.logout}</button></form>
      </div>
    </div></header>
    <main>
      <StaffNav locale={locale} active="health" week={week?.id} />
      <h1>{h.title}</h1>
      <section className="card">
        {kitchen && <p>{h.kitchenHelp}</p>}
        {week && <form method="get" className="roster-filters">
          <div className="grid">
            <label>{t.week}<select name="week" defaultValue={week.id}>{weeks.map(item => <option key={item.id} value={item.id}>{campWeekLabel(item,locale)}</option>)}</select></label>
            {kitchen && <label>{r.place}<select name="places" defaultValue={includePending ? "all" : "confirmed"}>
              <option value="confirmed">{h.confirmedOnly}</option><option value="all">{h.includePending}</option>
            </select></label>}
            {!kitchen && <>
              <label>{h.category}<select name="category" defaultValue={selected ?? ""}><option value="">{h.all}</option>
                {categories.map(key => <option value={key} key={key}>{t[key]}</option>)}
              </select></label>
              <label>{h.view}<select name="view" defaultValue={unknown ? "unknown" : "reported"}>
                <option value="reported">{h.reported}</option><option value="unknown">{h.unknown}</option>
              </select></label>
            </>}
          </div><button>{h.apply}</button>
        </form>}
        {rows.length ? <div className="roster-scroll"><table className="roster-table">
          <thead><tr><th scope="col">{h.camper}</th>{!kitchen && <th scope="col">{housing.dorm}</th>}{(!kitchen || includePending) && <th scope="col">{r.place}</th>}
            {fields.map(key => <th key={key} scope="col">{t[key]}</th>)}</tr></thead>
          <tbody>{rows.map(row => <tr key={row.id}>
            <th scope="row">{row.camper}</th>{!kitchen && <td>{row.dorm ?? housing.unassigned}</td>}{(!kitchen || includePending) && <td>{r[row.place_status]}</td>}
            {fields.map(key => {
              const answer = row.answers[key];
              return <td key={key}>{answer.answer === "yes" ? answer.details || t.yes :
                answer.answer === "unknown" ? t.unknown : answer.answer === "none" ? t.none : "—"}</td>;
            })}
          </tr>)}</tbody>
        </table></div> : <p>{kitchen ? h.emptyKitchen : h.empty}</p>}
      </section>
    </main>
  </>;
}
