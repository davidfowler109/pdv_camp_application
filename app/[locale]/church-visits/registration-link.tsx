"use client";

import { useEffect, useRef, useState } from "react";
import type { Locale } from "../../../lib/copy";
import { churchVisitorCopy } from "../../../lib/church-visitor-copy";

export function RegistrationLink({locale,path,label}: {locale:Locale;path:string;label?:string}) {
  const t = churchVisitorCopy[locale];
  const [url,setUrl] = useState(path);
  const [copied,setCopied] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => setUrl(new URL(path,window.location.origin).href),[path]);
  return <div className="actions">
    <label><span>{label ?? t.share}</span><input ref={input} readOnly value={url} onFocus={event => event.currentTarget.select()} /></label>
    <button type="button" onClick={async () => {
      try {
        await navigator.clipboard.writeText(url);
        setCopied(true);
      } catch {
        input.current?.focus();
        input.current?.select();
      }
    }}>{t.copyLink}</button>{copied && <span role="status">{t.copied}</span>}
  </div>;
}
