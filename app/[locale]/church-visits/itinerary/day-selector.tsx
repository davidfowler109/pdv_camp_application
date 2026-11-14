"use client";

export function DaySelector({visit,day,start,end,days,label,submitLabel}: {
  visit:string;day:string;start:string;end:string;days:string[];label:string;submitLabel:string;
}) {
  return <form method="get">
    <input name="visit" type="hidden" value={visit} />
    <label><span>{label}</span><input name="day" type="date" min={start} max={end} required
      defaultValue={day} list="visit-days" onChange={event => {
        const input=event.currentTarget;
        if (input.value && input.value!==day && input.validity.valid) input.form?.requestSubmit();
      }} /></label>
    <datalist id="visit-days">{days.map(value => <option key={value} value={value} />)}</datalist>
    <noscript><button type="submit">{submitLabel}</button></noscript>
  </form>;
}
