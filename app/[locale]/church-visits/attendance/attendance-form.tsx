"use client";

import { startTransition, useActionState, useState } from "react";
import type { Locale } from "../../../../lib/copy";
import { attendanceState, canRecordAttendance, type AttendanceOperation, type AttendancePerson, type AttendanceResult } from "../../../../lib/visit-attendance-state";
import { visitAttendanceCopy } from "../../../../lib/visit-attendance-copy";
import { submitAttendance } from "./actions";

export function AttendanceForm({locale,visit,batch,people,filter,search,closed}: {
  locale:Locale;visit:string;batch:string;people:AttendancePerson[];filter:string;search:string;closed:boolean;
}) {
  const t = visitAttendanceCopy[locale];
  const [operation,setOperation] = useState<AttendanceOperation>(filter === "present" ? "depart" : "arrive");
  const [selected,setSelected] = useState<Set<string>>(new Set());
  const [result,dispatch,pending] = useActionState<AttendanceResult|null,FormData>(submitAttendance,null);
  const eligible = people.filter(person => canRecordAttendance(person,operation));
  const correction = operation === "undoArrival" || operation === "undoDeparture";
  return <form action={dispatch} onSubmit={event => {
    event.preventDefault();
    if (pending) return;
    const data = new FormData(event.currentTarget);
    startTransition(() => dispatch(data));
  }}>
    <input name="locale" type="hidden" value={locale} /><input name="visit" type="hidden" value={visit} />
    <input name="batch" type="hidden" value={batch} /><input name="filter" type="hidden" value={filter} /><input name="q" type="hidden" value={search} />
    {!closed && <section className="card"><p>{t.help}</p><div className="grid">
      <label><span>{t.operation} *</span><select name="operation" value={operation} onChange={event => {
        setOperation(event.currentTarget.value as AttendanceOperation); setSelected(new Set());
      }}>
        {(["arrive","depart","undoArrival","undoDeparture"] as const).map(value => <option key={value} value={value}>{t[value]}</option>)}
      </select></label>
      <label><span>{t.actor} *</span><input name="actor" maxLength={160} required /></label>
      <label><span>{t.notes}{correction && " *"}</span><input name="notes" maxLength={1000} required={correction} /></label>
    </div>
      <p>{t.reasonRequired}</p>{correction && <p>{t.correctionHelp}</p>}
      <label className="check"><input type="checkbox" checked={eligible.length > 0 && eligible.every(person => selected.has(person.id))}
        disabled={!eligible.length || pending} onChange={event => setSelected(new Set(event.currentTarget.checked ? eligible.map(person => person.id) : []))} />{t.selectAll}</label>
      <p><strong>{t.selected} {selected.size}</strong></p>
      {result && <p className="notice" role="alert">{t[result.status]}</p>}
      <button disabled={!selected.size || pending}>{t.save}</button>
    </section>}
    <section className="card roster-scroll visit-attendance-scroll">{people.length ? <table className="roster-table">
      <thead><tr>{!closed && <th scope="col">{t.selected}</th>}<th scope="col">{t.name}</th><th scope="col">{t.role}</th>
        <th scope="col">{t.status}</th><th scope="col">{t.room}</th><th scope="col">{t.arrivalTime}</th><th scope="col">{t.departureTime}</th></tr></thead>
      <tbody>{people.map(person => <tr key={person.id}>
        {!closed && <td><input type="checkbox" name="visitor" value={person.id+":"+person.presence_revision}
          aria-label={person.first_name+" "+person.last_name} checked={selected.has(person.id)} disabled={pending || !canRecordAttendance(person,operation)}
          onChange={event => {
            const next = new Set(selected);
            if (event.currentTarget.checked) next.add(person.id); else next.delete(person.id);
            setSelected(next);
          }} /></td>}
        <th scope="row">{person.last_name}, {person.first_name}</th><td>{t[person.visitor_role]}</td><td>{t[attendanceState(person)]}</td>
        <td><a href={"/"+locale+"/church-visits/housing?visit="+visit+"#visitor-"+person.id}>{person.room ?? t.noRoom}</a></td>
        <td>{person.arrived_at ?? "—"}</td><td>{person.departed_at ?? "—"}</td>
      </tr>)}</tbody>
    </table> : <p>{t.empty}</p>}</section>
  </form>;
}
