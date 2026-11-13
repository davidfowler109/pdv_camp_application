import type { Locale } from "../../../../lib/copy";
import type { Budget } from "../../../../lib/visit-itinerary";
import { visitItineraryCopy } from "../../../../lib/visit-itinerary-copy";

export function CostTable({locale,lines}: {locale:Locale;lines:Budget["lines"]}) {
  const t=visitItineraryCopy[locale];
  const money=(cents:number) => new Intl.NumberFormat(locale,{style:"currency",currency:"USD"}).format(cents/100);
  if (!lines.length) return <p>{t.noCosts}</p>;
  return <div className="roster-scroll"><table className="roster-table"><thead><tr>
    <th scope="col">{t.description}</th><th scope="col">{t.payer}</th><th scope="col">{t.basis}</th><th scope="col">{t.quantityUsed}</th><th scope="col">{t.price}</th><th scope="col">{t.lineTotal}</th>
  </tr></thead><tbody>{lines.map(line => <tr key={line.id}>
    <th scope="row">{line.description}{line.meal && <div className="muted">{t[line.meal]} · {line.meal_source==="camp" ? t.mealCamp : line.meal_source==="packed" ? t.packed : t.outside}</div>}</th>
    <td>{t[line.payer]}</td><td>{t[line.basis]}</td><td>{line.quantity}</td>
    <td>{line.unit_cents===null ? t.unknown : line.unit_cents===0 ? t.free : money(line.unit_cents)}</td><td>{line.total===null ? t.unknown : money(line.total)}</td>
  </tr>)}</tbody></table></div>;
}

export function BudgetSummary({locale,budget,countBasis,extra,shareGroupCosts}: {locale:Locale;budget:Budget;countBasis:"expected"|"registered";extra:number;shareGroupCosts:boolean}) {
  const t=visitItineraryCopy[locale];
  const money=(cents:number) => new Intl.NumberFormat(locale,{style:"currency",currency:"USD"}).format(cents/100);
  if (!budget.lines.length && extra===0) return <section className="card estimate-summary"><h2>{t.summary}</h2>
    <p>{t.currentCounts} · {t[countBasis]} · {t.total} {budget.count}</p><p>{t.noCosts}</p>
  </section>;
  return <section className="card estimate-summary"><h2>{t.summary}</h2>
    <p>{t.currentCounts} · {t[countBasis]} · {t.total} {budget.count}</p>
    <p className={budget.incomplete ? "notice" : "muted"}>{budget.incomplete ? t.known : t.complete}</p>
    <dl><dt>{t.campTotal}</dt><dd>{money(budget.totals.camp)}</dd><dt>{t.churchTotal}</dt><dd>{money(budget.totals.church)}</dd>
      <dt>{t.personalTotal}</dt><dd>{money(budget.totals.personal)}</dd><dt>{t.extra}</dt><dd>{money(extra)}</dd>
      <dt><strong>{t.tripTotal}</strong></dt><dd><strong>{money(budget.totals.camp+budget.totals.church+budget.totals.personal+extra*budget.count)}</strong></dd></dl>
    <h3>{t.allowances}</h3><p>{t.allowanceHelp}</p><p>{shareGroupCosts ? t.sharesIncluded : t.sharesExcluded}</p>{budget.customCounts && <p className="notice">{t.customCounts}</p>}
    {budget.allowances.length ? <div className="roster-scroll"><table className="roster-table"><thead><tr><th scope="col">{t.role}</th><th scope="col">{t.count}</th><th scope="col">{t.collect}</th><th scope="col">{t.bring}</th></tr></thead>
      <tbody>{budget.allowances.map(row => <tr key={row.role}><th scope="row">{t[row.role]}</th><td>{row.count}</td><td>{money(row.collect)}</td><td>{money(row.bring)}</td></tr>)}</tbody></table></div> : <p>{t.noCount}</p>}
    <h3>{t.meals}</h3><p>{t.mealCounts}</p>
    {budget.meals.some(meal => meal.camp+meal.packed+meal.outside>budget.count) && <p className="notice">{t.mealWarning}</p>}
    {budget.meals.length > 0 && <div className="roster-scroll"><table className="roster-table"><thead><tr><th scope="col">{t.date}</th><th scope="col">{t.meal}</th><th scope="col">{t.mealCamp}</th><th scope="col">{t.packed}</th><th scope="col">{t.outside}</th></tr></thead>
      <tbody>{budget.meals.map(meal => <tr key={meal.day+meal.meal}><th scope="row">{meal.day}</th><td>{t[meal.meal]}</td><td>{meal.camp}</td><td>{meal.packed}</td><td>{meal.outside}</td></tr>)}</tbody></table></div>}
  </section>;
}
