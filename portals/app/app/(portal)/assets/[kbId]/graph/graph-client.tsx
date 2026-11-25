"use client";
import {useEffect,useMemo,useRef,useState} from "react";
import Link from "next/link";
import {Banner,Button,Card,CardContent} from "@vxture/design-system";
import {PageHead} from "../../../../_shell/PageHead";
import {useMessages} from "../../../../_i18n/useMessages";
import {semantic} from "../../../../_i18n/messages/semantic";
import {KnowledgeWindowClient,KnowledgeWindowError} from "../../../../_lib/knowledge-window";
import {SignInGate} from "../../../../_lib/ui";
import {layoutGraph,layoutGroupedGraph,graphGroups,graphCommunities,graphPath} from "../../../../kb/semantic/graph-view";
import {useStructuralLayout} from "./use-structural-layout";
import {GraphCanvas} from "./graph-canvas";
import type {KnowledgePackage} from "../../../../kb/semantic/read-postgres";

export function GraphClient({kbId,initialEntity=""}:{kbId:string;initialEntity?:string}){
  const m=useMessages(semantic),[data,setData]=useState<KnowledgePackage|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState(0);
  const [selected,setSelected]=useState(""),[edgeId,setEdgeId]=useState(""),[filter,setFilter]=useState(""),[from,setFrom]=useState(""),[to,setTo]=useState("");
  const [search,setSearch]=useState(""),[wide,setWide]=useState(false);
  const [entityType,setEntityType]=useState(""),[groupId,setGroupId]=useState(""),[layoutMode,setLayoutMode]=useState("structural");
  const [communities,setCommunities]=useState(false);
  const [pages,setPages]=useState<string[]>([""]),[neighborhood,setNeighborhood]=useState(false);
  const sequence=useRef(0);
  const windowClient=useRef<KnowledgeWindowClient|null>(null);if(!windowClient.current)windowClient.current=new KnowledgeWindowClient();
  const [observedAt,setObservedAt]=useState(""),[syncAction,setSyncAction]=useState("");
  const activeWindow=useRef({entity:initialEntity,cursor:"",history:[""]});
  async function load(seed="",cursor="",history=[""]){
    const ticket=++sequence.current;setBusy(true);setError(0);setObservedAt("");setSyncAction("");setData(null);setSelected("");setEdgeId("");setFrom("");setTo("");setFilter("");setSearch("");setEntityType("");setGroupId("");
    try{
      const params=new URLSearchParams({nodes:"500",edges:"1000",hops:"2"});params.set(seed?"entity":"cursor",seed||cursor);
      const result=await windowClient.current!.read(kbId,params);
      if(ticket===sequence.current&&result){setData(result.knowledge);setObservedAt(result.observedAt);setSyncAction(result.action);setSelected(result.knowledge.nodes.some(n=>n.id===seed)?seed:"");setPages(history);setNeighborhood(Boolean(seed));activeWindow.current={entity:seed,cursor,history};}
    }catch(error){if(ticket===sequence.current)setError(error instanceof KnowledgeWindowError?error.status:503);}finally{if(ticket===sequence.current)setBusy(false);}
  }
  useEffect(()=>{void load(initialEntity);return()=>{sequence.current++;windowClient.current?.clear();};
    // The server keys the component by library, invalidating previous responses.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[]);
  const typedNodes=useMemo(()=>data?.nodes.filter(n=>!entityType||n.type===entityType)??[],[data,entityType]);
  const typedEdges=useMemo(()=>{const ids=new Set(typedNodes.map(n=>n.id));return data?.edges.filter(e=>(!filter||e.type===filter)&&ids.has(e.sourceId)&&ids.has(e.targetId))??[];},[data,filter,typedNodes]);
  const groups=useMemo(()=>communities?graphCommunities(typedNodes,typedEdges):graphGroups(typedNodes,typedEdges),[typedNodes,typedEdges,communities]);
  const nodes=useMemo(()=>{const ids=groups.find(g=>g.id===groupId)?.nodeIds;return groupId?typedNodes.filter(n=>ids?.includes(n.id)):typedNodes;},[typedNodes,groups,groupId]);
  const edges=useMemo(()=>{const ids=new Set(nodes.map(n=>n.id));return typedEdges.filter(e=>ids.has(e.sourceId)&&ids.has(e.targetId));},[nodes,typedEdges]);
  const fallback=useMemo(()=>layoutMode!=="circular"?layoutGroupedGraph(nodes,edges,communities):layoutGraph(nodes,edges),[nodes,edges,layoutMode,communities]);
  const structural=useStructuralLayout(nodes,edges,layoutMode==="structural");
  const layout=structural.layout??fallback;
  function resetSelection(){setSelected("");setEdgeId("");setFrom("");setTo("");}
  const path=useMemo(()=>from&&to?graphPath(nodes,edges,from,to):null,[nodes,edges,from,to]);
  const nodeIndex=useMemo(()=>new Map(data?.nodes.map(n=>[n.id,n])??[]),[data]);
  const label=(id:string)=>nodeIndex.get(id)?.label??id;
  const chosen=edges.find(e=>e.id===edgeId);
  const matches=nodes.filter(n=>n.label.toLocaleLowerCase().includes(search.toLocaleLowerCase()));
  const related=edges.filter(e=>!selected||e.sourceId===selected||e.targetId===selected);
  function chooseNode(id:string){setSelected(id);setEdgeId("");}
  if(error===401)return <SignInGate from={`/assets/${kbId}/graph`}/>;
  return <div className={`flex min-w-0 flex-col gap-md ${wide?"fixed inset-0 z-50 overflow-auto bg-background p-md":""}`} aria-busy={busy} onKeyDown={e=>{if(e.key==="Escape")setWide(false);}}>
    <PageHead title={m.graphTitle}/>
    <div className="flex flex-wrap gap-sm">
      <Button variant="outline" asChild><Link href={`/assets/${kbId}/published`}>{m.knowledgeTitle}</Link></Button>
      <Button variant="outline" asChild><Link href={`/assets/${kbId}/sources`}>{m.sourceSearchTitle}</Link></Button>
      <Button variant="outline" disabled={busy} onClick={()=>void load()}>{m.graphOverview}</Button>
      <Button variant="outline" disabled={busy} onClick={()=>{const current=activeWindow.current;void load(current.entity,current.cursor,current.history);}}>{m.recheckKnowledge}</Button>
      <Button variant="outline" onClick={()=>setWide(!wide)}>{wide?m.closeCanvas:m.largeCanvas}</Button>
    </div>
    <p className="text-body-sm text-muted-foreground">{m.graphHint}</p>
    <p id="graph-keyboard-help" className="text-body-sm text-muted-foreground">{m.graphKeyboard}</p>
    {!!error&&<div role="alert"><Banner tone="danger" title={error===403?m.packageDenied:error===409?m.directoryChanged:m.unavailable}/></div>}
    {!!observedAt&&<p role="status" className="break-all text-body-sm text-muted-foreground">{m.knowledgeObserved}: <time dateTime={observedAt}>{observedAt}</time> / {syncAction==="unchanged"?m.knowledgeUnchanged:m.knowledgeReplaced}</p>}
    {busy&&<p role="status">{m.loading}</p>}
    {data&&<>
      {!neighborhood&&data.directoryPage&&<section aria-label={m.directoryPage} className="flex min-w-0 flex-col gap-sm">
        <p className="text-body-sm text-muted-foreground">{m.graphPageHint}</p>
        <div className="flex flex-wrap items-center gap-sm"><p role="status">{m.directoryPage} {pages.length}</p>
          <Button variant="outline" disabled={busy||pages.length<2} onClick={()=>{const previous=pages.slice(0,-1);void load("",previous.at(-1)??"",previous);}}>{m.directoryPrevious}</Button>
          <Button variant="outline" disabled={busy||!data.directoryPage.nextCursor} onClick={()=>{const next=data.directoryPage!.nextCursor!;void load("",next,[...pages,next]);}}>{m.directoryNext}</Button>
        </div>
      </section>}
      {data.gaps.map(g=><Banner key={g} tone="warning" title={g==="no_published_support"?m.noPublished:g==="neighborhood_truncated"?m.packageTruncated:m.partialSources}/>)}
      <p className="font-mono text-code-sm">{data.schema.namespace}/{data.schema.schemaId}/{data.schema.version} &middot; {nodes.length} {m.graphNodes} / {edges.length} {m.relations}</p>
      <div className="flex flex-wrap items-center gap-sm">
        <label htmlFor="relation-filter">{m.relationFilter}</label><select id="relation-filter" value={filter} onChange={e=>{setFilter(e.target.value);setGroupId("");resetSelection();}} className="min-w-0 rounded-md border border-border bg-background p-sm">
          <option value="">{m.allTypes}</option>{[...new Set(data.edges.map(e=>e.type))].sort().map(type=><option key={type}>{type}</option>)}
        </select>
        <label htmlFor="entity-type-filter">{m.entityTypeFilter}</label><select id="entity-type-filter" value={entityType} onChange={e=>{setEntityType(e.target.value);setGroupId("");resetSelection();}} className="min-w-0 rounded-md border border-border bg-background p-sm">
          <option value="">{m.allTypes}</option>{[...new Set(data.nodes.map(n=>n.type))].sort().map(type=><option key={type}>{type}</option>)}
        </select>
        <label htmlFor="graph-layout">{m.layoutMode}</label><select id="graph-layout" value={layoutMode} onChange={e=>{setLayoutMode(e.target.value);resetSelection();}} className="min-w-0 rounded-md border border-border bg-background p-sm"><option value="structural">{m.structuralLayout}</option><option value="grouped">{m.groupedLayout}</option><option value="circular">{m.circularLayout}</option></select>
        <Button variant="outline" aria-pressed={communities} onClick={()=>{setCommunities(!communities);setGroupId("");resetSelection();}}>{communities?m.communityMode:m.componentMode}</Button>
        <label htmlFor="node-search">{m.findNode}</label><input id="node-search" value={search} onChange={e=>setSearch(e.target.value)} className="min-w-0 rounded-md border border-border bg-background p-sm"/>
      </div>
      <section aria-label={m.graphGroups} className="flex min-w-0 flex-col gap-sm">
        <h2 className="text-title-sm">{communities?m.communityGroups:m.graphGroups} ({groups.length})</h2><p className="text-body-sm text-muted-foreground">{communities?m.communityHint:m.groupHint}</p>
        <select aria-label={communities?m.communityGroups:m.graphGroups} value={groupId} className="w-full min-w-0 rounded-md border border-border bg-background p-sm" onChange={e=>{setGroupId(e.target.value);resetSelection();}}>
          <option value="">{m.allGroups}</option>{groups.map((group,i)=><option key={group.id} value={group.id}>{i+1}. {label(group.id)} ({group.nodeIds.length} / {group.edgeIds.length})</option>)}
        </select>
      </section>
      {structural.pending&&<p role="status">{m.layoutWorking}</p>}
      {structural.failed&&<Banner tone="warning" title={m.layoutFallback}/>}
      <div className="grid min-w-0 gap-md xl:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="min-w-0 overflow-hidden rounded-md border border-border bg-background">
          {!structural.pending&&<GraphCanvas key={JSON.stringify([sequence.current,entityType,filter,groupId,layoutMode,communities,Boolean(structural.layout)])} layout={layout} selected={selected} edgeId={edgeId} path={path} onNode={chooseNode} onEdge={setEdgeId}/>}
        </div>
        <aside className="flex min-w-0 flex-col gap-sm" aria-label={m.evidencePanel}>
          <h2 className="text-title-sm">{m.linkedEntities}</h2>
          <select size={8} aria-label={m.linkedEntities} className="w-full min-w-0 rounded-md border border-border bg-background p-sm" value={matches.some(n=>n.id===selected)?selected:""} onChange={e=>chooseNode(e.target.value)}>
            <option value="" disabled>{m.findNode}</option>{matches.map(n=><option key={n.id} value={n.id}>{n.label}</option>)}
          </select>
          {selected&&<Card><CardContent className="flex flex-col gap-sm p-md">
            <h3 className="break-words text-title-sm">{label(selected)}</h3>
            <Button variant="outline" asChild><Link href={`/assets/${kbId}/published?entity=${encodeURIComponent(selected)}`}>{m.openKnowledge}</Link></Button>
            <Button disabled={busy} onClick={()=>void load(selected)}>{m.expandNode}</Button>
            <Button variant="outline" onClick={()=>setFrom(selected)}>{m.pathStart}</Button>
            <Button variant="outline" onClick={()=>setTo(selected)}>{m.pathEnd}</Button>
          </CardContent></Card>}
          {from&&to&&<p role="status" className="break-words text-body-sm">{label(from)} &rarr; {label(to)}: {path===null?m.noPath:`${path.length} ${m.relations}`}</p>}
          <h2 className="text-title-sm">{m.evidencePanel}</h2>
          <select size={8} aria-label={m.evidencePanel} className="w-full min-w-0 rounded-md border border-border bg-background p-sm" value={related.some(e=>e.id===edgeId)?edgeId:""} onChange={e=>setEdgeId(e.target.value)}>
            <option value="" disabled>{m.evidencePanel}</option>{related.map(e=><option key={e.id} value={e.id}>{label(e.sourceId)} &rarr; {e.type} &rarr; {label(e.targetId)}</option>)}
          </select>
          {chosen&&<Card><CardContent className="flex min-w-0 flex-col gap-sm p-md"><p>{chosen.type}</p>{chosen.assertionIds.map(id=><div key={id}>
            <p className="break-words text-body-sm">{data.statements.find(s=>s.id===id)?.statement}</p>
            {data.evidence.filter(e=>data.assertions.find(a=>a.id===id)?.evidenceIds.includes(e.id)).map(e=><blockquote key={e.id} className="border-l-2 border-border pl-sm text-body-sm">
              <p className="break-words">{data.passages.find(p=>p.evidenceId===e.id)?.excerpt}</p><p className="break-all font-mono text-code-sm">{e.documentId} / v{e.documentVersion} / {e.start}:{e.end}{e.pages?.length?` / ${m.sourcePages} ${e.pages.join(", ")}`:""}</p>
            </blockquote>)}
          </div>)}</CardContent></Card>}
        </aside>
      </div>
    </>}
  </div>;
}
