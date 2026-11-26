"use client";
import {useEffect,useRef,useState} from "react";
import Link from "next/link";
import {Banner,Button} from "@vxture/design-system";
import {PageHead} from "../../../_shell/PageHead";
import {SignInGate} from "../../../_lib/ui";
import {useMessages} from "../../../_i18n/useMessages";
import {pilots} from "../../../_i18n/messages/pilots";
import {PILOT_VERDICTS,type PilotVerdict,type PilotCommand,type PilotRow,type PilotComparison,type PilotEvent,type PilotObservation} from "../../../kb/semantic/pilot";
export function PilotsClient(){
  const m=useMessages(pilots),[kb,setKb]=useState(""),[title,setTitle]=useState(""),[query,setQuery]=useState(""),[topK,setTopK]=useState(10),[note,setNote]=useState(""),
    [rows,setRows]=useState<PilotRow[]>([]),[selected,setSelected]=useState<PilotRow|null>(null),[comparison,setComparison]=useState<PilotComparison|null>(null),
    [observations,setObservations]=useState<PilotObservation[]>([]),[history,setHistory]=useState<PilotEvent[]>([]),[next,setNext]=useState<string|null>(null),[nextHistory,setNextHistory]=useState<number|null>(null),
    [verdict,setVerdict]=useState<PilotVerdict>("equivalent"),[confirm,setConfirm]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(0),[code,setCode]=useState(""),[saved,setSaved]=useState(false),[libraries,setLibraries]=useState<{id:string;name:string}[]>([]);
  const sequence=useRef(0),abort=useRef<AbortController|null>(null),lock=useRef(false),pending=useRef<PilotCommand|null>(null),endpoint="/api/knowledge-pilots";
  useEffect(()=>{const ctl=new AbortController();fetch("/api/kb",{cache:"no-store",signal:ctl.signal}).then(async r=>{if(r.ok){const v=await r.json();if(Array.isArray(v.knowledgeBases))setLibraries(v.knowledgeBases);}}).catch(()=>{});return()=>{ctl.abort();sequence.current++;abort.current?.abort();};},[]);
  function edit(){pending.current=null;setSaved(false);setConfirm(false);}
  async function read(signal:AbortSignal,id?:string,before?:string,historyBefore?:number){
    const p=new URLSearchParams({kbId:kb.trim(),...(id?{id}:{}),...(before?{before}:{}),...(historyBefore?{historyBefore:String(historyBefore)}:{})});
    const r=await fetch(endpoint+"?"+p,{cache:"no-store",signal}),v=await r.json();if(!r.ok)throw {status:r.status,code:v.error};
    if(v.format!=="karda.pilots.v1"||!Array.isArray(v.cases))throw Error("invalid");
    if(id){setSelected(v.cases[0]);setObservations(v.observations);setHistory(v.history);setNextHistory(v.nextHistoryBefore);}else{setRows(v.cases);setNext(v.nextBefore);}
  }
  async function run(work:(signal:AbortSignal)=>Promise<void>){
    if(lock.current)return;lock.current=true;const ticket=++sequence.current;abort.current?.abort();const ctl=new AbortController();abort.current=ctl;
    setBusy(true);setError(0);setCode("");setSaved(false);setComparison(null);setConfirm(false);setRows([]);setSelected(null);setObservations([]);setHistory([]);setNext(null);setNextHistory(null);
    try{await work(ctl.signal);}catch(e){if(ticket===sequence.current){const v=e as {status?:number;code?:string};setError(v.status??503);setCode(v.code??"");setComparison(null);setSelected(null);setRows([]);setObservations([]);setHistory([]);if([400,401,403,404,409].includes(v.status??0))pending.current=null;}}
    finally{if(ticket===sequence.current){lock.current=false;setBusy(false);}}
  }
  async function load(id?:string,before?:string,historyBefore?:number){pending.current=null;await run(signal=>read(signal,id,before,historyBefore));}
  async function execute(command:PilotCommand){pending.current=command;await run(async signal=>{
    const r=await fetch(endpoint,{method:"POST",cache:"no-store",signal,headers:{"Content-Type":"application/json"},body:JSON.stringify(command)}),v=await r.json();if(!r.ok)throw {status:r.status,code:v.error};
    pending.current=null;await read(signal);await read(signal,command.id);
    if(command.action==="compare"){if(v.format!=="karda.pilot-comparison.v1"||v.id!==command.id||v.observationId!==command.observationId)throw Error("invalid");setComparison(v);}else setSaved(true);
  });}
  const state=(s:PilotRow["state"])=>m[s],field="block w-full rounded border p-sm";
  const current=comparison?.published,summary=comparison?.summary,nodes=new Map(current?.nodes.map(n=>[n.id,n])??[]),statements=new Map(current?.statements.map(s=>[s.id,s.statement])??[]),passages=new Map(current?.passages.map(p=>[p.evidenceId,p.excerpt])??[]);
  if(error===401)return <SignInGate from="/evaluation/pilots"/>;
  return <div className="flex min-w-0 flex-col gap-md" aria-busy={busy}>
    <PageHead title={m.title}/><p>{m.hint}</p><p className="text-body-sm text-muted-foreground">{m.scope}</p><p>{m.governance}</p>
    <div className="flex flex-wrap gap-md"><Link href="/knowledge-control">{m.control}</Link><Link href="/pipeline/rebuild">{m.rebuild}</Link>{kb.trim()&&<Link href={"/assets/"+encodeURIComponent(kb.trim())}>{m.assets}</Link>}</div>
    {error!==0&&<Banner tone="danger" title={error===403?m.denied:error===409?m.changed:error===400?m.invalid:m.unavailable}/>}{code&&<p role="alert">{m.code}: <code>{code}</code></p>}
    {saved&&<Banner tone="success" title={m.saved}/>}{error>=500&&pending.current&&<Button disabled={busy} onClick={()=>void execute(pending.current!)}>{m.retry}</Button>}{busy&&<p role="status">{m.loading}</p>}
    <fieldset disabled={busy} className="grid min-w-0 gap-sm rounded border p-md">
      <label>{m.library}<input list="pilot-libraries" className={field} value={kb} onChange={e=>{edit();setKb(e.target.value);setRows([]);setSelected(null);setComparison(null);setHistory([]);setObservations([]);setNext(null);setNextHistory(null);}}/></label><datalist id="pilot-libraries">{libraries.map(l=><option key={l.id} value={l.id}>{l.name}</option>)}</datalist>
      <Button variant="outline" disabled={!kb.trim()} onClick={()=>void load()}>{m.reload}</Button>
      <form className="grid gap-sm" onSubmit={e=>{e.preventDefault();void execute({action:"create",id:crypto.randomUUID(),kbId:kb.trim(),title:title.trim(),query:query.trim(),topK,note:note.trim()});}}>
        <label>{m.name}<input required maxLength={200} className={field} value={title} onChange={e=>{edit();setTitle(e.target.value);}}/></label>
        <label>{m.query}<textarea required maxLength={500} className={field} value={query} onChange={e=>{edit();setQuery(e.target.value);}}/></label>
        <label>{m.topK}<input type="number" min={1} max={20} className={field} value={topK} onChange={e=>{edit();setTopK(Number(e.target.value));}}/></label>
        <label>{m.note}<textarea required maxLength={2000} className={field} value={note} onChange={e=>{edit();setNote(e.target.value);}}/></label>
        <Button type="submit" disabled={!kb.trim()||!title.trim()||!query.trim()||!note.trim()}>{m.create}</Button>
      </form>
    </fieldset>
    <section className="grid min-w-0 gap-sm">{!rows.length&&!selected&&!busy&&<p>{m.empty}</p>}{rows.map(r=><article key={r.id} className="grid gap-sm rounded border p-md"><h2>{r.title}</h2><p className="break-words">{r.query}</p><p>{m.state}: {state(r.state)} / {m.revision}: {r.revision}{r.verdict&&" / "+m[r.verdict]}</p><Button disabled={busy} variant="outline" onClick={()=>void load(r.id)}>{m.detail}</Button></article>)}{next&&<Button disabled={busy} variant="outline" onClick={()=>void load(undefined,next)}>{m.more}</Button>}</section>
    {selected&&<section className="grid min-w-0 gap-sm rounded border p-md"><h2>{selected.title}</h2><p className="break-words">{selected.query}</p><p className="break-all">{selected.id}</p><p>{m.state}: {state(selected.state)} / {m.revision}: {selected.revision} {selected.verdict&&m[selected.verdict]}</p><p>{selected.note}</p>
      <Button disabled={busy} variant="outline" onClick={()=>void execute({action:"compare",kbId:kb.trim(),id:selected.id,observationId:crypto.randomUUID()})}>{m.compare}</Button>
      {comparison&&summary&&<section className="grid min-w-0 gap-md"><p>{m.checked}: {comparison.checkedAt}</p><p className="break-all">{m.fingerprint}: {comparison.fingerprint}</p>
        <p>{m.counts}: {summary.sourceCount} / {summary.factCount} / {summary.sharedDocuments}</p><p>{m.coverage}: {summary.searchedDocuments} / {summary.matchedPassages} / {summary.matchedRelations}</p>
        {(summary.sourcePartial||summary.publishedPartial)&&<Banner tone="warning" title={m.partial}/>}{(summary.sourceTruncated||summary.publishedTruncated)&&<p>{m.truncated}</p>}
        <div className="grid min-w-0 gap-md lg:grid-cols-2"><section className="grid min-w-0 content-start gap-sm"><h3>{m.baseline}</h3>{!comparison.baseline.items.length&&<p>{m.noMatches}</p>}
          {comparison.baseline.items.map(i=><article className="min-w-0 rounded border p-sm" key={i.documentId+":"+i.start}><h4>{i.title}</h4><blockquote className="whitespace-pre-wrap break-words">{i.text}</blockquote><p className="break-all">{i.documentId} / {m.version}: {i.documentVersion} / {i.start}:{i.end}{i.pages.length?" / "+m.pages+": "+i.pages.join(", "):""}</p></article>)}</section>
          <section className="grid min-w-0 content-start gap-sm"><h3>{m.published}</h3>{!current?.edges.length&&<p>{m.noMatches}</p>}{current?.edges.map(edge=><article key={edge.id} className="min-w-0 rounded border p-sm"><h4 className="break-words">{nodes.get(edge.sourceId)?.label} / {edge.type} / {nodes.get(edge.targetId)?.label}</h4>{edge.assertionIds.map(id=><div key={id}><p className="break-words">{statements.get(id)}</p>{current.evidence.filter(e=>current.assertions.find(a=>a.id===id)?.evidenceIds.includes(e.id)).map(e=><blockquote key={e.id} className="border-l-2 pl-sm"><p className="whitespace-pre-wrap break-words">{passages.get(e.id)}</p><p className="break-all">{e.documentId} / {m.version}: {e.documentVersion} / {e.start}:{e.end}{e.pages?.length?" / "+m.pages+": "+e.pages.join(", "):""}</p></blockquote>)}</div>)}</article>)}</section>
        </div>
      </section>}
      <label>{m.verdict}<select aria-label={m.verdict} className={field} disabled={busy} value={verdict} onChange={e=>{edit();setVerdict(e.target.value as PilotVerdict);}}>{PILOT_VERDICTS.map(v=><option key={v} value={v}>{m[v]}</option>)}</select></label>
      <label className="flex gap-sm"><input type="checkbox" disabled={busy} checked={confirm} onChange={e=>setConfirm(e.target.checked)}/>{m.confirm}</label>
      <div className="flex flex-wrap gap-sm">{selected.state!=="closed"&&<Button disabled={busy||!confirm||!note.trim()||!comparison||!!summary?.sourcePartial||!!summary?.publishedPartial} onClick={()=>void execute({action:"review",kbId:kb.trim(),id:selected.id,observationId:comparison!.observationId,eventId:crypto.randomUUID(),expectedRevision:selected.revision,verdict,note:note.trim()})}>{m.review}</Button>}
        {selected.state==="reviewed"&&<Button variant="outline" disabled={busy||!confirm||!note.trim()} onClick={()=>void execute({action:"close",kbId:kb.trim(),id:selected.id,eventId:crypto.randomUUID(),expectedRevision:selected.revision,note:note.trim()})}>{m.close}</Button>}
        {selected.state!=="open"&&<Button variant="outline" disabled={busy||!confirm||!note.trim()} onClick={()=>void execute({action:"reopen",kbId:kb.trim(),id:selected.id,eventId:crypto.randomUUID(),expectedRevision:selected.revision,note:note.trim()})}>{m.reopen}</Button>}
      </div><h3>{m.observations}</h3><p>{m.historyHint}</p>{observations.map(o=><p key={o.id} className="break-all">{o.created_at} / {o.id} / {o.summary.sourceCount} : {o.summary.factCount} / {o.fingerprint}</p>)}
      <h3>{m.history}</h3>{history.map(e=><p key={e.revision} className="break-words">{e.revision} / {m[e.action as "review"|"close"|"reopen"]} / {e.verdict&&m[e.verdict]} / {e.created_at} / {e.note}</p>)}{nextHistory&&<Button disabled={busy} variant="outline" onClick={()=>void load(selected.id,undefined,nextHistory)}>{m.moreHistory}</Button>}
    </section>}
  </div>;
}
