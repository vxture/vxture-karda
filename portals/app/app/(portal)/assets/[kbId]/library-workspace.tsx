"use client";
import {useEffect,useState} from "react";
import Link from "next/link";
import {usePathname,useRouter} from "next/navigation";
import {Button} from "@vxture/design-system";
import {useMessages} from "../../../_i18n/useMessages";
import {visualMessages} from '../../../_i18n/messages/visual';
import {integration} from "../../../_i18n/messages/integration";
export function LibraryWorkspace({kbId}:{kbId:string}){
 const vm=useMessages(visualMessages),m=useMessages(integration),path=usePathname(),router=useRouter();
 const [attached,setAttached]=useState<boolean|null>(null),[error,setError]=useState(""),[busy,setBusy]=useState(false);
 useEffect(()=>{const ac=new AbortController();setAttached(null);setError("");fetch("/api/kb/"+encodeURIComponent(kbId)+"/attachment",{cache:"no-store",signal:ac.signal}).then(async r=>{if(!r.ok)throw Error();const b=await r.json();if(!ac.signal.aborted)setAttached(b.attached===true);}).catch(()=>{if(!ac.signal.aborted)setError(m.scopeUnavailable);});return()=>ac.abort();},[kbId,m.scopeUnavailable,path]);
 async function attach(){setBusy(true);setError("");try{const r=await fetch("/api/kb/"+encodeURIComponent(kbId)+"/attachment",{method:"POST"});if(!r.ok)throw Error();setAttached(true);router.refresh();window.location.reload();}catch{setError(m.scopeUnavailable);}finally{setBusy(false);}}
 const links=[["",m.documents],["knowledge",m.knowledge],["source-search",m.sourceSearch],["configuration",m.configuration],["graph",m.graph],["graph/studio",m.rules],["identity",m.identity],["contributions",m.contributions],["connectors",m.connectors],["sources",m.sources],["maintenance",m.maintenance],["settings",m.settings]];
 return <section className="flex min-w-0 flex-col gap-sm"><nav aria-label={m.libraryNav} className="flex flex-wrap gap-sm">{links.map(([suffix,label])=>{const href="/assets/"+kbId+(suffix?"/"+suffix:"");return <Link key={href} href={href} aria-current={path===href?"page":undefined} className="rounded border border-border px-sm py-xs aria-[current=page]:bg-muted">{label}</Link>;})}<Link className="rounded border border-border px-sm py-xs" href={"/pipeline/multimodal?kbId="+kbId}>{vm.title}</Link></nav>{error?<p role="alert">{error}</p>:attached===false?<div role="status" className="rounded border border-border p-sm"><p>{m.mountHint}</p><Button disabled={busy} onClick={()=>void attach()}>{m.mountAction}</Button></div>:attached===true?<p className="text-xs text-muted-foreground">{m.mounted}</p>:<p role="status">{m.checkingScope}</p>}</section>;
}
