"use client";
import {useEffect,useRef,useState} from "react";
import Link from "next/link";
import {Banner,Button,Card,CardContent} from "@vxture/design-system";
import {PageHead} from "../../../../_shell/PageHead";
import {useMessages} from "../../../../_i18n/useMessages";
import {semantic} from "../../../../_i18n/messages/semantic";
import {SignInGate} from "../../../../_lib/ui";
import type {KnowledgePackage} from "../../../../kb/semantic/read-postgres";

export function PublishedKnowledgeClient({kbId}:{kbId:string}){
  const m=useMessages(semantic),[entity,setEntity]=useState(""),[focus,setFocus]=useState("");
  const [value,setValue]=useState<KnowledgePackage|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState(0);
  const sequence=useRef(0);
  useEffect(()=>{void load("");return()=>{sequence.current++;};
    // The server keys this component by library, discarding prior request state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[]);
  async function load(id:string){
    const ticket=++sequence.current;setBusy(true);setError(0);setValue(null);
    try{
      const response=await fetch(`/api/kb/${encodeURIComponent(kbId)}/knowledge-package${id?`?entity=${encodeURIComponent(id)}`:""}`,{cache:"no-store",credentials:"same-origin"});
      if(!response.ok){if(ticket===sequence.current)setError(response.status);return;}
      const data=await response.json() as KnowledgePackage;
      if(ticket===sequence.current){setValue(data);setFocus(id);setEntity(id);}
    }catch{if(ticket===sequence.current)setError(503);}
    finally{if(ticket===sequence.current)setBusy(false);}
  }
  if(error===401)return <SignInGate from={`/assets/${kbId}/published`}/>;
  const label=(id:string)=>value?.nodes.find(n=>n.id===id)?.label??id;
  return <div className="flex min-w-0 flex-col gap-md" aria-busy={busy}>
    <PageHead title={m.knowledgeTitle}/>
    <Link href={`/assets/${kbId}/knowledge`}>{m.back}</Link>
    <p className="text-body-sm text-muted-foreground">{m.knowledgeHint}</p>
    <Button disabled={busy} variant="outline" onClick={()=>void load("")}>{m.linkedEntities}</Button>
    <form onSubmit={e=>{e.preventDefault();void load(entity.trim());}} className="flex flex-wrap gap-sm">
      <label htmlFor="entity-id">{m.entityId}</label>
      <input id="entity-id" value={entity} onChange={e=>setEntity(e.target.value)} disabled={busy} required
        pattern="[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}" className="min-w-0 flex-1 rounded-md border border-border bg-background p-sm"/>
      <Button disabled={busy} type="submit">{m.openKnowledge}</Button>
    </form>
    {busy&&<p role="status">{m.loading}</p>}
    {!!error&&<Banner tone="danger" title={error===403?m.denied:error===400?m.invalidEntity:m.unavailable}/>}
    {value&&<>
      <p className="break-all font-mono text-code-sm">{value.schema.namespace} / {value.schema.schemaId} / {value.schema.version}</p>
      {value.gaps.map(gap=><Banner key={gap} tone="warning" title={gap==="no_published_support"?m.noPublished:gap==="neighborhood_truncated"?m.packageTruncated:m.partialSources}/>)}
      <h2 className="break-words text-title-md">{label(focus)}</h2>
      <nav aria-label={m.linkedEntities} className="flex flex-wrap gap-sm">{value.nodes.filter(n=>n.id!==focus).map(n=>
        <Button key={n.id} variant="outline" disabled={busy} onClick={()=>void load(n.id)}>{n.label}</Button>)}</nav>
      {(["outgoing","incoming"] as const).map(direction=><section key={direction} className="flex min-w-0 flex-col gap-sm">
        <h3 className="text-title-sm">{m[direction]}</h3>
        {value.edges.filter(e=>direction==="outgoing"?e.sourceId===focus:e.targetId===focus).map(edge=><Card key={edge.id}>
          <CardContent className="flex min-w-0 flex-col gap-sm p-md">
            <p className="break-words">{label(edge.sourceId)} &rarr; {edge.type} &rarr; {label(edge.targetId)}</p>
            {edge.assertionIds.map(id=>{
              const assertion=value.assertions.find(a=>a.id===id)!;
              return <div key={id}><p className="break-words text-body-sm">{value.statements.find(s=>s.id===id)?.statement}</p>
                {value.evidence.filter(e=>assertion.evidenceIds.includes(e.id)).map(e=><blockquote key={e.id} className="border-l-2 border-border pl-sm text-body-sm">
                  <p className="break-words">{value.passages.find(p=>p.evidenceId===e.id)?.excerpt}</p>
                  <p className="break-all font-mono text-code-sm">{e.documentId} / v{e.documentVersion} / {e.start}:{e.end}</p>
                </blockquote>)}
              </div>;
            })}
          </CardContent></Card>)}
      </section>)}
    </>}
  </div>;
}
