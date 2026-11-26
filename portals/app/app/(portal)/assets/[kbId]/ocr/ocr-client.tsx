"use client";
import {useEffect,useRef,useState} from "react";
import Link from "next/link";
import {Button,Banner} from "@vxture/design-system";
import {PageHead} from "../../../../_shell/PageHead";
import {useMessages} from "../../../../_i18n/useMessages";
import {ocr} from "../../../../_i18n/messages/ocr";
import {SignInGate} from "../../../../_lib/ui";
import type {OcrPayload} from "../../../../kb/processing/pdf-ocr";

interface Draft {id:string;state:string;model_code:string;created_at:string;error_code:string|null;payload:OcrPayload|null;committed_version:number|null;stale:boolean}
interface Result {format:string;documentId:string;drafts:Draft[];nextBefore:string|null}
export function OcrClient({kbId,initialDocumentId,initialDraftId}:{kbId:string;initialDocumentId?:string;initialDraftId?:string}){
  const m=useMessages(ocr),[doc,setDoc]=useState(initialDocumentId&&/^[a-f0-9-]{36}$/.test(initialDocumentId)?initialDocumentId:""),[model,setModel]=useState(""),[value,setValue]=useState<Result|null>(null),
    [draft,setDraft]=useState<Draft|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState(0),[code,setCode]=useState(""),
    [confirmed,setConfirmed]=useState(false),[receipt,setReceipt]=useState<number|null>(null);
  const seq=useRef(0),abort=useRef<AbortController|null>(null);
  useEffect(()=>{if(initialDocumentId&&initialDraftId&&/^[a-f0-9-]{36}$/.test(initialDocumentId)&&/^[a-f0-9-]{36}$/.test(initialDraftId))void request("detail",initialDraftId);return()=>{seq.current++;abort.current?.abort();};},[]);
  const endpoint=`/api/kb/${encodeURIComponent(kbId)}/ocr-drafts`;
  function clear(){seq.current++;abort.current?.abort();setBusy(false);setValue(null);setDraft(null);setConfirmed(false);setReceipt(null);setError(0);setCode("");}
  async function request(action:"list"|"detail"|"create"|"confirm"|"reject",id?:string,before?:string){
    const ticket=++seq.current;abort.current?.abort();const controller=new AbortController();abort.current=controller;
    setBusy(true);setError(0);setCode("");setConfirmed(false);setReceipt(null);setDraft(null);
    try{
      const query=new URLSearchParams({document_id:doc.trim()});if(action==="detail")query.set("draft_id",id!);if(before)query.set("before",before);
      const writing=!["list","detail"].includes(action);
      const response=await fetch(writing?endpoint:`${endpoint}?${query}`,{method:writing?"POST":"GET",cache:"no-store",credentials:"same-origin",signal:controller.signal,
        ...(writing?{headers:{"Content-Type":"application/json"},body:JSON.stringify({action,id:id??crypto.randomUUID(),documentId:doc.trim(),...(action==="create"?{modelCode:model.trim()}:{})})}:{})});
      if(ticket!==seq.current)return;const result=await response.json();if(ticket!==seq.current)return;
      if(!response.ok){setValue(null);setError(response.status);setCode(result.error??"");return;}
      if(action==="confirm"||action==="reject"){setValue(null);setReceipt(result.version??null);return;}
      if(result.format!=="karda.ocr-drafts.v1"||result.documentId!==doc.trim()||!Array.isArray(result.drafts))throw Error("invalid_response");
      setValue(result);if(action!=="list")setDraft(result.drafts[0]??null);
    }catch{if(ticket===seq.current){setValue(null);setError(503);}}finally{if(ticket===seq.current)setBusy(false);}
  }
  if(error===401)return <SignInGate from={`/assets/${kbId}/ocr`}/>;
  const state=(s:string)=>({running:m.running,ready:m.ready,failed:m.failed,rejected:m.rejected,committed:m.committed}[s]??s);
  return <div className="flex min-w-0 flex-col gap-md" aria-busy={busy}>
    <PageHead title={m.title}/><p>{m.hint}</p>
    <Button variant="outline" asChild><Link href={`/assets/${kbId}/semantic`}>{m.back}</Link></Button>
    <form className="grid gap-sm rounded border p-md" onSubmit={e=>{e.preventDefault();void request("list");}}>
      <label>{m.document}<input className="block w-full rounded border p-sm" required value={doc} onChange={e=>{clear();setDoc(e.target.value);}}/></label>
      <label>{m.model}<input className="block w-full rounded border p-sm" value={model} onChange={e=>setModel(e.target.value)}/></label>
      <p>{m.limit}</p><div className="flex flex-wrap gap-sm">
        <Button disabled={busy||!doc.trim()} type="submit">{m.history}</Button>
        <Button type="button" disabled={busy||!doc.trim()||!model.trim()} onClick={()=>void request("create")}>{m.create}</Button>
        {doc.trim()&&<a className="underline" target="_blank" rel="noopener noreferrer" href={`/api/kb/${encodeURIComponent(kbId)}/documents/${encodeURIComponent(doc.trim())}/download?inline=1`}>{m.original}</a>}
      </div>
    </form>
    {error!==0&&<Banner tone="danger" title={`${error===403?m.denied:error===409?m.conflict:m.error} ${code}`}/>}
    {receipt!==null&&<Banner tone="success" title={`${m.saved} ${receipt}`}/>}
    {value&&<section className="grid gap-sm"><h2>{m.history}</h2>{value.drafts.length===0&&<p>{m.empty}</p>}
      {value.drafts.map(d=><div key={d.id} className="flex flex-wrap items-center gap-sm rounded border p-sm">
        <Button variant="outline" disabled={busy} onClick={()=>void request("detail",d.id)}>{m.preview}</Button>
        <span>{state(d.state)} / {d.model_code} / {d.created_at}</span><code>{d.id}</code>
      </div>)}
      {value.nextBefore&&<Button variant="outline" disabled={busy} onClick={()=>void request("list",undefined,value.nextBefore!)}>{m.more}</Button>}
    </section>}
    {draft&&<section className="grid gap-md rounded border p-md"><h2>{m.preview} / {state(draft.state)}</h2>
      {draft.stale&&<Banner tone="danger" title={m.conflict}/>}
      {draft.error_code&&<Banner tone="danger" title={`${m.error} ${draft.error_code}`}/>}
      {draft.state==="running"&&<p>{m.runningHint}</p>}
      {draft.payload?.pages.map(page=><section key={page.pageIndex} className="grid gap-sm"><h3>{m.page} {page.pageIndex+1}</h3>
        {page.spans.length===0&&<p>{m.blank}</p>}{page.spans.map((span,i)=><div key={i} className="rounded border p-sm">
          <pre className="whitespace-pre-wrap break-words">{span.text}</pre><small>{m.region} {span.bbox.join(", ")}</small>
        </div>)}
      </section>)}
      {draft.state==="committed"&&<p>{m.saved} {draft.committed_version}</p>}
      {draft.state==="ready"&&!draft.stale&&draft.payload&&<><label><input type="checkbox" checked={confirmed} onChange={e=>setConfirmed(e.target.checked)}/> {m.confirmHint}</label>
        <Button disabled={busy||!confirmed} onClick={()=>void request("confirm",draft.id)}>{m.confirm}</Button></>}
      {["ready","running"].includes(draft.state)&&<Button variant="outline" disabled={busy} onClick={()=>void request("reject",draft.id)}>{m.reject}</Button>}
    </section>}
  </div>;
}
