"use client";
import {LibraryPicker,ResourcePicker} from "../../../_components/resource-picker";
import {useEffect,useRef,useState} from "react";
import Link from "next/link";
import {Banner,Button} from "@vxture/design-system";
import {PageHead} from "../../../_shell/PageHead";
import {useMessages} from "../../../_i18n/useMessages";
import {subscriptions} from "../../../_i18n/messages/subscriptions";
import {SignInGate} from "../../../_lib/ui";
import type {SubscriptionCommand,SubscriptionRow,SubscriptionEvent,DeliveryMetadata} from "../../../kb/semantic/subscription";
import type {KnowledgePackage} from "../../../kb/semantic/read-postgres";
interface Delivery {format:string;id:string;sequence:number;ackSequence:number;revision:string;observedAt:string;
  delivery?:DeliveryMetadata;knowledge:KnowledgePackage;events:SubscriptionEvent[];nextAfter:number|null}
export function SubscriptionsClient(){
  const m=useMessages(subscriptions),[rows,setRows]=useState<SubscriptionRow[]>([]),[next,setNext]=useState<string|null>(null),[delivery,setDelivery]=useState<Delivery|null>(null),
    [busy,setBusy]=useState(false),[error,setError]=useState(0),[notice,setNotice]=useState(false),[name,setName]=useState(""),[kb,setKb]=useState(""),[entity,setEntity]=useState(""),[confirm,setConfirm]=useState(false);
  const sequence=useRef(0),abort=useRef<AbortController|null>(null),locked=useRef(false),pending=useRef<SubscriptionCommand|null>(null);
  const endpoint="/api/knowledge-subscriptions";
  useEffect(()=>{void list();return()=>{sequence.current++;abort.current?.abort();};},[]);
  async function request(command:SubscriptionCommand,signal:AbortSignal){
    const response=await fetch(endpoint,{method:"POST",cache:"no-store",credentials:"same-origin",signal,headers:{"Content-Type":"application/json"},body:JSON.stringify(command)});
    if(!response.ok)throw {status:response.status};return response.json();
  }
  async function run(work:(signal:AbortSignal)=>Promise<void>){
    if(locked.current)return;locked.current=true;const ticket=++sequence.current;abort.current?.abort();const ctl=new AbortController();abort.current=ctl;
    setBusy(true);setError(0);setNotice(false);setDelivery(null);setConfirm(false);
    try{await work(ctl.signal);}catch(e){if(ticket===sequence.current){const status=(e as {status?:number}).status??503;setError(status);setRows([]);setDelivery(null);setConfirm(false);setNext(null);if([400,401,403,404,409].includes(status))pending.current=null;}}
    finally{if(ticket===sequence.current){locked.current=false;setBusy(false);}}
  }
  async function refreshList(signal:AbortSignal,before?:string){
    const value=await request({action:"list",...(before?{before}:{})},signal);if(value.format!=="karda.subscriptions.v1")throw Error("invalid");setRows(value.subscriptions);setNext(value.nextBefore);
  }
  async function list(before?:string){pending.current=null;setRows([]);await run(signal=>refreshList(signal,before));}
  async function execute(command:SubscriptionCommand){
    pending.current=command;
    await run(async signal=>{
      const result=await request(command,signal);pending.current=null;
      if(command.action==="poll"){
        if(result.format!=="karda.subscription-delivery.v1"||result.id!==command.id||!result.knowledge||!Array.isArray(result.events))throw Error("invalid");
        setDelivery(result);await refreshList(signal);
      }else{await refreshList(signal);setNotice(true);}
    });
  }
  function edit(){pending.current=null;setNotice(false);}
  if(error===401)return <SignInGate from="/channels/subscriptions"/>;
  return <div className="flex min-w-0 flex-col gap-md" aria-busy={busy}>
    <PageHead title={m.title}/><Link href="/channels/deliveries">{m.deliveryCenter}</Link><p>{m.hint}</p><p className="text-body-sm text-muted-foreground">{m.scope}</p>
    <div className="flex flex-wrap gap-sm"><Button variant="outline" disabled={busy} onClick={()=>void list()}>{m.refresh}</Button><Button variant="outline" asChild><Link href="/tools">{m.tools}</Link></Button></div>
    {error!==0&&<Banner tone="danger" title={error===403?m.denied:error===409?m.changed:m.unavailable}/>}{notice&&<Banner tone="success" title={m.saved}/>}
    {error>=500&&pending.current&&<Button disabled={busy} onClick={()=>void execute(pending.current!)}>{m.retry}</Button>}
    <form className="grid min-w-0 gap-sm rounded border p-md" onSubmit={e=>{e.preventDefault();void execute({action:"create",id:crypto.randomUUID(),name:name.trim(),window:{kb_id:kb.trim(),entity_ids:entity.split(/[\s,]+/).filter(Boolean),max_nodes:50,max_edges:100,max_hops:1}});}}>
      <h2>{m.create}</h2><label>{m.name}<input maxLength={120} className="block w-full rounded border p-sm" value={name} onChange={e=>{edit();setName(e.target.value);}}/></label>
      <LibraryPicker value={kb} disabled={busy} onChange={v=>{edit();setKb(v);setEntity("");}}/>
      <ResourcePicker kbId={kb} value={entity} multiple entity disabled={busy} onChange={v=>{edit();setEntity(v);}}/><p>{m.windowHint}</p>
      <Button type="submit" disabled={busy||!name.trim()||!kb.trim()}>{m.save}</Button>
    </form>
    <section className="grid min-w-0 gap-sm"><h2>{m.list}</h2>{!rows.length&&!busy&&<p>{m.empty}</p>}
      {rows.map(row=><article key={row.id} className="grid min-w-0 gap-sm rounded border p-md"><h3>{row.name}</h3>
        <p>{row.enabled?m.active:m.cancelled} / {m.sequence}: {row.sequence} / {m.ack}: {row.ack_sequence}</p><small className="break-all">{row.id}</small>
        <details><summary>{m.window}</summary><pre className="whitespace-pre-wrap break-words">{JSON.stringify(row.window,null,2)}</pre></details>
        <div className="flex flex-wrap gap-sm"><Button disabled={busy||!row.enabled} onClick={()=>void execute({action:"poll",id:row.id})}>{m.poll}</Button>
          <Button variant="outline" disabled={busy||!row.enabled} onClick={()=>void execute({action:"poll",id:row.id,after:0})}>{m.replay}</Button>
          <Button variant="outline" disabled={busy||!row.enabled} onClick={()=>void execute({action:"cancel",id:row.id})}>{m.cancel}</Button></div>
      </article>)}{next&&<Button variant="outline" disabled={busy} onClick={()=>void list(next!)}>{m.more}</Button>}
    </section>
    {delivery&&<section className="grid min-w-0 gap-sm rounded border p-md"><h2>{m.current}</h2>
      <p>{m.observed}: {delivery.observedAt} / {m.sequence}: {delivery.sequence} / {m.ack}: {delivery.ackSequence}</p>
      <p className="break-all">{delivery.revision}</p>{delivery.delivery&&["leased","retry","dead"].includes(delivery.delivery.delivery_status)&&<p><Link href="/channels/deliveries">{m.deliveryCenter}</Link></p>}<p>{m.revalidate}</p>
      <p>{m.nodes}: {delivery.knowledge.nodes.length} / {m.edges}: {delivery.knowledge.edges.length}</p>
      {delivery.knowledge.truncated&&<Banner tone="warning" title={m.truncated}/>}
      {delivery.knowledge.statements.map(s=><p key={s.id} className="whitespace-pre-wrap break-words">{s.statement}</p>)}
      <details><summary>{m.evidence}</summary>{delivery.knowledge.passages.map(p=><pre key={p.evidenceId} className="whitespace-pre-wrap break-words">{p.excerpt}</pre>)}</details>
      <h3>{m.events}</h3><p>{m.metadata}</p>{delivery.events.map(e=><p key={e.sequence} className="break-all">{e.sequence} / {e.revision} / {String(e.observedAt)}</p>)}
      {delivery.nextAfter!==null&&<Button variant="outline" disabled={busy} onClick={()=>void execute({action:"poll",id:delivery.id,after:delivery.nextAfter!})}>{m.nextEvents}</Button>}
      <label><input type="checkbox" checked={confirm} onChange={e=>setConfirm(e.target.checked)}/> {m.confirm}</label>
      <Button disabled={busy||!confirm||delivery.sequence===delivery.ackSequence||!!(delivery.delivery&&["leased","retry","dead"].includes(delivery.delivery.delivery_status))} onClick={()=>void execute({action:"ack",id:delivery.id,sequence:delivery.sequence,revision:delivery.revision,expectedAck:delivery.ackSequence})}>{m.acknowledge}</Button>
    </section>}
  </div>;
}
