"use client";
import {useEffect,useRef,useState} from "react";
import Link from "next/link";
import {Banner,Button,Card,CardContent} from "@vxture/design-system";
import {PageHead} from "../../../../_shell/PageHead";
import {useMessages} from "../../../../_i18n/useMessages";
import {semantic} from "../../../../_i18n/messages/semantic";
import {SignInGate} from "../../../../_lib/ui";
import type {KnowledgePackage} from "../../../../kb/semantic/read-postgres";

export function FactSearchClient({kbId}:{kbId:string}){
  const m=useMessages(semantic),[query,setQuery]=useState(""),[type,setType]=useState(""),[value,setValue]=useState<KnowledgePackage|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState(0);
  const sequence=useRef(0),controller=useRef<AbortController|null>(null);
  const [cursors,setCursors]=useState<string[]>([""]);
  useEffect(()=>{setValue(null);setCursors([""]);setBusy(false);setError(0);return ()=>{sequence.current++;controller.current?.abort();};},[kbId]);
  function reset(){sequence.current++;controller.current?.abort();setBusy(false);setError(0);setValue(null);setCursors([""]);}
  async function search(pages:string[]=[""]){
    const ticket=++sequence.current;controller.current?.abort();const current=new AbortController();controller.current=current;
    setBusy(true);setError(0);setValue(null);setCursors([""]);
    try{
      const response=await fetch(`/api/kb/${encodeURIComponent(kbId)}/published-search`,{method:"POST",headers:{"Content-Type":"application/json"},cache:"no-store",credentials:"same-origin",signal:current.signal,
        body:JSON.stringify({query,top_k:20,page_cursor:pages.at(-1)!,...(type.trim()?{relation_types:[type.trim()]}:{})})});
      if(ticket!==sequence.current)return;
      if(!response.ok){setError(response.status);return;}
      const result=await response.json();if(ticket===sequence.current){if(result.format!=="karda.published-search.v1"||result.mode!=="published_facts"||!result.knowledge?.search?.page)throw Error("invalid_response");setCursors(pages);setValue(result.knowledge);}
    }catch{if(ticket===sequence.current)setError(503);}finally{if(ticket===sequence.current)setBusy(false);}
  }
  if(error===401)return <SignInGate from={`/assets/${kbId}/facts`}/>;
  const nodes=new Map(value?.nodes.map(n=>[n.id,n])??[]),edges=new Map(value?.edges.map(e=>[e.id,e])??[]),assertions=new Map(value?.assertions.map(a=>[a.id,a])??[]),statements=new Map(value?.statements.map(a=>[a.id,a.statement])??[]),passages=new Map(value?.passages.map(p=>[p.evidenceId,p.excerpt])??[]);
  return <div className="flex min-w-0 flex-col gap-md" aria-busy={busy}>
    <PageHead title={m.factSearchTitle}/><p className="text-body-sm text-muted-foreground">{m.factSearchHint}</p>
    <div className="flex flex-wrap gap-sm"><Button variant="outline" asChild><Link href={`/assets/${kbId}/published`}>{m.knowledgeTitle}</Link></Button><Button variant="outline" asChild><Link href={`/assets/${kbId}/graph`}>{m.graphTitle}</Link></Button><Button variant="outline" asChild><Link href={`/assets/${kbId}/sources`}>{m.sourceSearchTitle}</Link></Button></div>
    <form onSubmit={e=>{e.preventDefault();void search();}} className="flex min-w-0 flex-col gap-sm">
      <label htmlFor="fact-query">{m.factQuery}</label><input id="fact-query" required maxLength={500} value={query} onChange={e=>{reset();setQuery(e.target.value);}} className="min-w-0 rounded-md border border-border bg-background p-sm"/>
      <label htmlFor="fact-type">{m.factType}</label><input id="fact-type" maxLength={128} value={type} onChange={e=>{reset();setType(e.target.value);}} className="min-w-0 rounded-md border border-border bg-background p-sm"/>
      <Button type="submit" disabled={busy||!query.trim()}>{m.factRun}</Button>
    </form>
    {busy&&<p role="status">{m.loading}</p>}{!!error&&<Banner tone="danger" title={error===403?m.packageDenied:error===409?m.factPageChanged:m.factUnavailable}/>}
    {value&&<>
      <p role="status">{m.factCount}: {value.search!.eligibleRelations} / {value.search!.matchedRelations} / {value.search!.items.length}</p>
      <p>{m.factPageHint}</p><div className="flex flex-wrap items-center gap-sm"><span>{m.factPage}: {cursors.length}</span>
        <Button variant="outline" disabled={busy||cursors.length<2} onClick={()=>void search(cursors.slice(0,-1))}>{m.factPrevious}</Button>
        <Button variant="outline" disabled={busy||!value.search!.page?.nextCursor} onClick={()=>void search([...cursors,value.search!.page!.nextCursor!])}>{m.factNext}</Button></div>
      {value.sourceStatus==="partial"&&<Banner tone="warning" title={m.partialSources}/>}
      {!value.search!.items.length&&<p>{m.factEmpty}</p>}
      {value.search!.items.map((item,index)=>{const edge=edges.get(item.relationId);if(!edge)return null;return <Card key={item.relationId}><CardContent className="flex min-w-0 flex-col gap-sm p-md">
        <h2 className="break-words text-title-sm">{(value.search!.page?.offset??0)+index+1}. {nodes.get(edge.sourceId)?.label} &rarr; {edge.type} &rarr; {nodes.get(edge.targetId)?.label}</h2>
        <p className="break-all font-mono text-code-sm">{edge.kbId} / {edge.id} / {m.factScore}: {item.score.toFixed(3)}</p>
        <div className="flex flex-wrap gap-sm">{[...new Set([edge.sourceId,edge.targetId])].map(id=><Button key={id} variant="outline" asChild><Link href={`/assets/${edge.kbId}/published?entity=${encodeURIComponent(id)}`}>{nodes.get(id)?.label}</Link></Button>)}<Button variant="outline" asChild><Link href={`/assets/${edge.kbId}/graph?entity=${encodeURIComponent(edge.sourceId)}`}>{m.entityGraph}</Link></Button></div>
        {edge.assertionIds.map(id=><div key={id}><p className="break-words">{statements.get(id)}</p>{value.evidence.filter(e=>assertions.get(id)?.evidenceIds.includes(e.id)).map(e=><blockquote key={e.id} className="border-l-2 border-border pl-sm text-body-sm"><p className="break-words">{passages.get(e.id)}</p><p className="break-all font-mono text-code-sm">{e.documentId} / v{e.documentVersion} / {e.start}:{e.end}{e.pages?.length?` / ${m.sourcePages} ${e.pages.join(", ")}`:""}</p></blockquote>)}</div>)}
      </CardContent></Card>;})}
    </>}
  </div>;
}
