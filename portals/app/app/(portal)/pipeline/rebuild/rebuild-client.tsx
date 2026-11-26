"use client";
import {useEffect,useRef,useState} from "react";
import Link from "next/link";
import {Banner,Button} from "@vxture/design-system";
import {PageHead} from "../../../_shell/PageHead";
import {SignInGate} from "../../../_lib/ui";
import {useMessages} from "../../../_i18n/useMessages";
import {rebuild} from "../../../_i18n/messages/rebuild";
import type {RebuildCommand,RebuildView} from "../../../kb/processing/rebuild-contract";
export function RebuildClient(){
  const m=useMessages(rebuild),[kb,setKb]=useState(""),[docs,setDocs]=useState(""),[target,setTarget]=useState(512),[max,setMax]=useState(1024),[note,setNote]=useState(""),
    [rows,setRows]=useState<RebuildView[]>([]),[next,setNext]=useState<string|null>(null),[selected,setSelected]=useState<RebuildView|null>(null),
    [busy,setBusy]=useState(false),[error,setError]=useState(0),[code,setCode]=useState(""),[saved,setSaved]=useState(false),[confirm,setConfirm]=useState(false),
    [libraries,setLibraries]=useState<{id:string;name:string}[]>([]);
  const locked=useRef(false),sequence=useRef(0),controller=useRef<AbortController|null>(null),pending=useRef<RebuildCommand|null>(null);
  const endpoint="/api/pipeline/rebuild";
  useEffect(()=>{
    const ctl=new AbortController();fetch("/api/kb",{cache:"no-store",signal:ctl.signal}).then(async r=>{
      if(r.ok){const v=await r.json();if(Array.isArray(v.knowledgeBases))setLibraries(v.knowledgeBases);}
    }).catch(()=>{});
    return()=>{ctl.abort();sequence.current++;controller.current?.abort();};
  },[]);
  function edit(){pending.current=null;setSaved(false);setConfirm(false);}
  async function read(signal:AbortSignal,id?:string,before?:string){
    const q=new URLSearchParams({kbId:kb.trim(),...(id?{id}:{}),...(before?{before}:{})});
    const r=await fetch(endpoint+"?"+q,{cache:"no-store",signal});
    if(!r.ok){const value=await r.json();throw {status:r.status,code:value.error};}
    const v=await r.json();if(v.format!=="karda.index-rebuild.v1"||!Array.isArray(v.runs))throw Error("invalid");
    if(id)setSelected(v.runs[0]);else{setRows(v.runs);setNext(v.nextBefore);}
  }
  async function run(work:(signal:AbortSignal)=>Promise<void>){
    if(locked.current)return;locked.current=true;const ticket=++sequence.current;
    controller.current?.abort();const ctl=new AbortController();controller.current=ctl;
    setBusy(true);setError(0);setCode("");setSaved(false);setConfirm(false);setRows([]);setSelected(null);setNext(null);
    try{await work(ctl.signal);}catch(e){if(ticket===sequence.current){const value=e as {status?:number;code?:string};setError(value.status??503);setCode(value.code??"");setRows([]);setSelected(null);setNext(null);if([400,401,403,404,409].includes(value.status??0))pending.current=null;}}
    finally{if(ticket===sequence.current){locked.current=false;setBusy(false);}}
  }
  async function load(id?:string,before?:string){pending.current=null;await run(signal=>read(signal,id,before));}
  async function execute(command:RebuildCommand){
    pending.current=command;
    await run(async signal=>{
      const r=await fetch(endpoint,{method:"POST",cache:"no-store",signal,headers:{"Content-Type":"application/json"},body:JSON.stringify(command)});
      const v=await r.json();if(!r.ok)throw {status:r.status,code:v.error};pending.current=null;
      await read(signal);await read(signal,command.id);setSaved(true);
    });
  }
  const state=(value:string)=>m[value as "planned"|"running"|"ready"|"failed"|"active"|"reverted"|"cancelled"]??value;
  if(error===401)return <SignInGate from="/pipeline/rebuild"/>;
  const field="block w-full rounded border p-sm";
  return <div className="flex min-w-0 flex-col gap-md" aria-busy={busy}>
    <PageHead title={m.title}/><Link href="/evaluation/pilots">{m.pilots}</Link><p>{m.hint}</p><p className="text-body-sm text-muted-foreground">{m.limits}</p>
    {error!==0&&<Banner tone="danger" title={error===403?m.denied:error===409?m.changed:error===400?m.invalid:m.unavailable}/>}
    {code&&<p role="alert">{m.errorCode}: <code>{code}</code></p>}{saved&&<Banner tone="success" title={m.saved}/>}
    {error>=500&&pending.current&&<Button disabled={busy} onClick={()=>void execute(pending.current!)}>{m.retry}</Button>}
    {busy&&<p role="status">{m.loading}</p>}
    <fieldset disabled={busy} className="grid min-w-0 gap-sm rounded border p-md">
      <label>{m.library}<input list="rebuild-libraries" className={field} value={kb} onChange={e=>{edit();setKb(e.target.value);setRows([]);setSelected(null);setNext(null);}}/></label>
      <datalist id="rebuild-libraries">{libraries.map(l=><option key={l.id} value={l.id}>{l.name}</option>)}</datalist>
      <div className="flex flex-wrap gap-sm"><Button disabled={!kb.trim()} variant="outline" onClick={()=>void load()}>{m.refresh}</Button><Link href={kb.trim()?"/assets/"+encodeURIComponent(kb.trim()):"/assets"}>{m.assets}</Link></div>
      <form className="grid gap-sm" onSubmit={e=>{e.preventDefault();void execute({action:"create",id:crypto.randomUUID(),kbId:kb.trim(),documentIds:docs.trim().split(/[\s,]+/).filter(Boolean),params:{targetTokens:target,maxTokens:max,overlap:0},note:note.trim()});}}>
        <label>{m.docs}<textarea rows={3} className={field} value={docs} onChange={e=>{edit();setDocs(e.target.value);}}/></label>
        <div className="grid gap-sm sm:grid-cols-2"><label>{m.target}<input type="number" min={32} max={2048} className={field} value={target} onChange={e=>{edit();setTarget(Number(e.target.value));}}/></label>
        <label>{m.max}<input type="number" min={target} max={4096} className={field} value={max} onChange={e=>{edit();setMax(Number(e.target.value));}}/></label></div>
        <label>{m.note}<textarea required maxLength={2000} className={field} value={note} onChange={e=>{edit();setNote(e.target.value);}}/></label>
        <Button type="submit" disabled={!kb.trim()||!docs.trim()||!note.trim()}>{m.create}</Button>
      </form>
    </fieldset>
    <section className="grid min-w-0 gap-sm">{!rows.length&&!selected&&!busy&&<p>{m.empty}</p>}
      {rows.map(r=><article key={r.id} className="grid gap-sm rounded border p-md"><p className="break-all">{r.name} / {r.id}</p><p>{m.state}: {state(r.state)} / {m.revision}: {r.revision}</p><p>{r.items.filter(i=>i.state==="ready").length} / {r.items.length}</p>
        <Button disabled={busy} variant="outline" onClick={()=>void load(r.id)}>{m.detail}</Button></article>)}
      {next&&<Button disabled={busy} variant="outline" onClick={()=>void load(undefined,next)}>{m.more}</Button>}
    </section>
    {selected&&<section className="grid min-w-0 gap-sm rounded border p-md"><h2 className="break-all">{selected.name} / {selected.id}</h2>
      <p>{m.state}: {state(selected.state)} / {m.revision}: {selected.revision}</p><p>{selected.note}</p>
      {selected.items.map(i=><article key={i.document_id} className="grid gap-xs rounded border p-sm"><p className="break-all">{i.title||i.document_id} / {i.document_id}</p>
        <p>{m.state}: {state(i.state)} / {m.version}: {i.source_version}</p><p>{m.counts}: {i.oldCount} &rarr; {i.newCount} / {m.model}: {i.model??"-"}</p>
        <p>{m.attempt}: {i.attempt} / 3 {i.lease_until&&<span>{m.lease}: {i.lease_until}</span>}</p>{i.error_code&&<p>{m.errorCode}: {i.error_code}</p>}
        {selected.state==="planned"&&i.state!=="ready"&&<Button disabled={busy||i.attempt>=3||(i.state==="running"&&!!i.lease_until&&Date.parse(i.lease_until)>Date.now())} variant="outline" onClick={()=>void execute({action:"execute",id:selected.id,documentId:i.document_id})}>{m.execute}</Button>}
      </article>)}
      <Button disabled={busy} variant="outline" onClick={()=>void load(selected.id)}>{m.detail}</Button>
      {(["planned","active"].includes(selected.state))&&<><label className="flex gap-sm"><input type="checkbox" disabled={busy} checked={confirm} onChange={e=>setConfirm(e.target.checked)}/>{m.confirm}</label>
        <div className="flex flex-wrap gap-sm">{(selected.state==="active"?["revert"] as const:["activate","cancel"] as const).map(action=><Button key={action} variant="outline" disabled={busy||!confirm||!note.trim()||(action==="activate"&&selected.items.some(i=>i.state!=="ready"))} onClick={()=>void execute({action,id:selected.id,eventId:crypto.randomUUID(),expectedRevision:selected.revision,note:note.trim()})}>{m[action]}</Button>)}</div></>}
      <h3>{m.history}</h3>{selected.events.map(e=><p key={e.revision}>{e.revision} / {m[e.action as "activate"|"revert"|"cancel"]} / {e.created_at} / {e.note}</p>)}
    </section>}
  </div>;
}
