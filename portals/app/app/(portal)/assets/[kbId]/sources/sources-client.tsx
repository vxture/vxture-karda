"use client";
import {useEffect,useRef,useState} from "react";
import Link from "next/link";
import {Banner,Button} from "@vxture/design-system";
import {PageHead} from "../../../../_shell/PageHead";
import {SignInGate} from "../../../../_lib/ui";
import {useMessages} from "../../../../_i18n/useMessages";
import {sources} from "../../../../_i18n/messages/sources";
import type {SourceCommand,SourceBinding,SourceRun,SourceProgressItem,SourceItem} from "../../../../kb/connectors/source-contract";
interface Document {id:string;title:string;content_state:string;source_doc_id:string;source_version:string;task_id:string|null;task_state:string|null}
interface History {revision:number;action:string;note:string;created_at:string;result:Record<string,unknown>}
interface View {format:string;kbId:string;bindings:SourceBinding[];runs:SourceRun[];items:SourceProgressItem[];documents:Document[];history:History[];nextBefore:string|null;nextHistoryBefore:number|null;nextDocumentBefore:string|null}
interface Preview {bindingId:string;revision:number;previewHash:string;documents:number;pendingItems:number}
export function SourcesClient({kbId,initialBinding=''}:{kbId:string;initialBinding?:string}){
 const m=useMessages(sources),[view,setView]=useState<View|null>(null),[binding,setBinding]=useState(""),[runId,setRunId]=useState(""),[connector,setConnector]=useState<"api"|"arda">("api"),[external,setExternal]=useState(""),[note,setNote]=useState(""),[accept,setAccept]=useState(false),[confirm,setConfirm]=useState(false),[manifest,setManifest]=useState(""),[version,setVersion]=useState(1),[selected,setSelected]=useState<string[]>([]),[docs,setDocs]=useState<string[]>([]),[preview,setPreview]=useState<Preview|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState(0),[code,setCode]=useState(""),[saved,setSaved]=useState(false);
 const fileTicket=useRef(0),lock=useRef(false),ticket=useRef(0),abort=useRef<AbortController|null>(null),pending=useRef<SourceCommand|null>(null),endpoint="/api/kb/"+encodeURIComponent(kbId)+"/sources";
 useEffect(()=>{void load(initialBinding);return()=>{ticket.current++;abort.current?.abort();};},[kbId]);
 const current=view?.bindings.find(b=>b.id===binding),currentRun=view?.runs.find(r=>r.id===runId);
 const text=(s:string)=>m[s as "active"|"paused"|"revoked"|"queued"|"running"|"applied"|"failed"|"cancelled"|"attention"|"done"|"created"|"superseded"|"deleted"|"absent"|"unchanged"|"obsolete"]??s;
 function edit(){fileTicket.current++;pending.current=null;setConfirm(false);setPreview(null);setSaved(false);}
 async function get(signal:AbortSignal,bindingId=binding,run=runId,extra:Record<string,string>={}){
  const q=new URLSearchParams({...(bindingId?{bindingId}:{}),...(run?{runId:run}:{}),...extra});
  const r=await fetch(endpoint+"?"+q,{cache:"no-store",signal}),v=await r.json();if(!r.ok)throw {status:r.status,code:v.error};if(v.format!=="karda.source-management.v1"||v.kbId!==kbId)throw Error("invalid");setView(v);
 }
 async function work(fn:(signal:AbortSignal)=>Promise<void>){
  if(lock.current)return;lock.current=true;const id=++ticket.current;abort.current?.abort();const ctl=new AbortController();abort.current=ctl;setBusy(true);setError(0);setCode("");setSaved(false);setView(null);setPreview(null);setConfirm(false);setSelected([]);setDocs([]);
  try{await fn(ctl.signal);}catch(e){if(id===ticket.current){const v=e as {status?:number;code?:string};setError(v.status??503);setCode(v.code??"");setView(null);setPreview(null);if([400,401,403,404,409].includes(v.status??0))pending.current=null;if([401,403].includes(v.status??0))setManifest("");}}
  finally{if(id===ticket.current){lock.current=false;setBusy(false);}}
 }
 async function load(bindingId=binding,run=runId,extra:Record<string,string>={}){pending.current=null;setBinding(bindingId);setRunId(run);await work(s=>get(s,bindingId,run,extra));}
 async function post(c:SourceCommand,signal:AbortSignal){const r=await fetch(endpoint,{method:"POST",cache:"no-store",signal,headers:{"Content-Type":"application/json"},body:JSON.stringify(c)}),v=await r.json();if(!r.ok)throw {status:r.status,code:v.error};return v;}
 async function execute(c:SourceCommand){pending.current=c;await work(async s=>{
  const v=await post(c,s);pending.current=null;const b=c.action==='create'?c.id:binding,r=c.action==='stage'?c.id:runId;setBinding(b);setRunId(c.action==='create'?"":r);await get(s,b,c.action==='create'?"":r);
  if(c.action==='revoke_preview')setPreview(v);else setSaved(true);
 });}
 async function executeBatch(){const items=view?.items.filter(i=>(i.state==='queued'||i.state==='failed'||(i.state==='running'&&!!i.lease_until&&Date.parse(i.lease_until)<=Date.now()))&&i.attempt<3)??[];
  await work(async s=>{for(const i of items){const c:SourceCommand={action:"execute",bindingId:binding,runId,itemId:i.id};pending.current=c;await post(c,s);pending.current=null;}
   await get(s);setSaved(true);
  });
 }
 async function files(list:FileList|null){if(!list)return;edit();const epoch=fileTicket.current;setManifest("");try{
  const files=Array.from(list);if(!files.length||files.length>50||files.some(f=>!f.size||f.size>8*1024*1024)||files.reduce((n,f)=>n+f.size,0)>16*1024*1024||new Set(files.map(f=>f.name)).size!==files.length)throw Error("invalid");
  const items:SourceItem[]=[];for(const file of files){const bytes=new Uint8Array(await file.arrayBuffer()),hash=new Uint8Array(await crypto.subtle.digest('SHA-256',bytes));let binary='';for(let offset=0;offset<bytes.length;offset+=16384)binary+=String.fromCharCode(...bytes.subarray(offset,offset+16384));
   items.push({id:crypto.randomUUID(),sourceDocId:file.name,sourceVersion:version,event:'upsert',title:file.name,mime:file.type||'application/octet-stream',bytes:btoa(binary),contentHash:Array.from(hash).map(b=>b.toString(16).padStart(2,'0')).join('')});
  }if(epoch===fileTicket.current){setManifest(JSON.stringify(items));setError(0);setCode("");}
 }catch{if(epoch===fileTicket.current){setManifest("");setError(400);setCode("source_invalid_files");}}}
 function template(){const data=[{id:crypto.randomUUID(),sourceDocId:"replace-with-stable-source-id",sourceVersion:version,event:"delete",title:"Deleted source document"}],url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'})),a=document.createElement('a');a.href=url;a.download='source-delete-manifest.json';a.click();URL.revokeObjectURL(url);}
 function stage(){try{const items=JSON.parse(manifest);void execute({action:"stage",bindingId:binding,id:crypto.randomUUID(),mode:current!.mode as "backfill"|"incremental",items,note:note.trim()});}catch{setError(400);setCode("source_invalid_manifest");}}
 if(error===401)return <SignInGate from={"/assets/"+kbId+"/sources"}/>;
 const field="block w-full rounded border p-sm";
 return <div className="flex min-w-0 flex-col gap-md" aria-busy={busy}><PageHead title={m.title}/><p>{m.hint}</p><p>{m.boundary}</p><p>{m.acl}</p><p>{m.charge}</p>
  <div className="flex flex-wrap gap-md"><Link href={"/assets/"+encodeURIComponent(kbId)}>{m.back}</Link><Button variant="outline" disabled={busy} onClick={()=>void load()}>{m.reload}</Button></div>
  {error!==0&&<Banner tone="danger" title={error===403?m.denied:error===409?m.changed:error===400?m.invalid:m.unavailable}/>}{code&&<p role="alert">{m.code}: <code>{code}</code></p>}{saved&&<Banner tone="success" title={m.saved}/>}{busy&&<p role="status">{m.loading}</p>}{error>=500&&pending.current&&<Button disabled={busy} onClick={()=>void execute(pending.current!)}>{m.retrySame}</Button>}
  <fieldset disabled={busy} className="grid gap-sm rounded border p-md"><label>{m.connector}<select aria-label={m.connector} className={field} value={connector} onChange={e=>{edit();setConnector(e.target.value as "api"|"arda");}}><option value="api">{m.api}</option><option value="arda">{m.arda}</option></select></label>
   <label>{m.external}<input maxLength={255} className={field} value={external} onChange={e=>{edit();setExternal(e.target.value);}}/></label><label>{m.note}<textarea maxLength={2000} className={field} value={note} onChange={e=>{edit();setNote(e.target.value);}}/></label>
   <label className="flex gap-sm"><input type="checkbox" checked={accept} onChange={e=>setAccept(e.target.checked)}/>{m.accept}</label><Button disabled={!external.trim()||!note.trim()||!accept} onClick={()=>void execute({action:'create',id:crypto.randomUUID(),connectorCode:connector,externalSourceId:external.trim(),note:note.trim(),acceptLibraryScope:true})}>{m.create}</Button>
  </fieldset>
  <section className="grid gap-sm">{view?.bindings.map(b=><article key={b.id} className="grid min-w-0 gap-sm rounded border p-md"><h2>{b.external_source_id}</h2><p className="break-all">{b.connector_code} / {b.id}</p><p>{text(b.state)} / {m[b.mode as 'backfill'|'incremental']} / {m[b.readiness]}</p><p>{m.documents}: {b.documents} / {m.failures}: {b.failedDocuments} / {m.pending}: {b.pendingItems}</p><Button disabled={busy} variant="outline" onClick={()=>void load(b.id,"")}>{m.choose}</Button></article>)}</section>
  {current&&<section className="grid min-w-0 gap-md rounded border p-md"><h2>{current.external_source_id}</h2><p>{m.revision}: {current.revision}</p><p>{m.pauseHint}</p><p>{m.finishHint}</p>
   <label className="flex gap-sm"><input type="checkbox" disabled={busy} checked={confirm} onChange={e=>setConfirm(e.target.checked)}/>{m.confirm}</label>
   <div className="flex flex-wrap gap-sm">{current.state!=='revoked'&&<><Button disabled={busy||!confirm||!note.trim()} variant="outline" onClick={()=>void execute({action:current.state==='paused'?'resume':'pause',bindingId:binding,eventId:crypto.randomUUID(),expectedRevision:current.revision,note:note.trim()})}>{current.state==='paused'?m.resume:m.pause}</Button>
    {current.mode==='backfill'&&current.readiness==='ready'&&<Button disabled={busy||!confirm||!note.trim()||current.state!=='active'} variant="outline" onClick={()=>void execute({action:'finish_backfill',bindingId:binding,eventId:crypto.randomUUID(),expectedRevision:current.revision,note:note.trim()})}>{m.finish}</Button>}
    <Button disabled={busy} variant="outline" onClick={()=>void execute({action:'revoke_preview',bindingId:binding})}>{m.preview}</Button></>}
   </div>
   {preview&&<div className="grid gap-sm"><p>{m.revokeHint}</p><p>{m.documents}: {preview.documents} / {m.pending}: {preview.pendingItems}</p><Button disabled={busy||!confirm||!note.trim()} onClick={()=>void execute({action:'revoke',bindingId:binding,eventId:crypto.randomUUID(),expectedRevision:preview.revision,previewHash:preview.previewHash,note:note.trim()})}>{m.revoke}</Button></div>}
   {current.readiness==='ready'&&current.state!=='revoked'&&<fieldset disabled={busy||current.state!=='active'} className="grid gap-sm rounded border p-sm"><label>{m.version}<input type="number" min={1} max={2147483646} className={field} value={version} onChange={e=>{edit();setVersion(Number(e.target.value));setManifest("");}}/></label><label>{m.upload}<input type="file" multiple className={field} onChange={e=>void files(e.target.files)}/></label>
    <label>{m.manifest}<textarea rows={4} className={field} value={manifest} onChange={e=>{edit();setManifest(e.target.value);}}/></label><p>{m.manifestHint}</p><Button variant="outline" onClick={template}>{m.template}</Button><Button disabled={!manifest.trim()||!note.trim()} onClick={stage}>{m.stage}</Button>
   </fieldset>}
   <h3>{m.runs}</h3>{view?.runs.map(r=><article key={r.id} className="rounded border p-sm"><p className="break-all">{r.id} / {text(r.state)} / {m.progress}: {r.applied} / {r.total} / {r.failed}</p><p>{r.note}</p><Button disabled={busy} variant="outline" onClick={()=>void load(binding,r.id)}>{m.details}</Button></article>)}{view?.nextBefore&&<Button disabled={busy} variant="outline" onClick={()=>void load(binding,"",{before:view.nextBefore!})}>{m.more}</Button>}
   {runId&&<section className="grid gap-sm"><h3>{m.items}</h3><p className="break-all">{m.runId}: {runId}</p><div className="flex flex-wrap gap-sm"><Button disabled={busy||current.state!=='active'||!confirm} onClick={()=>void executeBatch()}>{m.execute}</Button><Button variant="outline" disabled={busy||!selected.length||!note.trim()||!confirm} onClick={()=>void execute({action:'retry',bindingId:binding,runId,itemIds:selected,eventId:crypto.randomUUID(),note:note.trim()})}>{m.retry}</Button>
    <Button variant="outline" disabled={busy||!note.trim()||!confirm||currentRun?.state==='done'} onClick={()=>void execute({action:'cancel_run',bindingId:binding,runId,eventId:crypto.randomUUID(),note:note.trim()})}>{m.cancel}</Button></div>
    {view?.items.map(i=><article key={i.id} className="grid min-w-0 gap-xs rounded border p-sm"><label className="flex gap-sm"><input type="checkbox" disabled={busy||i.state!=='failed'} checked={selected.includes(i.id)} onChange={e=>setSelected(e.target.checked?[...selected,i.id]:selected.filter(id=>id!==i.id))}/>{m.selected} {i.title}</label><p className="break-all">{m.sourceId}: {i.source_doc_id} / v{i.source_version} / {i.event}</p><p>{m.state}: {text(i.state)} / {m.attempt}: {i.attempt} / 3 / {m.outcome}: {i.outcome?text(i.outcome):'-'}</p>{i.lease_until&&<p>{m.lease}: {i.lease_until}</p>}{i.error_code&&<p>{m.code}: {i.error_code}</p>}<p>{m.processing}: {i.processing_state??'-'}</p>
     {i.task_id&&<Link href={"/pipeline/tasks/"+i.task_id}>{m.task}</Link>}{i.document_id&&<Link href={"/assets/"+kbId+"/maintenance?documentId="+i.document_id}>{m.knowledge}</Link>}
     {['queued','failed','running'].includes(i.state)&&<Button disabled={busy||current.state!=='active'||i.attempt>=3||(i.state==='running'&&!!i.lease_until&&Date.parse(i.lease_until)>Date.now())||!confirm} variant="outline" onClick={()=>void execute({action:'execute',bindingId:binding,runId,itemId:i.id})}>{m.executeOne}</Button>}
    </article>)}
   </section>}
   <h3>{m.documents}</h3><Button variant="outline" disabled={busy||!docs.length||!confirm||!note.trim()} onClick={()=>void execute({action:'retry_processing',bindingId:binding,documentIds:docs,eventId:crypto.randomUUID(),note:note.trim()})}>{m.retry_processing}</Button>
   {view?.documents.map(d=><article key={d.id} className="rounded border p-sm"><label><input type="checkbox" disabled={busy||!['failed','processing'].includes(d.content_state)} checked={docs.includes(d.id)} onChange={e=>setDocs(e.target.checked?[...docs,d.id]:docs.filter(id=>id!==d.id))}/> {d.title}</label><p className="break-all">{d.source_doc_id} / v{d.source_version} / {d.content_state}</p>{d.task_id&&<Link href={"/pipeline/tasks/"+d.task_id}>{m.task}</Link>} <Link href={"/assets/"+kbId+"/maintenance?documentId="+d.id}>{m.knowledge}</Link></article>)}{view?.nextDocumentBefore&&<Button disabled={busy} variant="outline" onClick={()=>void load(binding,runId,{documentBefore:view.nextDocumentBefore!})}>{m.moreDocs}</Button>}
   <h3>{m.history}</h3>{view?.history.map(h=><p key={h.revision} className="break-words">{h.revision} / {text(h.action)} / {h.created_at} / {h.note}</p>)}{view?.nextHistoryBefore&&<Button disabled={busy} variant="outline" onClick={()=>void load(binding,runId,{historyBefore:String(view.nextHistoryBefore)})}>{m.older}</Button>}
  </section>}
 </div>;
}
