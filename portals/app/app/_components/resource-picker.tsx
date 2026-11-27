"use client";
import {useEffect,useState} from "react";
import {useMessages} from "../_i18n/useMessages";
import {integration} from "../_i18n/messages/integration";
type Item={id:string;title?:string;name?:string;label?:string};
export function ResourcePicker({kbId,value,onChange,multiple=false,entity=false,disabled=false}:{kbId:string;value:string;onChange:(v:string)=>void;multiple?:boolean;entity?:boolean;disabled?:boolean}){
 const m=useMessages(integration),[items,setItems]=useState<Item[]>([]),[state,setState]=useState<"loading"|"ready"|"error">("loading");
 useEffect(()=>{const ac=new AbortController();setItems([]);setState("loading");if(!kbId){setState("ready");return;}
 fetch("/api/kb/"+encodeURIComponent(kbId)+(entity?"/knowledge-package":"/documents"),{cache:"no-store",signal:ac.signal}).then(async r=>{if(!r.ok)throw Error();const b=await r.json();if(!ac.signal.aborted){setItems(entity?b.nodes??[]:b.documents??[]);setState("ready");}}).catch(()=>{if(!ac.signal.aborted)setState("error");});return()=>ac.abort();},[kbId,entity]);
 const selected=value.split(/[\s,]+/).filter(Boolean);
 return <div className="grid gap-xs"><label>{entity?m.chooseEntity:m.chooseDocuments}<select aria-label={entity?m.chooseEntity:m.chooseDocuments} className="block w-full rounded border p-sm" multiple={multiple} value={multiple?selected:value} disabled={disabled||state!=="ready"||!kbId} onChange={e=>onChange(multiple?Array.from(e.currentTarget.selectedOptions,o=>o.value).filter(Boolean).join("\n"):e.target.value)}>{!multiple&&<option value="">-</option>}{items.map(i=><option key={i.id} value={i.id}>{i.title??i.name??i.label??i.id}</option>)}</select></label>{state==="error"&&<p role="status">{m.loadFailed}</p>}{state==="ready"&&!items.length&&kbId&&<p role="status">{m.sourceEmpty}</p>}<details><summary>{m.advanced}</summary><textarea aria-label={m.advanced} disabled={disabled} className="block w-full rounded border p-sm" value={value} onChange={e=>onChange(e.target.value)}/></details></div>;
}
export function LibraryPicker({value,onChange,disabled=false}:{value:string;onChange:(v:string)=>void;disabled?:boolean}){
 const m=useMessages(integration),[items,setItems]=useState<Item[]>([]),[error,setError]=useState(false);
 useEffect(()=>{const ac=new AbortController();fetch("/api/workspace/search",{cache:"no-store",signal:ac.signal}).then(async r=>{if(!r.ok)throw Error();const b=await r.json();if(!ac.signal.aborted)setItems(b.items??[]);}).catch(()=>{if(!ac.signal.aborted)setError(true);});return()=>ac.abort();},[]);
 return <div><label>{m.assets}<select aria-label={m.assets} disabled={disabled} className="block w-full rounded border p-sm" value={value} onChange={e=>onChange(e.target.value)}><option value="">-</option>{items.map(k=><option key={k.id} value={k.id}>{k.name}</option>)}</select></label>{error&&<p role="alert">{m.loadFailed}</p>}{!error&&!items.length&&<p>{m.noLibraries}</p>}</div>;
}
