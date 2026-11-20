"use client";

import { useEffect,useRef,useState,type ComponentProps,type ReactNode,type RefObject } from "react";
import { useFormStatus } from "react-dom";
import { usePendingFeedback } from "./pending-feedback";

function FormContents({busy,guard,children}:{busy:boolean;guard:RefObject<boolean>;children:ReactNode}){
  const {pending}=useFormStatus();
  const waiting=busy||pending;
  const fieldset=useRef<HTMLFieldSetElement>(null);
  usePendingFeedback(waiting);
  useEffect(()=>{
    guard.current=waiting;
    const form=fieldset.current?.form;
    if(form)form.setAttribute("aria-busy",String(waiting));
  },[waiting,guard]);
  return <fieldset ref={fieldset} className="pending-fieldset" disabled={waiting}>{children}</fieldset>;
}

export function AppForm({children,busy=false,onSubmit,...props}:ComponentProps<"form">&{busy?:boolean}){
  const guard=useRef(false);
  const [navigation,setNavigation]=useState(false);
  useEffect(()=>{
    const reset=()=>{guard.current=false;setNavigation(false);};
    window.addEventListener("pageshow",reset);
    return ()=>window.removeEventListener("pageshow",reset);
  },[]);
  return <form {...props} onSubmit={event=>{
    if(guard.current||busy||navigation){event.preventDefault();return;}
    onSubmit?.(event);
    // Capture native GET data before disabling fields, preserving normal GET semantics.
    if(!event.defaultPrevented && typeof props.action!=="function" && event.currentTarget.method.toLowerCase()==="get"){
      const form=event.currentTarget,url=new URL(form.action);
      if(url.origin===location.origin){
        const data=new FormData(form,(event.nativeEvent as SubmitEvent).submitter);
        url.search="";
        for(const [name,value]of data)url.searchParams.append(name,typeof value==="string"?value:value.name);
        event.preventDefault();guard.current=true;setNavigation(true);
        try{location.assign(url.href);}catch{guard.current=false;setNavigation(false);}
        return;
      }
    }
    guard.current=true;
  }}>
    <FormContents busy={busy||navigation} guard={guard}>{children}</FormContents>
  </form>;
}
