"use client";

import { Fragment, useActionState, useState } from "react";
import type { Locale } from "../../lib/copy";
import { campPaymentCopy } from "../../lib/camp-payment-copy";
import { registrationCopy } from "../../lib/registration-copy";
import { rosterCopy } from "../../lib/roster-copy";
import { campBusStops, campPickupLabel, healthFields, noticeVersion, type IntakeChannel } from "../../lib/registration";
import { submitRegistration } from "./registration-actions";
import { signedFormCopy } from "../../lib/signed-form-copy";
import { SignedFormPicker, SignedFormUpload, uploadSignedForms, type PendingSignedForm } from "./signed-form-files";

type RegistrationWeek = {id:number;label:string;priceLabel?:string};

export function RegistrationForm({ locale, channel, id, weeks, selectedWeek }: {
  locale: Locale; channel: IntakeChannel; id: string; selectedWeek?:number; weeks: RegistrationWeek[];
}) {
  const t = registrationCopy[locale];
  const attachment = signedFormCopy[locale];
  const payment = campPaymentCopy[locale];
  const [files,setFiles] = useState<PendingSignedForm[]>([]);
  const [uploaded,setUploaded] = useState(false);
  const [status, action, busy] = useActionState(async (previous:Awaited<ReturnType<typeof submitRegistration>>, form:FormData) => {
    const result = await submitRegistration(channel,previous,form);
    if (result === "saved" && channel === "paper" && files.length) {
      const failed = await uploadSignedForms(id,files);
      setFiles(failed);
      setUploaded(failed.length === 0);
    }
    return result;
  }, null);
  const [authorized, setAuthorized] = useState(false);
  const [answers, setAnswers] = useState<Record<string, string>>(selectedWeek ? {week:String(selectedWeek)} : {});
  const setField = (name: string, value: string) => setAnswers(previous => ({ ...previous, [name]: value }));
  const requiredMark = <span className="required-mark" aria-hidden="true"> *</span>;
  const input = (name: string, label: string, required = true, type = "text") =>
    <label><span>{label}{required && requiredMark}</span><input name={name} type={type} value={answers[name] ?? ""} onChange={event => setField(name, event.currentTarget.value)} maxLength={type === "text" ? 1000 : undefined} required={required} /></label>;
  const choice = (name: string, label: string, options: [string, string][], required = true) =>
    <label><span>{label}{required && requiredMark}</span><select name={name} value={answers[name] ?? ""} required={required}
      onChange={event => setField(name, event.currentTarget.value)}>
      <option value="">—</option>{options.map(([value, text]) => <option value={value} key={value}>{text}</option>)}
    </select></label>;
  const weekField = choice("week",t.week,weeks.map(week => [String(week.id),week.label]));
  const displayedPrice = weeks.find(week=>String(week.id) === answers.week)?.priceLabel;
  if (status === "saved" && channel === "paper") return <>
    <p className="notice" role="status">{t.saved}{uploaded && " "+attachment.uploaded}</p>
    {files.length > 0 && <section className="card">
      <p role="alert">{attachment.failed}</p>
      <SignedFormUpload locale={locale} registration={id} initialFiles={files} />
    </section>}
    <p><a href={"/"+locale+"/intake/"+id}>{attachment.review}</a></p>
    <p><a href={"/"+locale+"/intake/new?week="+answers.week+"&method=paper"}>{rosterCopy[locale].newAnother}</a></p>
  </>;
  if (status === "saved") return <><p className="notice" role="status">{t.saved}</p>{channel !== "online" && <a href={"/"+locale+"/intake/new?week="+answers.week+(channel === "paper" ? "&method=paper" : "")}>{rosterCopy[locale].newAnother}</a>}</>;

  return <form action={action} className="registration-form">
    <input type="hidden" name="id" value={id} /><input type="hidden" name="locale" value={locale} />
    {channel === "online" && <section className="card">
      {weekField}
      {displayedPrice && <p aria-live="polite"><strong>{displayedPrice}</strong></p>}
      <p>{payment.payLater}</p>
    </section>}
    <section className="card">
      <h2>{t.notice}</h2><p>{t.noticeBody} <small>({noticeVersion})</small></p>
      <p className="required-note">{t.requiredFields}</p>
      <label className="check"><input name="authorization" type="checkbox" value="yes" checked={authorized}
        onChange={event => setAuthorized(event.currentTarget.checked)} required /><span>{t.authorization}{requiredMark}</span></label>
    </section>
    {authorized && <>
      <section className="card"><div className="grid">
        {input("signer", t.signer)}
        {choice("signerRole", t.signerRole, [["guardian",t.guardian],["self",t.self]])}
        {answers.signerRole === "guardian" && input("signerRelationship",t.signerRelationship)}
        {channel === "paper" && <>
          {input("authorizedOn",t.authorizedOn,true,"date")}{input("paperRoute",t.paperRoute)}
          {input("paperSource",t.paperSource,false)}{input("witness",t.witness,false)}
          {input("paperLocation",attachment.location,false)}
        </>}
        {channel !== "online" && input("recorder",t.recorder)}
        {choice("helperRole",t.helperRole,[["none",t.noneHelper],["family",t.family],["pastor",t.pastor],["staff",t.staff]])}
        {answers.helperRole && answers.helperRole !== "none" && input("helper",t.helper)}
      </div></section>
      {channel === "paper" && <section className="card">
        <SignedFormPicker locale={locale} files={files} setFiles={setFiles} disabled={busy} />
        <p className="muted">{attachment.later}</p>
      </section>}
      <section className="card"><h2>{t.camper}</h2><div className="grid">
        {channel !== "online" && weekField}
        {input("first",t.first)}{input("last",t.last)}{input("birth",t.birth,true,"date")}
        {choice("group",t.group,[["female",t.female],["male",t.male]])}
        {input("home",t.home)}
        {input("contact",t.contact)}{input("relationship",t.relationship)}{input("contactRoute",t.contactRoute)}
        {input("additionalContact",t.additionalContact,false)}{input("homeChurch",t.homeChurch,false)}
      </div></section>
      <section className="card"><h2>{t.health}</h2><div className="grid">
        {healthFields.map(key => <Fragment key={key}>
          {choice(key,t[key],[["none",t.none],["yes",t.yes],["unknown",t.unknown]])}
          {answers[key] === "yes" && input(key+"Details",t.details)}
        </Fragment>)}
        <label>{t.notes}<textarea rows={3} name="notes" maxLength={1000} value={answers.notes ?? ""} onChange={event => setField("notes", event.currentTarget.value)} /></label>
      </div></section>
      <section className="card"><h2>{t.transport}</h2><div className="grid">
        {choice("arrival",t.arrival,[["bus",t.bus],["own",t.own]])}
        {answers.arrival === "bus" && choice("arrivalStop",t.arrivalStop,campBusStops.map(stop=>[stop.name,campPickupLabel(stop,locale)]))}
        {choice("departure",t.departure,[["bus",t.bus],["own",t.own]])}
        {answers.departure === "bus" && choice("departureStop",t.departureStop,campBusStops.map(stop=>[stop.name,stop.name]))}
        {answers.departure === "own" && input("pickup",t.pickup,false)}
      </div></section>
      <section className="card"><h2>{t.permissions}</h2><div className="grid">
        <label>{t.participation}<select name="participation" value={answers.participation ?? "pending"} onChange={event => setField("participation", event.currentTarget.value)}>
          <option value="pending">{t.pending}</option><option value="granted">{t.granted}</option><option value="declined">{t.declined}</option>
        </select></label>
        {input("scholarship",t.scholarship,false)}
      </div></section>
      <section className="card">
        <fieldset>
          <legend>{t.photoQuestion}{requiredMark}</legend>
          <p>{t.photoHelp}</p>
          <label className="check"><input name="photoPermission" type="radio" value="granted" required
            checked={answers.photoPermission === "granted"} onChange={()=>setField("photoPermission","granted")} />{t.yes}</label>
          <label className="check"><input name="photoPermission" type="radio" value="declined" required
            checked={answers.photoPermission === "declined"} onChange={()=>setField("photoPermission","declined")} />{t.no}</label>
          {channel === "paper" && <label className="check"><input name="photoPermission" type="radio" value="unrecorded"
            checked={answers.photoPermission === "unrecorded"} onChange={()=>setField("photoPermission","unrecorded")} />{t.photoUnrecorded}</label>}
        </fieldset>
      </section>
      {status && <p className="notice" role="alert">{t[status]}</p>}
      <button disabled={busy}>{t.submit}</button>
    </>}
  </form>;
}
