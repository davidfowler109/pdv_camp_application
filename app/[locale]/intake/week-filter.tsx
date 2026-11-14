"use client";

export function RegistrationWeekFilter({label,selected,weeks}: {
  label:string;selected:number;weeks:{id:number;label:string}[];
}) {
  return <label>{label}<select name="week" defaultValue={selected}
    onChange={event => event.currentTarget.form?.requestSubmit()}>
    {weeks.map(week => <option key={week.id} value={week.id}>{week.label}</option>)}
  </select></label>;
}
