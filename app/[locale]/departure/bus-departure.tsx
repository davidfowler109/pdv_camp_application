"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";
import type { Locale } from "../../../lib/copy";
import { departureCopy } from "../../../lib/departure-copy";
import { saveDeparture } from "./actions";

export type BusCandidate = {
  id:string; camper:string; stop:string|null; bus_key:string|null; version:string|null; handoff_required:boolean;
};

export function BusDeparture({locale,week,candidates,buses,search,open}:{
  locale:Locale; week:number; candidates:BusCandidate[]; buses:{key:string;name:string;departed:boolean}[]; search:string; open:boolean;
}) {
  const t = departureCopy[locale];
  const [bus,setBus] = useState("");
  const [route,setRoute] = useState("");
  const name = bus.trim().replace(/\s+/g," ");
  const busKey = name.toLowerCase();
  const existing = buses.find(item => item.key === busKey);
  const boarded = candidates.filter(row => row.bus_key === busKey);
  const waiting = candidates.filter(row => row.bus_key === null);
  const stops = [...new Set(waiting.map(row => row.stop ?? ""))].sort(new Intl.Collator(locale).compare);
  const roster = [...boarded,...waiting.filter(row => route === "all" || route === "stop:"+(row.stop ?? ""))];

  return <details>
    <summary>{t.batchBus}</summary>
    <p>{t.batchHelp}</p>
    <div className="grid">
      <label>{t.busName}<input value={bus} onChange={event => setBus(event.target.value)} maxLength={100} list="batch-bus-names" /></label>
      <datalist id="batch-bus-names">{buses.filter(item => !item.departed).map(item => <option key={item.key} value={item.name} />)}</datalist>
      <label>{t.plannedStop}<select value={route} onChange={event => setRoute(event.target.value)}>
        <option value="">{t.chooseStop}</option>
        <option value="all">{t.allStops}</option>
        {stops.map(stop => <option key={stop} value={"stop:"+stop}>{stop || t.noStop}</option>)}
      </select></label>
    </div>
    {existing?.departed ? <p role="status">{t.departed}</p> : name && (
      <BusChecklist key={busKey+"|"+route+"|"+roster.map(row => row.id+":"+row.version).join(",")} locale={locale} week={week} bus={existing?.name ?? name}
        roster={roster} boarded={boarded} search={search} open={open} />
    )}
  </details>;
}

function BusChecklist({locale,week,bus,roster,boarded,search,open}:{
  locale:Locale; week:number; bus:string; roster:BusCandidate[]; boarded:BusCandidate[]; search:string; open:boolean;
}) {
  const t = departureCopy[locale];
  const [selected,setSelected] = useState(() => new Set(boarded.map(row => row.id)));
  const excluded = roster.filter(row => !selected.has(row.id));
  const removedBoarding = boarded.some(row => !selected.has(row.id));
  if (!roster.length) return <p>{t.noBatchCampers}</p>;

  function toggle(id:string,checked:boolean) {
    setSelected(previous => {
      const next = new Set(previous);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  return <form action={saveDeparture}>
    <input type="hidden" name="operation" value="batchBus" />
    <input type="hidden" name="locale" value={locale} />
    <input type="hidden" name="week" value={week} />
    <input type="hidden" name="bus" value={bus} />
    <input type="hidden" name="q" value={search} />
    {open && <input type="hidden" name="open" value="yes" />}
    {boarded.map(row => <input type="hidden" key={row.id} name="boarded" value={row.id+"|"+row.version} />)}
    <fieldset>
      <legend>{t.batchRoster}</legend>
      <label className="check"><input type="checkbox" checked={selected.size === roster.length}
        onChange={event => setSelected(new Set(event.target.checked ? roster.map(row => row.id) : []))} />{t.selectAll}</label>
      <ul>{roster.map(row => <li key={row.id}>
        <label className="check"><input name="selected" type="checkbox" value={row.id}
          checked={selected.has(row.id)} onChange={event => toggle(row.id,event.target.checked)} />
          {row.camper}{row.stop ? " · "+row.stop : ""}{row.bus_key ? " · "+t.boarded : ""}
        </label>
        {row.handoff_required && <small>{t.handoffNeeded}</small>}
        {selected.has(row.id) && !row.bus_key && <label className="check">
          <input name="handoff" type="checkbox" value={row.id} />{t.handoffNeeded}
        </label>}
      </li>)}</ul>
    </fieldset>
    <p aria-live="polite"><strong>{bus} · {t.selectedCount(selected.size)}</strong></p>
    {excluded.length > 0 && <details><summary>{t.leftOff} ({excluded.length})</summary>
      <ul>{excluded.map(row => <li key={row.id}>{row.camper}</li>)}</ul>
    </details>}
    {removedBoarding && <label>{t.unboardReason}<input name="note" required maxLength={500} /></label>}
    <label className="check" key={Array.from(selected).join(",")}>
      <input name="verified" type="checkbox" value="yes" required disabled={!selected.size} />{t.batchVerified}
    </label>
    <label>{t.staff}<input name="actor" required maxLength={100} /></label>
    <BatchSubmit label={t.markBatch(selected.size)} disabled={!selected.size} />
  </form>;
}

function BatchSubmit({label,disabled}:{label:string;disabled:boolean}) {
  const {pending} = useFormStatus();
  return <button disabled={disabled || pending}>{label}</button>;
}
