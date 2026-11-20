"use client";

import NextLink,{useLinkStatus} from "next/link";
import { useEffect,useRef,useState,type ComponentProps,type Dispatch,type SetStateAction,type RefObject } from "react";
import { usePendingFeedback } from "./pending-feedback";

function LinkPending({guard,setPending}:{guard:RefObject<boolean>;setPending:Dispatch<SetStateAction<boolean>>}){
  const {pending}=useLinkStatus();
  usePendingFeedback(pending);
  useEffect(()=>{
    guard.current=pending;setPending(pending);
    return ()=>{guard.current=false;};
  },[pending,guard,setPending]);
  return null;
}

export default function AppLink({children,onNavigate,...props}:ComponentProps<typeof NextLink>){
  const guard=useRef(false),[pending,setPending]=useState(false);
  return <NextLink {...props} aria-busy={pending||undefined} aria-disabled={pending||props["aria-disabled"]} onNavigate={event=>{
    if(guard.current){event.preventDefault();return;}
    onNavigate?.(event);
  }}>{children}<LinkPending guard={guard} setPending={setPending}/></NextLink>;
}
