"use client";

import { startTransition, useActionState, useState } from "react";
import type { Locale } from "../../../lib/copy";
import type { ChurchVisitor, VisitorMode, VisitorResult } from "../../../lib/church-visitors";
import { churchVisitorCopy, visitNoticeVersion } from "../../../lib/church-visitor-copy";
import { registerVisitor } from "./registration-actions";

export function VisitorForm({locale,visit,id,mode,today,initial}: {
  locale:Locale; visit:string; id:string; mode:VisitorMode; today:string; initial?:ChurchVisitor;
}) {
  const t = churchVisitorCopy[locale];
  const [result, dispatch, pending] = useActionState<VisitorResult,FormData>(registerVisitor.bind(null,mode),null);
  const [role,setRole] = useState(initial?.visitor_role ?? "");
  const [relationship,setRelationship] = useState("");
  const [acknowledge,setAcknowledge] = useState(false);
  const [needs,setNeeds] = useState<Record<string,string>>(() => Object.fromEntries(
    (["food","diet","access"] as const).map(name => [name,initial?.details[(name+"Answer") as "foodAnswer"|"dietAnswer"|"accessAnswer"] ?? (initial?.details[name] ? "yes" : "")])));
  const required = <span className="required-mark" aria-hidden="true"> *</span>;
  const back = "/"+locale+"/church-visits/visitors?visit="+visit;
  const field = (name:string,label:string,max:number,value = "",mandatory = true,type = "text") =>
    <label><span>{label}{mandatory && required}</span><input name={name} type={type} maxLength={max} required={mandatory} defaultValue={value} /></label>;
  if (result === "received" || result === "saved") return <section className="card">
    <p role="status">{t[result]}</p>
    {mode === "online" ? <a href={"/"+locale+"/church-visits/register/"+visit}>{t.another}</a> :
      <p><a href={back}>{t.back}</a>{mode === "desk" && <> · <a href={back+"&entry=desk"}>{t.another}</a></>}</p>}
  </section>;
  return <form className="registration-form" action={dispatch} onSubmit={event => {
    event.preventDefault();
    if (pending) return;
    const data = new FormData(event.currentTarget);
    startTransition(() => dispatch(data));
  }}>
    <input name="locale" type="hidden" value={locale} /><input name="visit" type="hidden" value={visit} /><input name="id" type="hidden" value={id} />
    {initial && <input name="revision" type="hidden" value={initial.revision} />}
    <p className="muted">{t.required}</p>
    <section className="card"><h2>{t.personal}</h2><div className="grid">
      {field("first",t.first,100,initial?.first_name)}{field("last",t.last,100,initial?.last_name)}
      <label><span>{t.birth}{required}</span><input name="birth" type="date" required max={today} defaultValue={initial?.date_of_birth} /></label>
      <label><span>{t.gender}{required}</span><select name="gender" required defaultValue={initial?.gender_group ?? ""}>
        <option value="">—</option><option value="female">{t.female}</option><option value="male">{t.male}</option>
      </select></label>
      <label><span>{t.role}{required}</span><select name="role" required value={role} onChange={event => setRole(event.currentTarget.value as typeof role)}>
        <option value="">—</option><option value="student">{t.student}</option><option value="adult">{t.adult}</option><option value="leader">{t.leader}</option>
      </select></label>
      {field("contact",t.contact,200,initial?.contact)}{field("emergencyName",t.emergencyName,160,initial?.emergency_name)}
      {field("emergencyPhone",t.emergencyPhone,80,initial?.emergency_phone,true,"tel")}
    </div></section>
    <section className="card"><h2>{t.optional}</h2><div className="grid">
      {(["food","diet","access"] as const).map(name => <div key={name}>
        <label><span>{t[name]}{required}</span><select name={name+"Answer"} required value={needs[name]}
          onChange={event => {
            const value = event.currentTarget.value;
            setNeeds(previous => ({...previous,[name]:value}));
          }}>
          <option value="">—</option><option value="none">{t.none}</option><option value="yes">{t.yes}</option><option value="unknown">{t.unknown}</option>
        </select></label>
        {needs[name] === "yes" && <label><span>{t[name]} · {t.details}{required}</span>
          <textarea name={name} required maxLength={1000} defaultValue={initial?.details[name]} /></label>}
      </div>)}
      <label><span>{t.rooming}</span><textarea name="rooming" maxLength={1000} defaultValue={initial?.details.rooming} /></label>
    </div><p className="muted">{t.medicationHelp}</p></section>
    {mode !== "edit" && <section className="card"><h2>{t.authorization}</h2><p>{t.notice} <small>({visitNoticeVersion})</small></p>
      <div className="grid">{field("signer",t.signer,160)}
        <label><span>{t.relationship}{required}</span><select name="relationship" required value={relationship} onChange={event => setRelationship(event.currentTarget.value)}>
          <option value="">—</option><option value="self">{t.self}</option><option value="guardian">{t.guardian}</option><option value="representative">{t.representative}</option>
        </select></label>
      </div>
      {relationship === "representative" && <label className="check"><input type="checkbox" name="sharingAuthority" value="yes" required /><span>{t.representation}{required}</span></label>}
      <label className="check"><input type="checkbox" name="consent" value="yes" required /><span>{mode === "online" ? t.consent : t.staffConsent}{required}</span></label>
    </section>}
    {role === "leader" && <section className="card"><h2>{t.responsibility}</h2><p>{t.ackHelp}</p>
      {mode !== "online" && <p>{t.acknowledgment}</p>}
      <label className="check"><input name="acknowledge" type="checkbox" value="yes" checked={acknowledge} onChange={event => setAcknowledge(event.currentTarget.checked)} />
        <span>{mode === "online" ? t.acknowledgment : t.staffAck}</span></label>
      {acknowledge && mode !== "online" && field("ackSource",t.ackSource,1000)}
    </section>}
    {mode !== "online" && <section className="card"><div className="grid">
      {field("recorder",t.recorder,160)}
      {mode === "desk" ? field("intakeSource",t.intakeSource,1000) : field("reason",t.reason,1000)}
    </div>{mode === "edit" && <p>{t.changeHelp}</p>}</section>}
    {result && <p className="notice" role="alert">{t[result]}</p>}
    <button disabled={pending}>{mode === "edit" ? t.save : t.submit}</button>
  </form>;
}
