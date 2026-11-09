"use client";

import { useEffect,useState } from "react";
import { useRouter } from "next/navigation";
import type { Locale } from "../../lib/copy";
import { isSignedFormType,signedFormMaxBytes,signedFormMaxFiles } from "../../lib/signed-form";

import { signedFormCopy } from "../../lib/signed-form-copy";

export type PendingSignedForm = {id:string;file:File};

export async function uploadSignedForms(registration:string,files:PendingSignedForm[]) {
  const failed:PendingSignedForm[] = [];
  for (const item of files) {
    try {
      const response = await fetch("/api/signed-forms/"+registration+"/"+item.id,{
        method:"PUT",body:item.file,headers:{"Content-Type":item.file.type},
      });
      if (!response.ok) failed.push(item);
    } catch {
      failed.push(item);
    }
  }
  return failed;
}

function Preview({item,locale}:{item:PendingSignedForm;locale:Locale}) {
  const [url,setUrl] = useState("");
  useEffect(()=>{
    const next = URL.createObjectURL(item.file);
    setUrl(next);
    return ()=>URL.revokeObjectURL(next);
  },[item.file]);
  if (!url) return null;
  return <a href={url} target="_blank" rel="noopener noreferrer">
    {item.file.type.startsWith("image/") && <img className="signed-form-preview" src={url} alt="" />}
    {signedFormCopy[locale].preview} · {item.file.name}
  </a>;
}

export function SignedFormPicker({locale,files,setFiles,disabled,limit=signedFormMaxFiles}:{
  locale:Locale;files:PendingSignedForm[];setFiles:(files:PendingSignedForm[])=>void;disabled?:boolean;limit?:number;
}) {
  const [invalid,setInvalid] = useState(false);
  const t = signedFormCopy[locale];
  function add(list:FileList|null) {
    const chosen = Array.from(list ?? []);
    const accepted = chosen.filter(file=>isSignedFormType(file.type) && file.size>0 && file.size<=signedFormMaxBytes);
    setInvalid(accepted.length !== chosen.length || files.length+accepted.length > limit);
    setFiles([...files,...accepted.slice(0,Math.max(0,limit-files.length)).map(file=>({id:crypto.randomUUID(),file}))]);
  }
  return <fieldset disabled={disabled} className="signed-form-picker">
    <legend>{t.files}</legend><p>{t.help}</p>
    <label>{t.choose}<input type="file" accept="image/jpeg,image/png,application/pdf" multiple
      onChange={event=>{add(event.currentTarget.files);event.currentTarget.value="";}} /></label>
    {invalid && <p role="alert">{t.invalid}</p>}
    {files.length>0 && <ul>{files.map(item=><li key={item.id}>
      <Preview item={item} locale={locale} />{" "}
      <button type="button" onClick={()=>setFiles(files.filter(file=>file.id!==item.id))}>{t.remove}</button>
    </li>)}</ul>}
  </fieldset>;
}

export function SignedFormUpload({locale,registration,limit=signedFormMaxFiles,initialFiles=[]}:{
  locale:Locale;registration:string;limit?:number;initialFiles?:PendingSignedForm[];
}) {
  const router = useRouter();
  const t = signedFormCopy[locale];
  const [files,setFiles] = useState(initialFiles);
  const [pending,setPending] = useState(false);
  const [status,setStatus] = useState<"uploaded"|"failed"|null>(null);
  async function save() {
    if (!files.length || pending) return;
    setPending(true);
    const failed = await uploadSignedForms(registration,files);
    setFiles(failed);
    setStatus(failed.length ? "failed" : "uploaded");
    setPending(false);
    router.refresh();
  }
  return <>
    <SignedFormPicker locale={locale} files={files} setFiles={setFiles} disabled={pending} limit={limit} />
    <button type="button" onClick={save} disabled={pending || !files.length}>{pending ? t.uploading : t.upload}</button>
    {status && <p role={status === "failed" ? "alert" : "status"}>{t[status]}</p>}
  </>;
}
