"use client";
import {useEffect,useRef,useState} from "react";
import Link from "next/link";
import {Banner,Button,Card,CardContent} from "@vxture/design-system";
import {PageHead} from "../../../../_shell/PageHead";
import {useMessages} from "../../../../_i18n/useMessages";
import {semantic} from "../../../../_i18n/messages/semantic";
import {SignInGate} from "../../../../_lib/ui";
import type {TopicKnowledgeResult} from "../../../../kb/semantic/topic-knowledge";

export function TopicLibraryClient({kbId}:{kbId:string}){
  const m=useMessages(semantic),[value,setValue]=useState<TopicKnowledgeResult|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState(0),[active,setActive]=useState("");
  const sequence=useRef(0),controller=useRef<AbortController|null>(null);
  useEffect(()=>{void load();return()=>{sequence.current++;controller.current?.abort();};},[]);
  async function load(type="",summaryId?:string,before?:string){
    const ticket=++sequence.current;controller.current?.abort();const current=new AbortController();controller.current=current;setBusy(true);setError(0);setValue(null);setActive(type);
    try{
      const params=new URLSearchParams({action:type?"read":"list"});if(type)params.set("relation_type",type);if(summaryId)params.set("summary_id",summaryId);if(before)params.set("before",before);
      const response=await fetch(`/api/kb/${encodeURIComponent(kbId)}/topic-knowledge?${params}`,{cache:"no-store",credentials:"same-origin",signal:current.signal});
      if(ticket!==sequence.current)return;if(!response.ok){setError(response.status);return;}
      const result=await response.json();if(ticket!==sequence.current)return;
      if(result.format!=="karda.topic-knowledge.v1"||result.kbId!==kbId||!Array.isArray(result.topics)||!Array.isArray(result.summaries))throw Error("invalid_response");setValue(result);
    }catch{if(ticket===sequence.current)setError(503);}finally{if(ticket===sequence.current)setBusy(false);}
  }
  if(error===401)return <SignInGate from={`/assets/${kbId}/topic-library`}/>;
  const evidence=new Map(value?.dossier?.sections.flatMap(s=>s.statements.flatMap(a=>a.evidence.map(e=>[e.id,e] as const)))??[]);
  return <div className="flex min-w-0 flex-col gap-md" aria-busy={busy}>
    <PageHead title={m.topicLibraryTitle}/><p>{m.topicLibraryHint}</p>
    <div className="flex flex-wrap gap-sm"><Button variant="outline" disabled={busy} onClick={()=>void load()}>{m.topicLibraryCatalog}</Button>
      <Button variant="outline" disabled={busy} onClick={()=>void load(active)}>{m.topicLibraryRefresh}</Button>
      <Button variant="outline" asChild><Link href={`/assets/${kbId}/published`}>{m.knowledgeTitle}</Link></Button></div>
    {busy&&<p role="status">{m.loading}</p>}{!!error&&<Banner tone="danger" title={error===403?m.packageDenied:error===409?m.topicLibraryChanged:m.topicLibraryUnavailable}/>}
    {value&&<>
      <p className="break-all text-body-sm">{m.topicLibraryChecked}: {value.checkedAt}</p>
      {!value.topics.length&&<p>{m.topicLibraryEmpty}</p>}
      <nav aria-label={m.topicLibraryCatalog} className="flex flex-wrap gap-sm">{value.topics.map(t=><Button key={t.relationType} variant="outline" onClick={()=>void load(t.relationType)}>{t.relationType} ({t.relations} / {t.entities})</Button>)}</nav>
      {active&&!value.dossier&&<p>{m.topicLibraryEmpty}</p>}
      {value.dossier&&<>
        <h2 className="text-title-sm">{m.topicLibrarySummary}</h2><p className="text-body-sm">{m.topicLibrarySeparation}</p>
        {!value.summary&&<p>{m.topicLibraryNoSummary}</p>}
        {value.summary&&<Card><CardContent className="flex min-w-0 flex-col gap-sm p-md"><p className="break-all font-mono text-code-sm">{value.summary.id} / {m.topicLibraryRevision}: {value.summary.revision}</p>
          {value.summary.payload.paragraphs.map((p,i)=><div key={i}><p className="break-words">{p.text}</p>{p.citations.map(id=>{const e=evidence.get(id);return e?<details key={id}><summary className="cursor-pointer break-all">{m.topicLibraryCitation}: {id}</summary><blockquote className="break-words border-l-2 border-border pl-sm">{e.excerpt}</blockquote><p className="break-all font-mono text-code-sm">{e.documentId} / v{e.version} / {e.start}:{e.end}{e.pages.length?` / ${m.sourcePages} ${e.pages.join(", ")}`:""}</p></details>:null;})}</div>)}
        </CardContent></Card>}
        <div className="flex flex-wrap gap-sm">{value.summaries.map(s=><Button key={s.id} variant="outline" onClick={()=>void load(active,s.id)}>{m.topicLibrarySelect}: {s.id.slice(0,8)}</Button>)}
          {value.nextBefore&&<Button variant="outline" onClick={()=>void load(active,undefined,value.nextBefore!)}>{m.topicLibraryOlder}</Button>}</div>
        <h2 className="text-title-sm">{m.topicLibraryFacts}</h2>
        {value.dossier.sections.map(section=><Card key={section.relationId}><CardContent className="flex min-w-0 flex-col gap-sm p-md">
          <h3 className="break-words">{section.source.label} &rarr; {value.dossier!.relationType} &rarr; {section.target.label}</h3>
          <div className="flex flex-wrap gap-sm">{[section.source,section.target].map(e=><Button key={e.id} variant="outline" asChild><Link href={`/assets/${kbId}/published?entity=${encodeURIComponent(e.id)}`}>{e.label}</Link></Button>)}
            <Button variant="outline" asChild><Link href={`/assets/${kbId}/graph?entity=${encodeURIComponent(section.source.id)}`}>{m.entityGraph}</Link></Button></div>
          {section.statements.map(s=><div key={s.id}><p className="break-words">{s.text}</p>{s.evidence.map(e=><blockquote key={e.id} className="border-l-2 border-border pl-sm"><p className="break-words">{e.excerpt}</p><p className="break-all font-mono text-code-sm">{e.documentId} / v{e.version} / {e.start}:{e.end}</p></blockquote>)}</div>)}
        </CardContent></Card>)}
      </>}
    </>}
  </div>;
}
