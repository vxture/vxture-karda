"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Banner, Button, Card, CardContent, EmptyState } from "@vxture/design-system";
import { PageHead } from "../../../../_shell/PageHead";
import { useMessages } from "../../../../_i18n/useMessages";
import { semantic } from "../../../../_i18n/messages/semantic";
import { ApiError } from "../../../../_lib/api";
import { SignInGate } from "../../../../_lib/ui";
import { SemanticReviewApi, type CompileList, type CompileDetail, type ReleasePreview, type ReviewDecision } from "../../../../_lib/semantic-api";

export function SemanticReviewClient({kbId}:{kbId:string}) {
  const m=useMessages(semantic), api=useMemo(()=>new SemanticReviewApi(kbId),[kbId]);
  const [list,setList]=useState<CompileList|null>(null), [detail,setDetail]=useState<CompileDetail|null>(null);
  const [preview,setPreview]=useState<ReleasePreview|null>(null), [notes,setNotes]=useState<Record<string,string>>({});
  const [busy,setBusy]=useState(false), [error,setError]=useState<number|null>(null), [notice,setNotice]=useState(false);
  const [login,setLogin]=useState(false);
  const sequence=useRef(0), locked=useRef(false);

  async function run(work:(current:()=>boolean)=>Promise<void>, preservePreview=false) {
    if(locked.current)return;
    locked.current=true; const ticket=++sequence.current, current=()=>ticket===sequence.current;
    setBusy(true);setError(null);setNotice(false);
    if(!preservePreview)setPreview(null);
    try { await work(current); }
    catch(e) { if(current()) {
      const status=e instanceof ApiError?e.status:500;
      if(status===401)setLogin(true);
      setError(status);
      // On a lost network response retain the exact event binding for retry.
      // A semantic conflict instead requires a fresh inspection and preview.
      if(status===409||status===403||status===401)setPreview(null);
    }} finally {if(current()){locked.current=false;setBusy(false);}}
  }
  useEffect(()=>{
    void run(async current=>{const page=await api.list();if(current())setList(page);});
    return()=>{++sequence.current;locked.current=false;};
    // The server page keys this component by library, dropping all prior state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[api]);

  async function choose(runId:string) {
    setDetail(null);setNotes({});
    await run(async current=>{const loaded=await api.detail(runId);if(current())setDetail(loaded);});
  }
  async function decide(relationId:string, revision:number, decision:ReviewDecision) {
    if(!detail)return;
    const runId=detail.runId;
    await run(async current=>{
      await api.review(runId,relationId,revision,decision,notes[relationId]??"");
      const loaded=await api.detail(runId);
      if(current()){setDetail(loaded);setNotes(n=>({...n,[relationId]:""}));}
    });
  }
  const states={pending:m.pending,accept:m.accept,revise:m.revise,reject:m.reject,stale:m.stale};
  if(login)return <SignInGate from={`/assets/${kbId}/semantic`} />;
  const refresh=()=>run(async current=>{
    const page=await api.list();
    const loaded=detail?await api.detail(detail.runId):null;
    if(current()){setList(page);setDetail(loaded);}
  });

  return <div className="flex min-w-0 flex-col gap-md" aria-busy={busy}>
    <PageHead title={m.title}/>
    <div className="flex flex-wrap gap-sm">
      <Button variant="outline" disabled={busy} onClick={()=>void refresh()}>{m.refresh}</Button>
      <Button variant="outline" asChild><Link href={`/assets/${kbId}/knowledge`}>{m.back}</Link></Button>
    </div>
    <p className="text-body-sm text-muted-foreground">{m.description}</p>
    {error&&<div role="alert"><Banner tone="danger" title={error===409?m.conflict:error===403?m.denied:error===503?m.unavailable:m.failed}/></div>}
    {notice&&<div role="status"><Banner tone="success" title={m.published}/></div>}
    {busy&&<p role="status" className="text-body-sm">{m.loading}</p>}
    <div className="grid min-w-0 gap-md xl:grid-cols-[18rem_minmax(0,1fr)]">
      <Card><CardContent className="flex flex-col gap-sm p-md">
        <h2 className="text-title-sm">{m.runs}</h2>
        {list?.items.length===0&&<EmptyState title={m.empty} description={m.emptyHint}/>}
        {list?.items.map(item=><Button key={item.id} variant={detail?.runId===item.id?"default":"outline"}
          disabled={busy||item.status!=="validated"} onClick={()=>void choose(item.id)} className="h-auto justify-start whitespace-normal break-all text-left">
          <span title={item.id}>{m.batch} {item.id.slice(0,8)}<br/>{String(item.created_at)}<br/>{item.relation_count} {m.relations}</span>
        </Button>)}
        {list?.next&&<Button variant="outline" disabled={busy} onClick={()=>void run(async current=>{
          const page=await api.list(list.next!);if(current())setList(old=>({items:[...(old?.items??[]),...page.items],next:page.next}));
        })}>{m.more}</Button>}
      </CardContent></Card>
      <section className="flex min-w-0 flex-col gap-md" aria-label={m.title}>
        {!detail?<EmptyState title={m.choose}/>:<>
          <p className="break-all font-mono text-code-sm">{detail.payload.schema.namespace} / {detail.payload.schema.schemaId} / {detail.payload.schema.version}</p>
          <Banner tone="info" title={m.historical}/>
          {detail.relations.length===0&&<Banner tone="warning" title={m.noRelations}/>}
          {detail.payload.relations.map(relation=>{
            const review=detail.relations.find(r=>r.relationId===relation.id)!;
            const label=(id:string)=>detail.entities.find(e=>e.id===id)?.name??id;
            const evidence=detail.evidence.filter(e=>relation.assertionIds.includes(e.assertion_id));
            return <Card key={relation.id}><CardContent className="flex min-w-0 flex-col gap-sm p-md">
              <h3 className="break-words text-title-sm">{label(relation.sourceId)} &rarr; {relation.type} &rarr; {label(relation.targetId)}</h3>
              <p className="text-body-sm">{states[review.state as keyof typeof states]??review.state} &middot; {review.revision}</p>
              {review.review&&<p className="break-words text-body-sm text-muted-foreground">{review.review.note} &middot; {review.review.reviewer_sub}</p>}
              {evidence.map((e,index)=><blockquote key={index} className="break-words border-l-2 border-border pl-sm text-body-sm">
                <p>{e.statement}</p><p>{e.excerpt}</p>
                <p className="break-all font-mono text-code-sm">{e.document_id} / v{e.document_version} / {e.start_offset}:{e.end_offset}</p>
              </blockquote>)}
              <label htmlFor={`note-${relation.id}`} className="text-body-sm">{m.note}</label>
              <textarea id={`note-${relation.id}`} value={notes[relation.id]??""} maxLength={10000} disabled={busy}
                onChange={e=>setNotes(old=>({...old,[relation.id]:e.target.value}))}
                className="min-h-20 w-full rounded-md border border-border bg-background p-sm text-body-sm"/>
              <div className="flex flex-wrap gap-sm">{(["accept","revise","reject"] as const).map(decision=>
                <Button key={decision} variant="outline" disabled={busy||!notes[relation.id]?.trim()}
                  onClick={()=>void decide(relation.id,review.revision,decision)}>{states[decision]}</Button>)}</div>
            </CardContent></Card>;
          })}
          <Button disabled={busy||detail.relations.some(r=>r.state!=="accept")} onClick={()=>void run(async current=>{
            const value=await api.preview(detail.runId);if(current())setPreview(value);
          })}>{m.preview}</Button>
        </>}
        {preview&&<Card><CardContent className="flex flex-col gap-sm p-md">
          <h2 className="text-title-sm">{m.preview}</h2><Banner tone="warning" title={m.replacement}/>
          <p>{m.generation}: {preview.expectedGeneration}</p>
          {(["added","removed","changed"] as const).map(kind=><details key={kind} open={kind==="removed"}>
            <summary>{m[kind]}: {preview.changes[kind].length}</summary>
            <ul>{preview.changes[kind].map(id=><li className="break-all font-mono text-code-sm" key={id}>{id}</li>)}</ul>
          </details>)}
          <div className="flex flex-wrap gap-sm">
            <Button disabled={busy} onClick={()=>void run(async current=>{
              await api.publish(preview);if(current()){setPreview(null);setNotice(true);}
            },true)}>{m.confirm}</Button>
            <Button variant="outline" disabled={busy} onClick={()=>setPreview(null)}>{m.cancel}</Button>
          </div>
        </CardContent></Card>}
      </section>
    </div>
  </div>;
}
