"use client";
import {useEffect,useMemo,useRef,useState} from "react";
import Link from "next/link";
import {Banner,Button,Card,CardContent} from "@vxture/design-system";
import {PageHead} from "../../../../_shell/PageHead";
import {useMessages} from "../../../../_i18n/useMessages";
import {semantic} from "../../../../_i18n/messages/semantic";
import {SignInGate} from "../../../../_lib/ui";
import {layoutGraph,graphPath} from "../../../../kb/semantic/graph-view";
import type {KnowledgePackage} from "../../../../kb/semantic/read-postgres";

export function GraphClient({kbId}:{kbId:string}){
  const m=useMessages(semantic),[data,setData]=useState<KnowledgePackage|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState(0);
  const [selected,setSelected]=useState(""),[edgeId,setEdgeId]=useState(""),[filter,setFilter]=useState(""),[from,setFrom]=useState(""),[to,setTo]=useState("");
  const [search,setSearch]=useState(""),[zoom,setZoom]=useState(1),[offset,setOffset]=useState({x:0,y:0}),[wide,setWide]=useState(false);
  const sequence=useRef(0),drag=useRef<{x:number;y:number;ox:number;oy:number}|null>(null);
  async function load(seed=""){
    const ticket=++sequence.current;setBusy(true);setError(0);setData(null);setSelected("");setEdgeId("");setFrom("");setTo("");setFilter("");setSearch("");
    try{
      const response=await fetch(`/api/kb/${encodeURIComponent(kbId)}/knowledge-package?nodes=500&edges=1000&hops=2${seed?`&entity=${encodeURIComponent(seed)}`:""}`,{cache:"no-store",credentials:"same-origin"});
      if(!response.ok){if(ticket===sequence.current)setError(response.status);return;}
      const result=await response.json() as KnowledgePackage;
      if(ticket===sequence.current){setData(result);setSelected(seed);setZoom(1);setOffset({x:0,y:0});}
    }catch{if(ticket===sequence.current)setError(503);}finally{if(ticket===sequence.current)setBusy(false);}
  }
  useEffect(()=>{void load();return()=>{sequence.current++;};
    // The server keys the component by library, invalidating previous responses.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[]);
  const edges=useMemo(()=>data?.edges.filter(e=>!filter||e.type===filter)??[],[data,filter]);
  const nodes=useMemo(()=>data?.nodes.filter(n=>edges.some(e=>e.sourceId===n.id||e.targetId===n.id))??[],[data,edges]);
  const layout=useMemo(()=>layoutGraph(nodes,edges),[nodes,edges]),points=new Map(layout.points.map(p=>[p.id,p]));
  const path=useMemo(()=>from&&to?graphPath(nodes,edges,from,to):null,[nodes,edges,from,to]);
  const label=(id:string)=>data?.nodes.find(n=>n.id===id)?.label??id;
  const chosen=data?.edges.find(e=>e.id===edgeId);
  if(error===401)return <SignInGate from={`/assets/${kbId}/graph`}/>;
  return <div className={`flex min-w-0 flex-col gap-md ${wide?"fixed inset-0 z-50 overflow-auto bg-background p-md":""}`} aria-busy={busy}>
    <PageHead title={m.graphTitle}/>
    <div className="flex flex-wrap gap-sm">
      <Button variant="outline" asChild><Link href={`/assets/${kbId}/published`}>{m.knowledgeTitle}</Link></Button>
      <Button variant="outline" disabled={busy} onClick={()=>void load()}>{m.graphOverview}</Button>
      <Button variant="outline" onClick={()=>setWide(!wide)}>{wide?m.closeCanvas:m.largeCanvas}</Button>
      <Button variant="outline" disabled={busy} onClick={()=>{setZoom(1);setOffset({x:0,y:0});}}>{m.resetView}</Button>
      <Button variant="outline" onClick={()=>setZoom(z=>Math.min(4,z*1.25))} aria-label={m.zoomIn}>+</Button>
      <Button variant="outline" onClick={()=>setZoom(z=>Math.max(.3,z/1.25))} aria-label={m.zoomOut}>-</Button>
    </div>
    <p className="text-body-sm text-muted-foreground">{m.graphHint}</p>
    {!!error&&<div role="alert"><Banner tone="danger" title={error===403?m.packageDenied:m.unavailable}/></div>}
    {busy&&<p role="status">{m.loading}</p>}
    {data&&<>
      {data.gaps.map(g=><Banner key={g} tone="warning" title={g==="no_published_support"?m.noPublished:g==="neighborhood_truncated"?m.packageTruncated:m.partialSources}/>)}
      <p className="font-mono text-code-sm">{data.schema.namespace}/{data.schema.schemaId}/{data.schema.version} &middot; {nodes.length} {m.graphNodes} / {edges.length} {m.relations}</p>
      <div className="flex flex-wrap items-center gap-sm">
        <label htmlFor="relation-filter">{m.relationFilter}</label><select id="relation-filter" value={filter} onChange={e=>{setFilter(e.target.value);setEdgeId("");setFrom("");setTo("");}} className="min-w-0 rounded-md border border-border bg-background p-sm">
          <option value="">{m.allTypes}</option>{[...new Set(data.edges.map(e=>e.type))].sort().map(type=><option key={type}>{type}</option>)}
        </select>
        <label htmlFor="node-search">{m.findNode}</label><input id="node-search" value={search} onChange={e=>setSearch(e.target.value)} className="min-w-0 rounded-md border border-border bg-background p-sm"/>
      </div>
      <div className="grid min-w-0 gap-md xl:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="min-w-0 overflow-hidden rounded-md border border-border bg-background">
          <svg viewBox={`0 0 ${layout.size} ${layout.size}`} role="group" aria-label={m.graphTitle} className="h-[65vh] min-h-96 w-full touch-none"
            onPointerDown={e=>{if(e.target!==e.currentTarget)return;drag.current={x:e.clientX,y:e.clientY,ox:offset.x,oy:offset.y};e.currentTarget.setPointerCapture(e.pointerId);}}
            onPointerMove={e=>{if(drag.current){const rect=e.currentTarget.getBoundingClientRect();setOffset({x:drag.current.ox+(e.clientX-drag.current.x)*layout.size/rect.width,y:drag.current.oy+(e.clientY-drag.current.y)*layout.size/rect.height});}}}
            onPointerUp={()=>{drag.current=null;}} onPointerCancel={()=>{drag.current=null;}}>
            <defs><marker id="arrow" viewBox="0 0 10 10" refX="20" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 z" fill="currentColor"/></marker></defs>
            <g transform={`translate(${offset.x+layout.size/2} ${offset.y+layout.size/2}) scale(${zoom}) translate(${-layout.size/2} ${-layout.size/2})`}>
              {layout.edges.map(edge=>{const a=points.get(edge.sourceId)!,b=points.get(edge.targetId)!,active=edge.id===edgeId||path?.includes(edge.id);return <g key={edge.id}>
                <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="currentColor" strokeWidth={active?5:2} opacity={active?1:.35} markerEnd="url(#arrow)"/>
                <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="transparent" strokeWidth="18" role="button" tabIndex={0}
                  aria-label={`${label(edge.sourceId)} ${edge.type} ${label(edge.targetId)}`} onClick={()=>setEdgeId(edge.id)} onKeyDown={e=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();setEdgeId(edge.id);}}}/>
              </g>;})}
              {layout.points.map(node=><g key={node.id} transform={`translate(${node.x} ${node.y})`} role="button" tabIndex={0} aria-label={node.label}
                onClick={()=>{setSelected(node.id);setEdgeId("");}} onKeyDown={e=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();setSelected(node.id);setEdgeId("");}}}>
                <circle r={selected===node.id?23:17} fill={selected===node.id?"currentColor":"var(--background, white)"} stroke="currentColor" strokeWidth="3"/>
                <text y="-30" textAnchor="middle" fill="currentColor" fontSize={Math.min(18,Math.max(12,layout.size/90))}>{node.label.slice(0,26)}</text><title>{node.label} / {node.type}</title>
              </g>)}
            </g>
          </svg>
        </div>
        <aside className="flex min-w-0 flex-col gap-sm" aria-label={m.evidencePanel}>
          <h2 className="text-title-sm">{m.linkedEntities}</h2>
          <div className="flex max-h-48 flex-wrap gap-sm overflow-auto">{nodes.filter(n=>n.label.toLocaleLowerCase().includes(search.toLocaleLowerCase())).map(n=><Button key={n.id} variant={selected===n.id?"default":"outline"} onClick={()=>{setSelected(n.id);setEdgeId("");}}>{n.label}</Button>)}</div>
          {selected&&<Card><CardContent className="flex flex-col gap-sm p-md">
            <h3 className="break-words text-title-sm">{label(selected)}</h3>
            <Button disabled={busy} onClick={()=>void load(selected)}>{m.expandNode}</Button>
            <Button variant="outline" onClick={()=>setFrom(selected)}>{m.pathStart}</Button>
            <Button variant="outline" onClick={()=>setTo(selected)}>{m.pathEnd}</Button>
          </CardContent></Card>}
          {from&&to&&<p role="status" className="break-words text-body-sm">{label(from)} &rarr; {label(to)}: {path===null?m.noPath:`${path.length} ${m.relations}`}</p>}
          <h2 className="text-title-sm">{m.evidencePanel}</h2>
          <div className="flex max-h-48 flex-col gap-sm overflow-auto">{edges.filter(e=>!selected||e.sourceId===selected||e.targetId===selected).map(e=><Button key={e.id} variant={edgeId===e.id?"default":"outline"} className="h-auto whitespace-normal break-words text-left" onClick={()=>setEdgeId(e.id)}>{label(e.sourceId)} &rarr; {e.type} &rarr; {label(e.targetId)}</Button>)}</div>
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
