"use client";
import { useRef,useState } from "react";
import type { Locale } from "../../../../lib/copy";
import { visitPlanningCopy } from "../../../../lib/visit-planning-copy";
import { usePendingFeedback } from "../../pending-feedback";

export function DownloadPlanning({visit,locale}:{visit:string;locale:Locale}){
  const [pending,setPending]=useState(false),[failed,setFailed]=useState(false),guard=useRef(false),t=visitPlanningCopy[locale];
  usePendingFeedback(pending);
  async function download(){
    if(guard.current)return;guard.current=true;setPending(true);setFailed(false);
    try{
      const response=await fetch("/api/church-visits/"+visit+"/planning?locale="+locale,{cache:"no-store"});
      if(!response.ok)throw new Error("Download failed");
      const blob=await response.blob(),url=URL.createObjectURL(blob),link=document.createElement("a");
      link.href=url;link.download=response.headers.get("Content-Disposition")?.match(/filename="([^"]+)"/)?.[1]??"pdv-trip-planning.xlsx";
      document.body.appendChild(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
    }catch{setFailed(true);}finally{guard.current=false;setPending(false);}
  }
  return <section className="card no-print"><button type="button" onClick={download} disabled={pending}>{t.download}</button><p>{t.help}</p>{failed&&<p role="alert">{t.failed}</p>}</section>;
}
