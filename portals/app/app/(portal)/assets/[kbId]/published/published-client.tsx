"use client";
import {useEffect,useMemo,useRef,useState} from "react";
import Link from "next/link";
import {Banner,Button,Card,CardContent} from "@vxture/design-system";
import {PageHead} from "../../../../_shell/PageHead";
import {useMessages} from "../../../../_i18n/useMessages";
import {semantic} from "../../../../_i18n/messages/semantic";
import {KnowledgeWindowClient,KnowledgeWindowError} from "../../../../_lib/knowledge-window";
import {SignInGate} from "../../../../_lib/ui";
import type {KnowledgePackage} from "../../../../kb/semantic/read-postgres";
import {knowledgeTopics,searchPublishedPassages} from "../../../../kb/semantic/knowledge-explorer";

export function PublishedKnowledgeClient({kbId,initialEntity=""}:{kbId:string;initialEntity?:string}){
  const m=useMessages(semantic),[entity,setEntity]=useState(""),[focus,setFocus]=useState("");
  const [value,setValue]=useState<KnowledgePackage|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState(0);
  const sequence=useRef(0);
  const windowClient=useRef<KnowledgeWindowClient|null>(null);if(!windowClient.current)windowClient.current=new KnowledgeWindowClient();
  const [observedAt,setObservedAt]=useState(""),[syncAction,setSyncAction]=useState("");
  const activeWindow=useRef({entity:initialEntity,cursor:"",history:[""]});
  const [pages,setPages]=useState<string[]>([""]);
  const [topic,setTopic]=useState(""),[query,setQuery]=useState("");
  const topics=useMemo(()=>value?knowledgeTopics(value):[],[value]);
  const found=useMemo(()=>value?searchPublishedPassages(value,query):{matches:[],total:0},[value,query]);
  useEffect(()=>{void load(initialEntity);return()=>{sequence.current++;windowClient.current?.clear();};
    // The server keys this component by library, discarding prior request state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[]);
  async function load(id:string,cursor="",history=[""]){
    const ticket=++sequence.current;setBusy(true);setError(0);setObservedAt("");setSyncAction("");setValue(null);setTopic("");setQuery("");
    try{
      const params=new URLSearchParams();params.set(id?"entity":"cursor",id||cursor);
      const result=await windowClient.current!.read(kbId,params);
      if(ticket===sequence.current&&result){setValue(result.knowledge);setObservedAt(result.observedAt);setSyncAction(result.action);setFocus(id);setEntity(id);setPages(history);activeWindow.current={entity:id,cursor,history};}
    }catch(error){if(ticket===sequence.current)setError(error instanceof KnowledgeWindowError?error.status:503);}
    finally{if(ticket===sequence.current)setBusy(false);}
  }
  if(error===401)return <SignInGate from={`/assets/${kbId}/published`}/>;
  const label=(id:string)=>value?.nodes.find(n=>n.id===id)?.label??id;
  return <div className="flex min-w-0 flex-col gap-md" aria-busy={busy}>
    <PageHead title={m.knowledgeTitle}/>
    <Button variant="outline" asChild><Link href={`/assets/${kbId}/topic-library`}>{m.topicLibraryTitle}</Link></Button>
    <Button variant="outline" asChild><Link href="/knowledge-control">{m.rolloutTitle}</Link></Button>
    <Link href={`/assets/${kbId}/knowledge`}>{m.back}</Link>
    <div className="flex flex-wrap gap-sm"><Button variant="outline" asChild><Link href={`/assets/${kbId}/graph`}>{m.graphTitle}</Link></Button>
      <Button variant="outline" asChild><Link href={`/assets/${kbId}/facts`}>{m.factSearchTitle}</Link></Button>
      <Button variant="outline" asChild><Link href={`/assets/${kbId}/source-search`}>{m.sourceSearchTitle}</Link></Button>
      <Button variant="outline" disabled={busy} onClick={()=>{const current=activeWindow.current;void load(current.entity,current.cursor,current.history);}}>{m.recheckKnowledge}</Button>
      {focus&&value?.nodes.some(n=>n.id===focus)&&<Button variant="outline" asChild><Link href={`/assets/${kbId}/graph?entity=${encodeURIComponent(focus)}`}>{m.entityGraph}</Link></Button>}
      {value&&<Button variant="outline" asChild><a href={`/api/kb/${kbId}/knowledge-package?format=markdown${focus?`&entity=${encodeURIComponent(focus)}`:`&cursor=${encodeURIComponent(pages.at(-1)??"")}`}`}>{m.exportKnowledge}</a></Button>}</div>
    <p className="text-body-sm text-muted-foreground">{m.knowledgeHint}</p>
    <Button disabled={busy} variant="outline" onClick={()=>void load("")}>{m.linkedEntities}</Button>
    <form onSubmit={e=>{e.preventDefault();void load(entity.trim());}} className="flex flex-wrap gap-sm">
      <label htmlFor="entity-id">{m.entityId}</label>
      <input id="entity-id" value={entity} onChange={e=>setEntity(e.target.value)} disabled={busy} required
        pattern="[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}" className="min-w-0 flex-1 rounded-md border border-border bg-background p-sm"/>
      <Button disabled={busy} type="submit">{m.openKnowledge}</Button>
    </form>
    {!!observedAt&&<p role="status" className="break-all text-body-sm text-muted-foreground">{m.knowledgeObserved}: <time dateTime={observedAt}>{observedAt}</time> / {syncAction==="unchanged"?m.knowledgeUnchanged:m.knowledgeReplaced}</p>}
    {busy&&<p role="status">{m.loading}</p>}
    {!!error&&<Banner tone="danger" title={error===403?m.packageDenied:error===400?m.invalidEntity:error===409?m.directoryChanged:m.unavailable}/>}
    {value&&<>
      <p className="break-all font-mono text-code-sm">{value.schema.namespace} / {value.schema.schemaId} / {value.schema.version}</p>
      {!focus&&value.directoryPage&&<><p className="text-body-sm text-muted-foreground">{m.directoryHint}</p><div className="flex flex-wrap items-center gap-sm">
        <p role="status">{m.directoryPage} {pages.length}</p>
        <Button variant="outline" disabled={busy||pages.length<2} onClick={()=>{const previous=pages.slice(0,-1);void load("",previous.at(-1)??"",previous);}}>{m.directoryPrevious}</Button>
        <Button variant="outline" disabled={busy||!value.directoryPage.nextCursor} onClick={()=>{const next=value.directoryPage!.nextCursor!;void load("",next,[...pages,next]);}}>{m.directoryNext}</Button>
      </div></>}
      {value.gaps.map(gap=><Banner key={gap} tone="warning" title={gap==="no_published_support"?m.noPublished:gap==="neighborhood_truncated"?m.packageTruncated:m.partialSources}/>)}
      <h2 className="break-words text-title-md">{focus?label(focus):m.linkedEntities}</h2>
      <nav aria-label={m.linkedEntities} className="flex flex-wrap gap-sm">{value.nodes.filter(n=>n.id!==focus).map(n=>
        <Button key={n.id} variant="outline" disabled={busy} onClick={()=>void load(n.id)}>{n.label}</Button>)}</nav>
      <section className="flex min-w-0 flex-col gap-sm" aria-label={m.topicTitle}>
        <h2 className="text-title-md">{m.topicTitle}</h2><p className="text-body-sm text-muted-foreground">{m.topicHint}</p>
        <div className="flex flex-wrap gap-sm">{topics.map(t=><Button key={t.type} variant={topic===t.type?"default":"outline"} aria-pressed={topic===t.type} onClick={()=>setTopic(topic===t.type?"":t.type)}>
          {t.type} ({t.relationIds.length} {m.relations} / {t.entityIds.length} {m.graphNodes})
        </Button>)}</div>
        {topic&&value.edges.filter(e=>e.type===topic).map(edge=><Card key={edge.id}><CardContent className="flex min-w-0 flex-col gap-sm p-md">
          <p className="break-words">{label(edge.sourceId)} &rarr; {edge.type} &rarr; {label(edge.targetId)}</p>
          <div className="flex flex-wrap gap-sm">{[...new Set([edge.sourceId,edge.targetId])].map(id=><Button key={id} variant="outline" onClick={()=>void load(id)}>{label(id)}</Button>)}</div>
          {edge.assertionIds.map(id=><p key={id} className="break-words text-body-sm">{value.statements.find(s=>s.id===id)?.statement}</p>)}
        </CardContent></Card>)}
      </section>
      <section className="flex min-w-0 flex-col gap-sm" aria-label={m.passageSearch}>
        <h2 className="text-title-md">{m.passageSearch}</h2><p className="text-body-sm text-muted-foreground">{m.passageSearchHint}</p>
        <label htmlFor="passage-query">{m.passageQuery}</label><input id="passage-query" value={query} maxLength={200} onChange={e=>setQuery(e.target.value)} className="min-w-0 rounded-md border border-border bg-background p-sm"/>
        {!!query.trim()&&<p role="status">{found.matches.length} / {found.total} {m.passageMatches}</p>}
        {found.matches.map(match=>{const evidence=value.evidence.find(e=>e.id===match.evidenceId)!;return <Card key={match.evidenceId}><CardContent className="flex min-w-0 flex-col gap-sm p-md">
          <blockquote className="break-words text-body-sm">{match.excerpt.slice(0,match.start)}<mark>{match.excerpt.slice(match.start,match.end)}</mark>{match.excerpt.slice(match.end)}</blockquote>
          <p className="break-all font-mono text-code-sm">{evidence.documentId} / v{evidence.documentVersion} / {evidence.start}:{evidence.end}{evidence.pages?.length?` / ${m.sourcePages} ${evidence.pages.join(", ")}`:""}</p>
          {value.edges.filter(e=>match.relationIds.includes(e.id)).map(e=><p key={e.id} className="break-words text-body-sm">{label(e.sourceId)} &rarr; {e.type} &rarr; {label(e.targetId)}</p>)}
        </CardContent></Card>;})}
      </section>
      {!!focus&&(["outgoing","incoming"] as const).map(direction=><section key={direction} className="flex min-w-0 flex-col gap-sm">
        <h3 className="text-title-sm">{m[direction]}</h3>
        {value.edges.filter(e=>direction==="outgoing"?e.sourceId===focus:e.targetId===focus).map(edge=><Card key={edge.id}>
          <CardContent className="flex min-w-0 flex-col gap-sm p-md">
            <p className="break-words">{label(edge.sourceId)} &rarr; {edge.type} &rarr; {label(edge.targetId)}</p>
            {edge.assertionIds.map(id=>{
              const assertion=value.assertions.find(a=>a.id===id)!;
              return <div key={id}><p className="break-words text-body-sm">{value.statements.find(s=>s.id===id)?.statement}</p>
                {value.evidence.filter(e=>assertion.evidenceIds.includes(e.id)).map(e=><blockquote key={e.id} className="border-l-2 border-border pl-sm text-body-sm">
                  <p className="break-words">{value.passages.find(p=>p.evidenceId===e.id)?.excerpt}</p>
                  <p className="break-all font-mono text-code-sm">{e.documentId} / v{e.documentVersion} / {e.start}:{e.end}{e.pages?.length?` / ${m.sourcePages} ${e.pages.join(", ")}`:""}</p>
                </blockquote>)}
              </div>;
            })}
          </CardContent></Card>)}
      </section>)}
    </>}
  </div>;
}
