"use client";
import {useEffect,useRef,useState} from "react";
import Link from "next/link";
import {Banner,Button} from "@vxture/design-system";
import {PageHead} from "../../../../_shell/PageHead";
import {SignInGate} from "../../../../_lib/ui";
import {useMessages} from "../../../../_i18n/useMessages";
import {sharing} from "../../../../_i18n/messages/sharing";
import type {SharingCommand,SharingView,SharingPreview,SharingImpact} from "../../../../kb/lib/sharing";
import type {PublishState} from "../../../../kb/lib/ownership";
export function SharingClient({kbId}:{kbId:string}){
 const m=useMessages(sharing),[value,setValue]=useState<SharingView|null>(null),[preview,setPreview]=useState<SharingPreview|null>(null),[target,setTarget]=useState<PublishState>("private"),[note,setNote]=useState(""),[confirm,setConfirm]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(0),[code,setCode]=useState(""),[saved,setSaved]=useState(false);
 const lock=useRef(false),ticket=useRef(0),abort=useRef<AbortController|null>(null),pending=useRef<SharingCommand|null>(null),endpoint="/api/kb/"+encodeURIComponent(kbId)+"/publish";
 useEffect(()=>{void load();return()=>{ticket.current++;abort.current?.abort();};},[kbId]);
 async function get(signal:AbortSignal,before?:number){const r=await fetch(endpoint+(before?"?before="+before:""),{cache:"no-store",signal}),v=await r.json();if(!r.ok)throw {status:r.status,code:v.error};if(v.format!=="karda.library-sharing.v1"||v.kbId!==kbId)throw Error("invalid");setValue(v);return v as SharingView;}
 async function run(work:(signal:AbortSignal)=>Promise<void>){if(lock.current)return;lock.current=true;const id=++ticket.current;abort.current?.abort();const ctl=new AbortController();abort.current=ctl;setBusy(true);setError(0);setCode("");setSaved(false);setValue(null);setPreview(null);setConfirm(false);
  try{await work(ctl.signal);}catch(e){if(id===ticket.current){const v=e as {status?:number;code?:string};setError(v.status??503);setCode(v.code??"");setValue(null);setPreview(null);if([400,401,403,404,409].includes(v.status??0))pending.current=null;}}
  finally{if(id===ticket.current){lock.current=false;setBusy(false);}}
 }
 async function load(before?:number){pending.current=null;await run(async signal=>{const v=await get(signal,before);setTarget(v.state);});}
 async function execute(command:SharingCommand){pending.current=command;await run(async signal=>{
  const r=await fetch(endpoint,{method:"POST",cache:"no-store",signal,headers:{"Content-Type":"application/json"},body:JSON.stringify(command)}),v=await r.json();if(!r.ok)throw {status:r.status,code:v.error};pending.current=null;
  const state=await get(signal);if(command.action==="preview"){if(v.format!=="karda.library-sharing-preview.v1"||v.kbId!==kbId||v.target!==command.target)throw Error("invalid");setPreview(v);setTarget(command.target);}else{setTarget(state.state);setSaved(true);}
 });}
 function counts(i:SharingImpact){return <dl className="grid gap-xs"><div><dt>{m.attachments}</dt><dd>{i.attachments}</dd></div><div><dt>{m.products}</dt><dd>{i.consumerProducts}</dd></div><div><dt>{m.users}</dt><dd>{i.otherUsers}</dd></div><div><dt>{m.subscriptions}</dt><dd>{i.activeSubscriptions}</dd></div><div><dt>{m.pending}</dt><dd>{i.pendingDeliveries}</dd></div></dl>;}
 if(error===401)return <SignInGate from={"/assets/"+kbId+"/sharing"}/>;
 return <div className="flex min-w-0 flex-col gap-md" aria-busy={busy}><PageHead title={m.title}/><p>{m.hint}</p><p>{m.scope}</p><p>{m.effects}</p>
  <div className="flex flex-wrap gap-md"><Link href={"/assets/"+encodeURIComponent(kbId)}>{m.back}</Link><Button variant="outline" disabled={busy} onClick={()=>void load()}>{m.reload}</Button></div>
  {error!==0&&<Banner tone="danger" title={error===403?m.denied:error===409?m.changed:error===400?m.invalid:m.unavailable}/>}{code&&<p role="alert">{m.code}: <code>{code}</code></p>}{saved&&<Banner tone="success" title={m.saved}/>}{busy&&<p role="status">{m.loading}</p>}
  {error>=500&&pending.current&&<Button disabled={busy} onClick={()=>void execute(pending.current!)}>{m.retry}</Button>}
  {value&&<><section className="grid gap-sm rounded border p-md"><h2>{value.name}</h2><p>{m.current}: {m[value.state]} / {m.revision}: {value.revision}</p>{counts(value.impact)}<p>{m.countsHint}</p></section>
  <fieldset disabled={busy} className="grid gap-sm rounded border p-md"><label>{m.target}<select aria-label={m.target} className="block w-full rounded border p-sm" value={target} onChange={e=>{pending.current=null;setPreview(null);setConfirm(false);setSaved(false);setTarget(e.target.value as PublishState);}}>{value.allowedTargets.map(t=><option key={t} value={t}>{m[t]}</option>)}</select></label>
   <Button variant="outline" disabled={target===value.state} onClick={()=>void execute({action:"preview",target})}>{m.preview}</Button>
   <label>{m.note}<textarea maxLength={2000} className="block w-full rounded border p-sm" value={note} onChange={e=>{pending.current=null;setNote(e.target.value);setConfirm(false);setSaved(false);}}/></label>
   {preview&&<section className="grid gap-sm"><p>{m[preview.from]} &rarr; {m[preview.target]} / {m.revision}: {preview.revision}</p><p>{m.checked}: {preview.checkedAt}</p>{counts(preview.impact)}<label className="flex gap-sm"><input type="checkbox" checked={confirm} onChange={e=>setConfirm(e.target.checked)}/>{m.confirm}</label>
    <Button disabled={!confirm||!note.trim()} onClick={()=>void execute({action:"apply",target:preview.target,eventId:crypto.randomUUID(),expectedRevision:preview.revision,previewHash:preview.previewHash,note:note.trim()})}>{m.apply}</Button></section>}
  </fieldset><section className="grid gap-sm rounded border p-md"><h2>{m.history}</h2><p>{m.historyHint}</p>{!value.history.length&&<p>{m.empty}</p>}{value.history.map(h=><article key={h.revision} className="grid gap-xs rounded border p-sm"><p>{h.revision} / {m[h.before_state]} &rarr; {m[h.after_state]} / {h.created_at}</p><p className="break-all">{m.actor}: {h.created_by}</p><p className="break-words">{h.note}</p>{counts(h.impact)}</article>)}{value.nextBefore&&<Button variant="outline" onClick={()=>void load(value.nextBefore!)}>{m.older}</Button>}</section></>}
 </div>;
}
