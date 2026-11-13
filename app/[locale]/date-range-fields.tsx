"use client";

import { useState } from "react";

export function DateRangeFields({
  startLabel, endLabel, start = "", end = "", type = "date", required = true,
}: {
  startLabel: string;
  endLabel: string;
  start?: string;
  end?: string;
  type?: "date" | "datetime-local";
  required?: boolean;
}) {
  const [startValue, setStartValue] = useState(start);
  const [endValue, setEndValue] = useState(end);

  return <>
    <label>{startLabel}<input name="start" type={type} value={startValue} required={required}
      onChange={event => {
        const value = event.currentTarget.value;
        setStartValue(value);
        if (value && (!endValue || endValue < value)) setEndValue(value);
      }} /></label>
    <label>{endLabel}<input name="end" type={type} value={endValue} min={startValue || undefined}
      required={required} onChange={event => setEndValue(event.currentTarget.value)} /></label>
  </>;
}
