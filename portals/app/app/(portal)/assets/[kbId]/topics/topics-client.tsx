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
  async function load(compose=false){
    const ticket=++sequence.current;setBusy(true);setError(0);setData(null);
    try{
      const response=await fetch(`/api/kb/${encodeURIComponent(kbId)}/topics`,{method:compose?"POST":"GET",cache:"no-store",credentials:"same-origin",
        ...(compose?{headers:{"Content-Type":"application/json"},body:JSON.stringify({id:crypto.randomUUID(),relationType:type})}:{})});
      if(!response.ok){if(ticket===sequence.current)setError(response.status);return;}
      const result=await response.json() as Result;if(ticket===sequence.current){setData(result);setType(t=>result.availableTypes.includes(t)?t:result.availableTypes[0]??"");}
    }catch{if(ticket===sequence.current)setError(503);}finally{if(ticket===sequence.current)setBusy(false);}
  }
  useEffect(()=>{void load();return()=>{sequence.current++;};
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[]);
  if(error===401)return <SignInGate from={`/assets/${kbId}/topics`}/>;
  return <div className="flex min-w-0 flex-col gap-md" aria-busy={busy}>
    <PageHead title={m.dossierTitle}/><p className="text-body-sm text-muted-foreground">{m.dossierHint}</p>
    <div className="flex flex-wrap gap-sm"><Button variant="outline" disabled={busy} onClick={()=>void load()}>{m.refresh}</Button>
      <Button variant="outline" asChild><Link href={`/assets/${kbId}/published`}>{m.knowledgeTitle}</Link></Button>
      <Button variant="outline" asChild><Link href={`/assets/${kbId}/maintenance`}>{m.maintenanceTitle}</Link></Button></div>
    {!!error&&<Banner tone="danger" title={error===403?m.denied:error===409?m.dossierChanged:m.unavailable}/>}
    {busy&&<p role="status">{m.loading}</p>}
    {data&&<>
      {data.truncated&&<Banner tone="warning" title={m.dossierTruncated}/>}
      <label htmlFor="dossier-type">{m.relationFilter}</label><select id="dossier-type" className="min-w-0 rounded-md border border-border bg-background p-sm" value={type} onChange={e=>setType(e.target.value)}>
        {data.availableTypes.map(t=><option key={t}>{t}</option>)}
      </select><Button disabled={!type||data.truncated} onClick={()=>void load(true)}>{m.dossierCompose}</Button>
      {data.duplicate&&<p role="status">{m.dossierDuplicate}</p>}
      {data.items.map(row=><Card key={row.id}><CardContent className="flex min-w-0 flex-col gap-sm p-md">
        <h2 className="text-title-md">{row.relationType} / {row.state==="current_draft"?m.dossierCurrent:m.dossierStale}</h2>
        <p className="break-all text-body-sm">{row.createdAt} / {row.createdBy}</p>
        {row.payload?.sections.map(section=><section key={section.relationId} className="flex min-w-0 flex-col gap-sm">
          <h3 className="break-words text-title-sm">{section.source.label} &rarr; {row.relationType} &rarr; {section.target.label}</h3>
          {section.statements.map(s=><div key={s.id}><p className="break-words text-body-sm">{s.text}</p>{s.evidence.map(e=><blockquote key={e.id} className="border-l-2 border-border pl-sm text-body-sm">
            <p className="whitespace-pre-wrap break-words">{e.excerpt}</p><p className="break-all font-mono text-code-sm">{e.documentId} / v{e.version} / {e.start}:{e.end}{e.pages.length?` / ${m.sourcePages} ${e.pages.join(", ")}`:""}</p>
          </blockquote>)}</div>)}
        </section>)}
      </CardContent></Card>)}
      {!data.items.length&&<p>{m.dossierEmpty}</p>}{data.more&&<p>{m.dossierMore}</p>}
    </>}
  </div>;
}
