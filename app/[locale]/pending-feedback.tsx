"use client";

import { createContext,useCallback,useContext,useEffect,useState,type ReactNode } from "react";

const BusyContext=createContext<(()=>()=>void)|null>(null);

export function usePendingFeedback(pending:boolean){
  const begin=useContext(BusyContext);
  useEffect(()=>{
    if(pending && begin)return begin();
  },[pending,begin]);
}

export function PendingFeedback({locale,children}:{locale:"en"|"es";children:ReactNode}){
  const [operations,setOperations]=useState(0);
  const [navigation,setNavigation]=useState(false);
  const begin=useCallback(()=>{
    setOperations(count=>count+1);
    return ()=>setOperations(count=>Math.max(0,count-1));
  },[]);
  const busy=operations>0||navigation;
  useEffect(()=>{
    if(busy)document.documentElement.dataset.appBusy="true";
    else delete document.documentElement.dataset.appBusy;
    return ()=>{delete document.documentElement.dataset.appBusy;};
  },[busy]);
  useEffect(()=>{
    const reset=()=>setNavigation(false);
    const click=(event:MouseEvent)=>{
      if(event.defaultPrevented||event.button!==0||event.ctrlKey||event.metaKey||event.shiftKey||event.altKey)return;
      const link=event.target instanceof Element ? event.target.closest<HTMLAnchorElement>("a[href]") : null;
      if(!link||link.hasAttribute("download")||(link.target&&link.target!=="_self"))return;
      const next=new URL(link.href,location.href),current=new URL(location.href);
      if(next.origin!==current.origin||!["http:","https:"].includes(next.protocol))return;
      if(next.pathname===current.pathname&&next.search===current.search&&next.hash)return;
      // Next Link prevents its native click; its pending hook supplies feedback instead.
      setNavigation(true);
    };
    document.addEventListener("click",click);
    window.addEventListener("pageshow",reset);
    return ()=>{document.removeEventListener("click",click);window.removeEventListener("pageshow",reset);};
  },[]);
  return <BusyContext.Provider value={begin}>{children}
    <div className="pending-notice no-print" role="status" aria-live="polite" hidden={!busy}>
      <span className="pending-spinner" aria-hidden="true" />{locale==="es"?"Procesando…":"Working…"}
    </div>
  </BusyContext.Provider>;
}
