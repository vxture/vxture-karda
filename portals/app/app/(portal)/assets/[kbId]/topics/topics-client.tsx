"use client";
import {useEffect,useRef,useState} from "react";
import Link from "next/link";
import {Banner,Button,Card,CardContent} from "@vxture/design-system";
import {PageHead} from "../../../../_shell/PageHead";
import {useMessages} from "../../../../_i18n/useMessages";
import {semantic} from "../../../../_i18n/messages/semantic";
import {SignInGate} from "../../../../_lib/ui";
import type {PostgresTopicDossiers} from "../../../../kb/semantic/topic-dossier-store";
type Result=Awaited<ReturnType<PostgresTopicDossiers["handle"]>>;

export function TopicsClient({kbId}:{kbId:string}){
  const m=useMessages(semantic),sequence=useRef(0),[data,setData]=useState<Result|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState(0),[type,setType]=useState("");
  const [notes,setNotes]=useState<Record<string,string>>({}),pending=useRef(new Map<string,string>());
  const [history,setHistory]=useState<string[]>([""]),[lookup,setLookup]=useState("");
  async function load(compose=false,action?:Record<string,unknown>,query="",trail=[""]){
    const ticket=++sequence.current;setBusy(true);setError(0);setData(null);setNotes({});
    try{
      const response=await fetch(`/api/kb/${encodeURIComponent(kbId)}/topics${compose||action?"":query}`,{method:compose||action?"POST":"GET",cache:"no-store",credentials:"same-origin",
        ...(compose||action?{headers:{"Content-Type":"application/json"},body:JSON.stringify(action??{id:crypto.randomUUID(),relationType:type})}:{})});
      if(!response.ok){if(ticket===sequence.current)setError(response.status);return;}
      const result=await response.json() as Result;if(ticket===sequence.current){setData(result);setHistory(compose||action?[result.focusedId?`?dossier=${result.focusedId}`:""]:trail);setType(t=>result.availableTypes.includes(t)?t:result.availableTypes[0]??"");}
    }catch{if(ticket===sequence.current)setError(503);}finally{if(ticket===sequence.current)setBusy(false);}
  }
  useEffect(()=>{void load();return()=>{sequence.current++;};
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[]);
  if(error===401)return <SignInGate from={`/assets/${kbId}/topics`}/>;
  return <div className="flex min-w-0 flex-col gap-md" aria-busy={busy}>
    <PageHead title={m.dossierTitle}/><p className="text-body-sm text-muted-foreground">{m.topicExportHint}</p><p className="text-body-sm text-muted-foreground">{m.dossierHint}</p>
    <div className="flex flex-wrap gap-sm"><Button variant="outline" disabled={busy} onClick={()=>void load(false,undefined,history.at(-1)??"",history)}>{m.refresh}</Button>
      <Button variant="outline" disabled={busy} onClick={()=>void load()}>{m.topicHistoryHome}</Button>
      <Button variant="outline" asChild><Link href={`/assets/${kbId}/published`}>{m.knowledgeTitle}</Link></Button>
      <Button variant="outline" asChild><Link href={`/assets/${kbId}/maintenance`}>{m.maintenanceTitle}</Link></Button></div>
    <form className="flex min-w-0 flex-wrap gap-sm" onSubmit={e=>{e.preventDefault();const query=`?dossier=${encodeURIComponent(lookup.trim())}`;void load(false,undefined,query,[query]);}}>
      <label htmlFor="topic-history-id">{m.topicHistoryId}</label><input id="topic-history-id" required value={lookup} onChange={e=>setLookup(e.target.value)} pattern="[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}" className="min-w-0 rounded-md border border-border bg-background p-sm"/>
      <Button disabled={busy} type="submit">{m.topicHistoryOpen}</Button>
    </form>
    {!!error&&<Banner tone="danger" title={error===403?m.denied:error===409?m.dossierChanged:m.unavailable}/>}
    {busy&&<p role="status">{m.loading}</p>}
    {data&&<>
      <p className="text-body-sm text-muted-foreground">{m.topicHistoryHint}</p>
      <div className="flex flex-wrap gap-sm"><Button variant="outline" disabled={busy||history.length<2} onClick={()=>{const trail=history.slice(0,-1);void load(false,undefined,trail.at(-1)??"",trail);}}>{m.topicHistoryBack}</Button>
        {data.nextCursor&&<Button variant="outline" disabled={busy} onClick={()=>{const query=`?before=${data.nextCursor}`;void load(false,undefined,query,[...history,query]);}}>{m.topicHistoryOlder}</Button>}</div>
      {data.truncated&&<Banner tone="warning" title={m.dossierTruncated}/>}
      <label htmlFor="dossier-type">{m.relationFilter}</label><select id="dossier-type" className="min-w-0 rounded-md border border-border bg-background p-sm" value={type} onChange={e=>setType(e.target.value)}>
        {data.availableTypes.map(t=><option key={t}>{t}</option>)}
      </select><Button disabled={!type||data.truncated} onClick={()=>void load(true)}>{m.dossierCompose}</Button>
      {data.duplicate&&<p role="status">{m.dossierDuplicate}</p>}
      {data.items.map(row=><Card key={row.id}><CardContent className="flex min-w-0 flex-col gap-sm p-md">
        <h2 className="text-title-md">{row.relationType} / {row.state==="current_draft"?m.dossierCurrent:m.dossierStale}</h2>
        <p className="break-all text-body-sm">{row.createdAt} / {row.createdBy}</p>
        <p className="break-all font-mono text-code-sm">{row.id}</p>
        {!data.focusedId&&<Button variant="outline" disabled={busy} onClick={()=>{const query=`?dossier=${row.id}`;void load(false,undefined,query,[...history,query]);}}>{m.topicHistoryOpen}</Button>}
        {row.payload&&<div className="flex flex-wrap gap-sm">{(["json","markdown"] as const).map(format=><Button key={format} variant="outline" asChild><a href={`/api/kb/${kbId}/topics?dossier=${row.id}&format=${format}`}>{format==="json"?m.topicExportJson:m.topicExportMarkdown}</a></Button>)}</div>}
        {row.payload&&<><p className="text-body-sm text-muted-foreground">{m.summaryHint}</p><Button disabled={busy} onClick={()=>{
          const id=pending.current.get(row.id)??crypto.randomUUID();pending.current.set(row.id,id);void load(false,{action:"generate",id,dossierId:row.id});
        }}>{m.summaryGenerate}</Button></>}
        {row.summaries?.map(summary=><section key={summary.id} className="flex min-w-0 flex-col gap-sm rounded-md border border-border p-sm">
          <p className="break-all font-mono text-code-sm">{summary.id}</p>
          <h3>{m.summaryTitle} / {summary.state==="stale"?m.dossierStale:summary.state==="pending"?m.pending:summary.state==="accept"?m.accept:summary.state==="reject"?m.reject:m.revise}</h3>
          {summary.payload?.paragraphs.map((p,i)=><div key={i}><p className="whitespace-pre-wrap break-words text-body-sm">{p.text}</p>
            <ul>{p.citations.map(id=>{const evidence=row.payload?.sections.flatMap(s=>s.statements.flatMap(a=>a.evidence)).find(e=>e.id===id);
              return <li key={id} className="break-words text-body-sm"><details><summary>{m.summaryCitation}: {id}</summary><p>{evidence?.excerpt}</p>
                <p className="break-all font-mono text-code-sm">{evidence?.documentId} / v{evidence?.version} / {evidence?.start}:{evidence?.end}{evidence?.pages.length?` / ${m.sourcePages} ${evidence.pages.join(", ")}`:""}</p></details></li>;})}</ul></div>)}
          {summary.state==="accept"&&summary.payload&&<div className="flex flex-wrap gap-sm">{(["json","markdown"] as const).map(format=><Button key={format} variant="outline" asChild><a href={`/api/kb/${kbId}/topics?dossier=${row.id}&summary=${summary.id}&format=${format}`}>{format==="json"?m.acceptedSummaryJson:m.acceptedSummaryMarkdown}</a></Button>)}</div>}
          {summary.note&&<p className="break-words text-body-sm">{m.note}: {summary.note}</p>}
          {summary.payload&&<><label htmlFor={`summary-note-${summary.id}`}>{m.note}</label><textarea id={`summary-note-${summary.id}`} maxLength={10000} value={notes[summary.id]??""} onChange={e=>setNotes(n=>({...n,[summary.id]:e.target.value}))} className="min-w-0 rounded-md border border-border bg-background p-sm"/>
            <div className="flex flex-wrap gap-sm">{(["accept","revise","reject"] as const).map(decision=><Button key={decision} variant="outline" disabled={busy||!notes[summary.id]?.trim()} onClick={()=>void load(false,{action:"review",id:summary.id,dossierId:row.id,expectedRevision:summary.revision,decision,note:notes[summary.id]})}>{m[decision]}</Button>)}</div></>}
        </section>)}
        {row.summaryNext&&<Button variant="outline" disabled={busy} onClick={()=>{const query=`?dossier=${row.id}&summary_before=${row.summaryNext}`;void load(false,undefined,query,[...history,query]);}}>{m.topicSummaryOlder}</Button>}
        {row.payload?.sections.map(section=><section key={section.relationId} className="flex min-w-0 flex-col gap-sm">
          <h3 className="break-words text-title-sm">{section.source.label} &rarr; {row.relationType} &rarr; {section.target.label}</h3>
          <div className="flex flex-wrap gap-sm">{[section.source,section.target].filter((n,i,a)=>a.findIndex(v=>v.id===n.id)===i).map(n=><Button key={n.id} variant="outline" asChild><Link href={`/assets/${kbId}/published?entity=${encodeURIComponent(n.id)}`}>{n.label}</Link></Button>)}<Button variant="outline" asChild><Link href={`/assets/${kbId}/graph?entity=${encodeURIComponent(section.source.id)}`}>{m.entityGraph}</Link></Button></div>
          {section.statements.map(s=><div key={s.id}><p className="break-words text-body-sm">{s.text}</p>{s.evidence.map(e=><blockquote key={e.id} className="border-l-2 border-border pl-sm text-body-sm">
            <p className="whitespace-pre-wrap break-words">{e.excerpt}</p><p className="break-all font-mono text-code-sm">{e.documentId} / v{e.version} / {e.start}:{e.end}{e.pages.length?` / ${m.sourcePages} ${e.pages.join(", ")}`:""}</p>
          </blockquote>)}</div>)}
        </section>)}
      </CardContent></Card>)}
      {!data.items.length&&<p>{m.dossierEmpty}</p>}{data.more&&<p>{m.dossierMore}</p>}
    </>}
  </div>;
}
