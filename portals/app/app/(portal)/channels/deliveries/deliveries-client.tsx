"use client";
import {useEffect,useRef,useState} from "react";
import Link from "next/link";
import {Banner,Button} from "@vxture/design-system";
import {PageHead} from "../../../_shell/PageHead";
import {SignInGate} from "../../../_lib/ui";
import {useMessages} from "../../../_i18n/useMessages";
import {deliveries} from "../../../_i18n/messages/deliveries";
import type {SubscriptionCommand,SubscriptionRow,DeliveryMetadata} from "../../../kb/semantic/subscription";
import type {KnowledgePackage} from "../../../kb/semantic/read-postgres";
type Row=SubscriptionRow&DeliveryMetadata;
interface Lease {id:string;deliveryRevision:number;status:"leased";sequence:number;ackSequence:number;revision:string;attempt:number;leaseId:string;leaseUntil:string;knowledge:KnowledgePackage}
interface History {revision:number;action:string;status:DeliveryMetadata["delivery_status"];sequence:number;attempt:number;worker:string|null;note:string|null;reason:string|null;created_at:string}
const STATES=["ready","leased","retry","dead","done","cancelled"] as const;
export function DeliveriesClient(){
 const m=useMessages(deliveries),[rows,setRows]=useState<Row[]>([]),[next,setNext]=useState<string|null>(null),[filter,setFilter]=useState(""),[worker,setWorker]=useState("browser"),[note,setNote]=useState(""),
  [lease,setLease]=useState<Lease|null>(null),[history,setHistory]=useState<History[]>([]),[historyId,setHistoryId]=useState(""),[historyNext,setHistoryNext]=useState<number|null>(null),
  [confirm,setConfirm]=useState(false),[reason,setReason]=useState<"transient"|"permanent">("transient"),[busy,setBusy]=useState(false),[error,setError]=useState(0),[code,setCode]=useState(""),[outcome,setOutcome]=useState("");
 const lock=useRef(false),sequence=useRef(0),abort=useRef<AbortController|null>(null),pending=useRef<SubscriptionCommand|null>(null),endpoint="/api/knowledge-subscriptions";
 useEffect(()=>{void list();return()=>{sequence.current++;abort.current?.abort();};},[]);
 async function request(command:SubscriptionCommand,signal:AbortSignal){const r=await fetch(endpoint,{method:"POST",cache:"no-store",signal,headers:{"Content-Type":"application/json"},body:JSON.stringify(command)}),v=await r.json();if(!r.ok)throw {status:r.status,code:v.error};return v;}
 async function readList(signal:AbortSignal,before?:string){const v=await request({action:"list",...(before?{before}:{}),...(filter?{deliveryStatus:filter as DeliveryMetadata["delivery_status"]}:{})},signal);if(v.format!=="karda.subscriptions.v1"||!Array.isArray(v.subscriptions))throw Error("invalid");setRows(v.subscriptions);setNext(v.nextBefore);}
 async function run(work:(signal:AbortSignal)=>Promise<void>){
  if(lock.current)return;lock.current=true;const ticket=++sequence.current;abort.current?.abort();const ctl=new AbortController();abort.current=ctl;
  setBusy(true);setError(0);setCode("");setOutcome("");setRows([]);setNext(null);setLease(null);setConfirm(false);setHistory([]);setHistoryId("");setHistoryNext(null);
  try{await work(ctl.signal);}catch(e){if(ticket===sequence.current){const v=e as {status?:number;code?:string};setError(v.status??503);setCode(v.code??"");setRows([]);setLease(null);setHistory([]);setNext(null);if([400,401,403,404,409].includes(v.status??0))pending.current=null;}}
  finally{if(ticket===sequence.current){lock.current=false;setBusy(false);}}
 }
 async function list(before?:string){pending.current=null;await run(signal=>readList(signal,before));}
 async function execute(command:SubscriptionCommand){pending.current=command;await run(async signal=>{
  const v=await request(command,signal);pending.current=null;await readList(signal);
  if(command.action==="claim"&&v.status==="leased"){
   if(v.format!=="karda.subscription-lease.v1"||v.id!==command.id||!v.leaseId||!v.knowledge)throw Error("invalid");setLease(v);
  }else if(command.action==="delivery_history"){
   if(v.format!=="karda.subscription-history.v1"||v.id!==command.id||!Array.isArray(v.events))throw Error("invalid");setHistory(v.events);setHistoryId(v.id);setHistoryNext(v.nextBefore);
  }else setOutcome(v.status??"ready");
 });}
 const status=(value:string)=>m[value as "ready"|"leased"|"retry"|"dead"|"done"|"cancelled"|"idle"]??value;
 if(error===401)return <SignInGate from="/channels/deliveries"/>;
 return <div className="flex min-w-0 flex-col gap-md" aria-busy={busy}>
  <PageHead title={m.title}/><p>{m.hint}</p><p>{m.scope}</p><p className="text-body-sm text-muted-foreground">{m.safety}</p><p>{m.ephemeral}</p>
  <div className="flex flex-wrap gap-md"><Link href="/channels/subscriptions">{m.subscriptions}</Link><Link href="/tools">{m.tools}</Link></div>
  {error!==0&&<Banner tone="danger" title={error===403?m.denied:error===409?(/busy|pending/.test(code)?m.busyLease:m.changed):error===400?m.invalid:m.unavailable}/>}{code&&<p role="alert">{m.code}: <code>{code}</code></p>}
  {outcome&&<p role="status">{m.outcome}: {status(outcome)}</p>}{busy&&<p role="status">{m.loading}</p>}{error>=500&&pending.current&&<Button disabled={busy} onClick={()=>void execute(pending.current!)}>{m.retrySame}</Button>}
  <fieldset disabled={busy||!!lease} className="grid gap-sm rounded border p-md">
   <label>{m.filter}<select aria-label={m.filter} className="block w-full rounded border p-sm" value={filter} onChange={e=>{pending.current=null;setFilter(e.target.value);setRows([]);setNext(null);setHistory([]);setHistoryNext(null);setOutcome("");}}><option value="">{m.all}</option>{STATES.map(s=><option key={s} value={s}>{m[s]}</option>)}</select></label>
   <label>{m.worker}<input maxLength={80} className="block w-full rounded border p-sm" value={worker} onChange={e=>{pending.current=null;setWorker(e.target.value);}}/></label>
   <Button variant="outline" onClick={()=>void list()}>{m.reload}</Button>
  </fieldset>
  <label>{m.note}<textarea maxLength={2000} disabled={busy} className="block w-full rounded border p-sm" value={note} onChange={e=>{pending.current=null;setNote(e.target.value);setConfirm(false);}}/></label>
  <label className="flex gap-sm"><input type="checkbox" disabled={busy} checked={confirm} onChange={e=>setConfirm(e.target.checked)}/>{m.confirm}</label>
  <section className="grid min-w-0 gap-sm">{!rows.length&&!busy&&<p>{m.empty}</p>}{rows.map(r=><article key={r.id} className="grid min-w-0 gap-sm rounded border p-md"><h2>{r.name}</h2><p className="break-all">{r.id}</p>
   <p>{m.state}: {status(r.delivery_status)} / {m.revision}: {r.delivery_revision} / {m.attempt}: {r.delivery_attempt} / 3</p><p>{m.sequence}: {r.sequence} / {r.ack_sequence}</p>
   {r.delivery_worker&&<p>{m.worker}: {r.delivery_worker}</p>}{r.lease_until&&<p>{m.expiry}: {r.lease_until}</p>}{r.retry_after&&<p>{m.retryAfter}: {r.retry_after}</p>}
   <div className="flex flex-wrap gap-sm"><Button disabled={busy||!!lease||!r.enabled||!worker.trim()||r.delivery_status==="dead"||(r.delivery_status==="leased"&&!!r.lease_until&&Date.parse(r.lease_until)>Date.now())||(r.delivery_status==="retry"&&!!r.retry_after&&Date.parse(r.retry_after)>Date.now())} onClick={()=>void execute({action:"claim",id:r.id,requestId:crypto.randomUUID(),expectedDeliveryRevision:r.delivery_revision,worker:worker.trim()})}>{m.claim}</Button>
    <Button variant="outline" disabled={busy||!!lease} onClick={()=>void execute({action:"delivery_history",id:r.id})}>{m.history}</Button>
    {(["retry","dead"].includes(r.delivery_status))&&<Button variant="outline" disabled={busy||!!lease||!r.enabled||!confirm||!note.trim()} onClick={()=>void execute({action:"redrive",id:r.id,eventId:crypto.randomUUID(),expectedDeliveryRevision:r.delivery_revision,note:note.trim()})}>{m.redrive}</Button>}
   </div>
  </article>)}{next&&<Button disabled={busy||!!lease} variant="outline" onClick={()=>void list(next)}>{m.more}</Button>}</section>
  {lease&&<section className="grid min-w-0 gap-sm rounded border p-md"><h2>{m.current}</h2><p>{m.sequence}: {lease.sequence} / {lease.ackSequence} / {m.attempt}: {lease.attempt}</p><p>{m.expiry}: {lease.leaseUntil}</p><p className="break-all">{lease.revision}</p>
   {lease.knowledge.truncated&&<Banner tone="warning" title={m.limited}/>}{lease.knowledge.statements.map(s=><p key={s.id} className="whitespace-pre-wrap break-words">{s.statement}</p>)}
   <details><summary>{m.evidence}</summary>{lease.knowledge.evidence.map(e=><blockquote key={e.id} className="border-l-2 pl-sm"><p className="whitespace-pre-wrap break-words">{lease.knowledge.passages.find(p=>p.evidenceId===e.id)?.excerpt}</p><p className="break-all">{e.documentId} / v{e.documentVersion} / {e.start}:{e.end}</p></blockquote>)}</details>
   <label>{m.reason}<select aria-label={m.reason} disabled={busy} className="block w-full rounded border p-sm" value={reason} onChange={e=>{setReason(e.target.value as "transient"|"permanent");setConfirm(false);}}><option value="transient">{m.transient}</option><option value="permanent">{m.permanent}</option></select></label>
   <div className="flex flex-wrap gap-sm"><Button disabled={busy||!confirm} onClick={()=>void execute({action:"complete",id:lease.id,eventId:crypto.randomUUID(),leaseId:lease.leaseId,expectedDeliveryRevision:lease.deliveryRevision,sequence:lease.sequence,revision:lease.revision})}>{m.complete}</Button>
   <Button variant="outline" disabled={busy||!confirm} onClick={()=>void execute({action:"fail",id:lease.id,eventId:crypto.randomUUID(),leaseId:lease.leaseId,expectedDeliveryRevision:lease.deliveryRevision,reason})}>{m.fail}</Button></div>
  </section>}
  {historyId&&<section className="grid min-w-0 gap-sm rounded border p-md"><h2>{m.historyTitle}</h2><p className="break-all">{historyId}</p>{history.map(e=><article key={e.revision} className="rounded border p-sm"><p>{e.revision} / {e.action==="cancel"?m.cancelled:m[e.action as "claim"|"complete"|"fail"|"redrive"]} / {status(e.status)} / {m.attempt}: {e.attempt}</p><p>{m.sequence}: {e.sequence} / {e.created_at}</p>{e.worker&&<p>{m.worker}: {e.worker}</p>}{e.reason&&<p>{m.reason}: {m[e.reason as "transient"|"permanent"|"attempt_limit"]}</p>}{e.note&&<p className="break-words">{m.record}: {e.note}</p>}</article>)}{historyNext&&<Button disabled={busy} variant="outline" onClick={()=>void execute({action:"delivery_history",id:historyId,before:historyNext})}>{m.earlier}</Button>}</section>}
 </div>;
}
