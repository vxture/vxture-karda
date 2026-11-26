"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Banner, Button, Card, CardContent, EmptyState } from "@vxture/design-system";
import { PageHead } from "../../../../_shell/PageHead";
import { useMessages } from "../../../../_i18n/useMessages";
import { semantic } from "../../../../_i18n/messages/semantic";
import { ApiError } from "../../../../_lib/api";
import { SignInGate } from "../../../../_lib/ui";
import { SemanticReviewApi, type CompileList, type CompileDetail, type ReleasePreview, type ReviewDecision,type CompileTaskRow } from "../../../../_lib/semantic-api";
import {TaskSelection} from "./task-selection";
import {COMPILE_TASK_STATES} from "../../../../kb/semantic/task-query";
import type {SourceIssue} from "../../../../kb/semantic/source-readiness";
import type {SourceInspectionQuery} from "../../../../kb/semantic/source-query";
import {compileSourceSelection} from "../../../../kb/semantic/compile-source-selection";
import {PublicationImpact} from "./publication-impact";

export function SemanticReviewClient({kbId,initialTaskId}:{kbId:string;initialTaskId?:string}) {
  const m=useMessages(semantic), api=useMemo(()=>new SemanticReviewApi(kbId),[kbId]);
  const [list,setList]=useState<CompileList|null>(null), [detail,setDetail]=useState<CompileDetail|null>(null);
  const [preview,setPreview]=useState<ReleasePreview|null>(null), [notes,setNotes]=useState<Record<string,string>>({});
  const [busy,setBusy]=useState(false), [error,setError]=useState<number|null>(null), [notice,setNotice]=useState(false);
  const [login,setLogin]=useState(false);
  const [tasks,setTasks]=useState<CompileTaskRow[]>([]),[inputMissing,setInputMissing]=useState(false);
  const createId=useRef<string|null>(null);
  const selectedCreateId=useRef<{key:string;id:string}|null>(null);
  const [compileSourceText,setCompileSourceText]=useState(""),[sourceSelectionInvalid,setSourceSelectionInvalid]=useState(false);
  const [taskState,setTaskState]=useState(""),[taskLookup,setTaskLookup]=useState(""),[taskNext,setTaskNext]=useState<string|null>(null),[taskTrail,setTaskTrail]=useState<(string|undefined)[]>([undefined]);
  const [taskDetail,setTaskDetail]=useState<CompileTaskRow|null>(null);
  const [sources,setSources]=useState<Awaited<ReturnType<SemanticReviewApi["sources"]>>|null>(null);
  const [sourceTrail,setSourceTrail]=useState<(string|undefined)[]>([undefined]),[sourceLookup,setSourceLookup]=useState("");
  const sequence=useRef(0), locked=useRef(false);

  async function run(work:(current:()=>boolean)=>Promise<void>, preservePreview=false) {
    if(locked.current)return;
    locked.current=true; const ticket=++sequence.current, current=()=>ticket===sequence.current;
    setBusy(true);setError(null);setNotice(false);setInputMissing(false);
    setSources(null);
    if(!preservePreview)setPreview(null);
    try { await work(current); }
    catch(e) { if(current()) {
      const status=e instanceof ApiError?e.status:500;
      if(status===401)setLogin(true);
      setError(status);
      setTasks([]);setTaskDetail(null);setDetail(null);setNotes({});
      if(e instanceof ApiError&&e.code==="semantic_compile_inputs_required")setInputMissing(true);
      // On a lost network response retain the exact event binding for retry.
      // A semantic conflict instead requires a fresh inspection and preview.
      if(status===409||status===403||status===401)setPreview(null);
    }} finally {if(current()){locked.current=false;setBusy(false);}}
  }
  useEffect(()=>{
    void run(async current=>{const [page,taskPage]=await Promise.all([api.list(),api.tasks()]);if(current()){setList(page);setTasks(taskPage.tasks);setTaskNext(taskPage.next??null);}if(initialTaskId&&/^[a-f0-9-]{36}$/.test(initialTaskId)){const focused=await api.tasks({taskId:initialTaskId});if(current())setTaskDetail(focused.tasks[0]??null);}});
    return()=>{++sequence.current;locked.current=false;};
    // The server page keys this component by library, dropping all prior state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[api]);

  async function choose(runId:string) {
    setDetail(null);setNotes({});
    await run(async current=>{const loaded=await api.detail(runId);if(current())setDetail(loaded);});
  }
  async function checkSources(query:SourceInspectionQuery={},trail:(string|undefined)[]=[undefined]){
    await run(async current=>{const value=await api.sources(query);if(current()){setSources(value);setSourceTrail(trail);}});
  }
  async function taskPage(before?:string,state=taskState,trail:(string|undefined)[]=[undefined]){
    setTasks([]);setTaskDetail(null);
    await run(async current=>{const value=await api.tasks({...(before?{before}:{}),...(state?{state}:{})});
      if(current()){setTasks(value.tasks);setTaskNext(value.next??null);setTaskTrail(trail);setTaskState(state);}});
  }
  async function openTask(id:string){
    setTaskDetail(null);setPreview(null);setDetail(null);setNotes({});
    await run(async current=>{const value=await api.tasks({taskId:id});if(current())setTaskDetail(value.tasks[0]??null);});
  }
  async function executeTask(id:string){
    setTaskDetail(null);setDetail(null);setNotes({});
    await run(async current=>{await api.executeTask(id);
      const [value,page,focused]=await Promise.all([api.tasks(),api.list(),api.tasks({taskId:id})]);
      if(current()){setTasks(value.tasks);setTaskNext(value.next??null);setTaskTrail([undefined]);setTaskState("");setTaskDetail(focused.tasks[0]??null);setList(page);}});
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
  const sourceIssues:Record<SourceIssue,string>={unsupported_format:m.sourceUnsupported,not_indexed:m.sourceNotIndexed,version_missing:m.sourceVersionMissing,
    original_unavailable:m.sourceOriginalUnavailable,snapshot_unavailable:m.sourceSnapshotUnavailable,text_empty:m.sourceTextEmpty};
  if(login)return <SignInGate from={`/assets/${kbId}/semantic`} />;
  const refresh=()=>run(async current=>{
    const [page,taskPage]=await Promise.all([api.list(),api.tasks()]);
    const loaded=detail?await api.detail(detail.runId):null;
    if(current()){setList(page);setDetail(loaded);setTasks(taskPage.tasks);setTaskDetail(null);setTaskNext(taskPage.next??null);setTaskTrail([undefined]);setTaskState("");}
  });

  return <div className="flex min-w-0 flex-col gap-md" aria-busy={busy}>
    <PageHead title={m.title}/>
    <div className="flex flex-wrap gap-sm">
      <Button variant="outline" disabled={busy} onClick={()=>void refresh()}>{m.refresh}</Button>
      <Button variant="outline" asChild><Link href={`/assets/${kbId}/knowledge`}>{m.back}</Link></Button>
      <Button variant="outline" asChild><Link href={`/assets/${kbId}/ocr`}>{m.ocrWorkbench}</Link></Button>
    </div>
    <p className="text-body-sm text-muted-foreground">{m.description}</p>
    {error&&<div role="alert"><Banner tone="danger" title={inputMissing?m.inputsRequired:error===409?m.conflict:error===403?m.denied:error===503?m.unavailable:m.failed}/></div>}
    {notice&&<div role="status"><Banner tone="success" title={m.published}/></div>}
    {busy&&<p role="status" className="text-body-sm">{m.loading}</p>}
    <Card><CardContent className="flex flex-col gap-sm p-md">
      <h2 className="text-title-sm">{m.tasks}</h2><p className="text-body-sm text-muted-foreground">{m.taskHint}</p>
      <Button variant="outline" disabled={busy} onClick={()=>void checkSources()}>{m.checkSources}</Button>
      <p className="text-body-sm text-muted-foreground">{m.sourceCheckHint}</p>
      <form className="flex min-w-0 flex-wrap gap-sm" onSubmit={e=>{e.preventDefault();void checkSources({documentId:sourceLookup.trim()});}}>
        <label htmlFor="source-inspection-id">{m.sourceLookup}</label>
        <input id="source-inspection-id" required value={sourceLookup} onChange={e=>setSourceLookup(e.target.value)} pattern="[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}" className="min-w-0 rounded-md border border-border bg-background p-sm"/>
        <Button type="submit" disabled={busy}>{m.sourceInspectOne}</Button>
      </form>
      {sources&&<section className="flex min-w-0 flex-col gap-sm" aria-label={m.checkSources}>
        <p className="text-body-sm text-muted-foreground">{m.sourceWindowHint}</p>
        <div className="flex flex-wrap gap-sm">
          <Button variant="outline" disabled={busy||sourceTrail.length<2||!!sources.page.documentId} onClick={()=>{const trail=sourceTrail.slice(0,-1);void checkSources({before:trail.at(-1)},trail);}}>{m.sourcePrevious}</Button>
          <Button variant="outline" disabled={busy||!sources.page.next} onClick={()=>void checkSources({before:sources.page.next!},[...sourceTrail,sources.page.next!])}>{m.sourceNext}</Button>
          <Button variant="outline" disabled={busy} onClick={()=>void checkSources(sources.page.documentId?{documentId:sources.page.documentId}:{...(sources.page.before?{before:sources.page.before}:{})},sourceTrail)}>{m.sourceRecheckWindow}</Button>
        </div>
        <p role="status" className="break-words text-body-sm">{m.sourceCheckCounts}: {sources.readable}/{sources.total} &middot; {m.sourceBlocked}: {sources.blocked}</p>
        <p className="break-words text-body-sm">{m.maintenanceChecked}: {sources.checkedAt}</p>
        {!sources.total&&<p className="text-body-sm">{m.sourceCheckEmpty}</p>}
        {sources.items.map(row=><div key={row.id} className="flex min-w-0 flex-col gap-xs rounded-md border border-border p-sm">
          <span className="break-words font-medium">{row.title}</span>
          <span className="break-all text-body-sm">{row.id} &middot; {row.mime??m.sourceUnknown} &middot; v{row.version??"-"}</span>
          <span className="break-all text-body-sm">{row.state} &middot; {row.parserVersion??m.sourceUnknown} &middot; {m.sourceCharacters}: {row.characters??"-"}</span>
          <span className="text-body-sm">{row.issues.length?row.issues.map(issue=>sourceIssues[issue]).join("; "):m.sourceReadable}</span>
        </div>)}
      </section>}
      <p className="text-body-sm text-muted-foreground">{m.taskOperationsHint}</p>
      <div className="flex flex-wrap gap-sm"><label htmlFor="compile-task-state">{m.taskStateFilter}</label>
        <select id="compile-task-state" value={taskState} disabled={busy} onChange={e=>void taskPage(undefined,e.target.value)} className="min-w-0 rounded-md border border-border bg-background p-sm"><option value="">{m.allTypes}</option>{COMPILE_TASK_STATES.map(state=><option key={state} value={state}>{state}</option>)}</select>
        <Button variant="outline" disabled={busy} onClick={()=>void taskPage(undefined,"")}>{m.taskLatest}</Button>
        <Button variant="outline" disabled={busy||taskTrail.length<2} onClick={()=>{const trail=taskTrail.slice(0,-1);void taskPage(trail.at(-1),taskState,trail);}}>{m.topicHistoryBack}</Button>
        <Button variant="outline" disabled={busy||!taskNext} onClick={()=>void taskPage(taskNext!,taskState,[...taskTrail,taskNext!])}>{m.taskOlder}</Button>
      </div>
      <form className="flex min-w-0 flex-wrap gap-sm" onSubmit={e=>{e.preventDefault();void openTask(taskLookup.trim());}}>
        <label htmlFor="compile-task-lookup">{m.taskLookup}</label><input id="compile-task-lookup" required value={taskLookup} onChange={e=>setTaskLookup(e.target.value)} pattern="[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}" className="min-w-0 rounded-md border border-border bg-background p-sm"/>
        <Button type="submit" disabled={busy}>{m.taskInspect}</Button>
      </form>
      <Button disabled={busy} onClick={()=>void run(async current=>{
        const taskId=createId.current??crypto.randomUUID();createId.current=taskId;
        await api.createTask(taskId);createId.current=null;
        const value=await api.tasks();if(current()){setTasks(value.tasks);setTaskNext(value.next??null);setTaskTrail([undefined]);setTaskState("");setTaskDetail(null);}
      })}>{m.createTask}</Button>
      <form className="flex min-w-0 flex-col gap-sm" onSubmit={e=>{
        e.preventDefault();let ids:string[];try{ids=compileSourceSelection(compileSourceText.trim().split(/[\s,]+/));}catch{setSourceSelectionInvalid(true);return;}
        setSourceSelectionInvalid(false);const key=ids.join(",");
        void run(async current=>{
          const pending=selectedCreateId.current?.key===key?selectedCreateId.current:{key,id:crypto.randomUUID()};selectedCreateId.current=pending;
          await api.createTask(pending.id,ids);selectedCreateId.current=null;
          const value=await api.tasks();if(current()){setTasks(value.tasks);setTaskNext(value.next??null);setTaskTrail([undefined]);setTaskState("");setTaskDetail(null);}
        });
      }}>
        <label htmlFor="compile-source-ids">{m.compileSelectedSources}</label>
        <p className="text-body-sm text-muted-foreground">{m.compileSelectedHint}</p>
        <textarea id="compile-source-ids" required disabled={busy} value={compileSourceText} maxLength={4000} rows={3} onChange={e=>{setCompileSourceText(e.target.value);setSourceSelectionInvalid(false);}} className="min-w-0 rounded-md border border-border bg-background p-sm font-mono text-code-sm"/>
        <Button variant="outline" type="button" disabled={busy||!sources?.readable} onClick={()=>{setCompileSourceText(sources!.items.filter(row=>!row.issues.length).map(row=>row.id).join("\n"));setSourceSelectionInvalid(false);}}>{m.useReadableSourceBatch}</Button>
        {sourceSelectionInvalid&&<p role="alert" className="text-body-sm">{m.compileSourceSelectionInvalid}</p>}
        <Button type="submit" disabled={busy||!compileSourceText.trim()}>{m.createSelectedTask}</Button>
      </form>
      {tasks.map(task=><div key={task.id} className="flex flex-wrap items-center gap-sm rounded-md border border-border p-sm">
        <span className="text-body-sm">{m.batch} {task.id.slice(0,8)} &middot; {task.attempt}/3 &middot;
          {task.state==="failed"?m.taskFailed:({queued:m.queued,running:m.running,completed:m.completed,needs_review:m.needs_review,suspended:m.suspended}[task.state]??task.state)}</span>
        {task.error_code&&<span className="break-all font-mono text-code-sm">{task.error_code}</span>}
        {task.created_at&&<span className="break-all text-body-sm">{String(task.created_at)}</span>}
        <Button variant="outline" disabled={busy} onClick={()=>void openTask(task.id)}>{m.taskInspect}</Button>
        {task.run_id?<Button variant="outline" disabled={busy} onClick={()=>void choose(task.run_id!)}>{m.completed}</Button>:
          task.state!=="needs_review"&&<Button variant="outline" disabled={busy||task.canRetry!==true} onClick={()=>void executeTask(task.id)}>{m.execute}</Button>}
      </div>)}
      {taskDetail?.sourceIds&&<p className="break-all text-body-sm">{m.compileSelectedSources}: {taskDetail.sourceIds.join(", ")}</p>}
      {taskDetail&&<section className="flex min-w-0 flex-col gap-sm rounded-md border border-border p-md">
        <h3 className="break-all text-title-sm">{m.taskInspect}: {taskDetail.id}</h3><p>{taskDetail.state} / {taskDetail.attempt} / 3</p>
        {taskDetail.error_code&&<p className="break-all font-mono text-code-sm">{taskDetail.error_code}</p>}
        {taskDetail.updated_at&&<p className="break-all text-body-sm">{String(taskDetail.updated_at)}</p>}
        {taskDetail.lease_until&&<p className="break-all text-body-sm">{m.taskLease}: {String(taskDetail.lease_until)}</p>}
        {taskDetail.sourceState==="changed"&&<Banner tone="warning" title={m.taskSourceChanged}/>}
        {taskDetail.canRetry&&<Button disabled={busy||taskDetail.sourceState!=="current"} onClick={()=>void executeTask(taskDetail.id)}>{m.execute}</Button>}
        {taskDetail.state==="needs_review"&&taskDetail.sourceState==="current"&&<TaskSelection key={`${taskDetail.id}/${taskDetail.resultHash}`} task={taskDetail} busy={busy} onSubmit={(ids,note)=>void run(async current=>{
          const result=await api.resolveTask(taskDetail.id,taskDetail.resultHash!,ids,note);
          const [value,page,loaded]=await Promise.all([api.tasks(),api.list(),api.detail(result.runId)]);
          if(current()){setTasks(value.tasks);setTaskNext(value.next??null);setTaskTrail([undefined]);setTaskState("");setTaskDetail(null);setList(page);setDetail(loaded);setNotes({});}
        })}/>}
        {!!taskDetail.result.selection&&<p className="break-words text-body-sm">{m.selectionRecorded}: {String((taskDetail.result.selection as {note?:string}).note??"")}</p>}
        {taskDetail.run_id&&<Button variant="outline" disabled={busy} onClick={()=>void choose(taskDetail.run_id!)}>{m.completed}</Button>}
      </section>}
    </CardContent></Card>
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
          <p className="text-body-sm">{m.added}: {preview.changes.added.length} &middot; {m.removed}: {preview.changes.removed.length} &middot; {m.changed}: {preview.changes.changed.length}</p>
          <PublicationImpact key={preview.fingerprint} value={preview.impact}/>
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
