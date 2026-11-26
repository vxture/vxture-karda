"use client";
import {useEffect,useRef,useState} from "react";
import Link from "next/link";
import {Banner,Button} from "@vxture/design-system";
import {PageHead} from "../../../_shell/PageHead";
import {useMessages} from "../../../_i18n/useMessages";
import {operations} from "../../../_i18n/messages/operations";
import {SignInGate} from "../../../_lib/ui";
import {OPERATION_STATES,OPERATION_PRIORITIES,OPERATION_UUID,type OperationCommand,type OperationRow,type OperationsResult,type OperationState,type OperationPriority} from "../../../kb/semantic/operations";

interface Library {id:string;name:string;ownerType:string}
export function OperationsClient({initialKb,initialTarget,initialType,initialTaskId}:{initialKb:string;initialTarget:string;initialType:string;initialTaskId?:string}){
  const m=useMessages(operations),[libraries,setLibraries]=useState<Library[]>([]),[result,setResult]=useState<OperationsResult|null>(null),
    [detail,setDetail]=useState<OperationsResult|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState(0),[saved,setSaved]=useState(false);
  const [kb,setKb]=useState(OPERATION_UUID.test(initialKb)?initialKb:""),[state,setState]=useState(""),[priority,setPriority]=useState(""),[overdue,setOverdue]=useState(false);
  const [createKb,setCreateKb]=useState(OPERATION_UUID.test(initialKb)?initialKb:""),[targetType,setTargetType]=useState(["document","relation"].includes(initialType)?initialType:"library"),
    [targetId,setTargetId]=useState(OPERATION_UUID.test(initialTarget)?initialTarget:"");
  const [title,setTitle]=useState(""),[note,setNote]=useState(""),[due,setDue]=useState(""),[taskPriority,setTaskPriority]=useState<OperationPriority>("normal"),[taskState,setTaskState]=useState<OperationState>("open");
  const [creating,setCreating]=useState(!!initialKb),[trail,setTrail]=useState<(string|undefined)[]>([undefined]);
  const sequence=useRef(0),locked=useRef(false),controller=useRef<AbortController|null>(null),pending=useRef<OperationCommand|null>(null);
  const endpoint="/api/knowledge-operations",current=detail?.tasks[0];
  function changed(){pending.current=null;setSaved(false);}
  function resetForm(row?:OperationRow){
    setTitle(row?.title??"");setNote("");setDue(row?.dueDate??"");setTaskPriority(row?.priority??"normal");setTaskState(row?.state??"open");changed();
  }
  async function json(url:string,signal:AbortSignal,command?:OperationCommand){
    const response=await fetch(url,{cache:"no-store",credentials:"same-origin",signal,...(command?{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(command)}:{})});
    if(!response.ok)throw {status:response.status};return response.json();
  }
  function query(before?:string,filter={kb,state,priority,overdue}){
    const params=new URLSearchParams();if(filter.kb)params.set("kbId",filter.kb);if(filter.state)params.set("state",filter.state);
    if(filter.priority)params.set("priority",filter.priority);if(filter.overdue)params.set("overdue","true");if(before)params.set("before",before);
    return `${endpoint}?${params}`;
  }
  async function run(work:(signal:AbortSignal)=>Promise<void>){
    if(locked.current)return;locked.current=true;const ticket=++sequence.current;controller.current?.abort();const abort=new AbortController();controller.current=abort;
    setBusy(true);setError(0);setSaved(false);
    try{await work(abort.signal);}catch(e){if(ticket===sequence.current){const status=(e as {status?:number})?.status??503;setError(status);setResult(null);setDetail(null);setLibraries([]);
      if([401,403,404,409].includes(status))pending.current=null;}}
    finally{if(ticket===sequence.current){locked.current=false;setBusy(false);}}
  }
  useEffect(()=>{if(initialTaskId&&OPERATION_UUID.test(initialTaskId))void open(initialTaskId);else void refresh();return()=>{sequence.current++;controller.current?.abort();locked.current=false;};},[]);
  async function refresh(){
    setResult(null);setDetail(null);resetForm();setTrail([undefined]);
    await run(async signal=>{const [page,libs]=await Promise.all([json(query(),signal),json("/api/kb",signal)]);setResult(page);setLibraries(libs.knowledgeBases??[]);});
  }
  async function load(before?:string,nextTrail:(string|undefined)[]=[undefined],filter={kb,state,priority,overdue}){
    setResult(null);setDetail(null);resetForm();
    await run(async signal=>{const [page,libs]=await Promise.all([json(query(before,filter),signal),json("/api/kb",signal)]);setResult(page);setLibraries(libs.knowledgeBases??[]);setTrail(nextTrail);});
  }
  async function open(id:string,historyBefore?:number){
    setDetail(null);setCreating(false);resetForm();
    await run(async signal=>{const value=await json(`${endpoint}?taskId=${id}${historyBefore?`&historyBefore=${historyBefore}`:""}`,signal);setDetail(value);resetForm(value.tasks[0]);});
  }
  async function save(){
    const taskId=current?.taskId??crypto.randomUUID();
    const fields={title:title.trim(),note:note.trim(),priority:taskPriority,state:taskState,dueDate:due||null};
    const command=pending.current??(creating?{action:"create",eventId:crypto.randomUUID(),taskId,kbId:createKb,targetType:targetType as "library"|"document"|"relation",
      targetId:targetType==="library"?createKb:targetId,...fields,state:"open"}:{action:"update",eventId:crypto.randomUUID(),taskId,expectedRevision:current!.revision,...fields}) as OperationCommand;
    pending.current=command;
    await run(async signal=>{
      await json(endpoint,signal,command);pending.current=null;
      const [value,page]=await Promise.all([json(`${endpoint}?taskId=${command.taskId}`,signal),json(query(),signal)]);
      setDetail(value);setResult(page);setCreating(false);setTrail([undefined]);resetForm(value.tasks[0]);setSaved(true);
    });
  }
  if(error===401)return <SignInGate from="/pipeline/operations"/>;
  const targetLink=(row:OperationRow)=>row.targetType==="relation"?`/assets/${row.kbId}/maintenance`:
    row.targetType==="document"?`/assets/${row.kbId}/sources`:`/assets/${row.kbId}/knowledge`;
  return <div className="flex min-w-0 flex-col gap-md" aria-busy={busy}>
    <PageHead title={m.title}/><p>{m.hint}</p><p className="text-body-sm text-muted-foreground">{m.scope}</p>
    <div className="flex flex-wrap gap-sm"><Button variant="outline" disabled={busy} onClick={()=>void refresh()}>{m.refresh}</Button>
      <Button disabled={busy} onClick={()=>{setCreating(true);setDetail(null);resetForm();}}>{m.create}</Button></div>
    {error!==0&&<Banner tone="danger" title={error===403?m.denied:error===409?m.conflict:error===404?m.missing:m.unavailable}/>}
    {error>=500&&pending.current&&<Button variant="outline" disabled={busy} onClick={()=>void save()}>{m.retry}</Button>}
    {saved&&<Banner tone="success" title={m.saved}/>}
    <form className="flex min-w-0 flex-wrap items-end gap-sm" onSubmit={e=>{e.preventDefault();void load();}}>
      <label>{m.library}<select aria-label={m.library} className="block max-w-full rounded border p-sm" value={kb} onChange={e=>setKb(e.target.value)}>
        <option value="">{m.all}</option>{libraries.map(lib=><option key={lib.id} value={lib.id}>{lib.name}</option>)}</select></label>
      <label>{m.state}<select aria-label={m.state} className="block rounded border p-sm" value={state} onChange={e=>setState(e.target.value)}><option value="">{m.all}</option>{OPERATION_STATES.map(s=><option key={s} value={s}>{m[s]}</option>)}</select></label>
      <label>{m.priority}<select aria-label={m.priority} className="block rounded border p-sm" value={priority} onChange={e=>setPriority(e.target.value)}><option value="">{m.all}</option>{OPERATION_PRIORITIES.map(p=><option key={p} value={p}>{m[p]}</option>)}</select></label>
      <label><input type="checkbox" checked={overdue} onChange={e=>setOverdue(e.target.checked)}/> {m.overdue}</label><Button disabled={busy} type="submit">{m.filter}</Button>
    </form>
    {result&&<section className="grid min-w-0 gap-sm"><p>{m.pageScope} {result.tasks.length} / {result.checkedAt}</p>
      {!result.tasks.length&&<p>{m.empty}</p>}{result.tasks.map(row=><article key={row.taskId} className="grid min-w-0 gap-sm rounded border p-md">
        <Button className="h-auto whitespace-normal break-words text-left" variant="outline" disabled={busy} onClick={()=>void open(row.taskId)}>{row.title}</Button>
        <p className="break-words">{row.libraryName} / {m[row.state]} / {m[row.priority]} / {row.dueDate??m.noDue}</p>
        <small className="break-all">{row.taskId}</small></article>)}
      <div className="flex gap-sm"><Button variant="outline" disabled={busy||trail.length<2} onClick={()=>{const prev=trail.slice(0,-1);void load(prev.at(-1),prev);}}>{m.previous}</Button>
        <Button variant="outline" disabled={busy||!result.nextBefore} onClick={()=>void load(result.nextBefore!,[...trail,result.nextBefore!])}>{m.next}</Button></div>
    </section>}
    {(creating||current)&&<section className="grid min-w-0 gap-sm rounded border p-md"><h2>{creating?m.create:m.edit}</h2>
      {creating?<><label>{m.library}<select aria-label={m.library} required className="block w-full rounded border p-sm" value={createKb} onChange={e=>{setCreateKb(e.target.value);changed();}}><option value="">{m.choose}</option>{libraries.map(lib=><option key={lib.id} value={lib.id}>{lib.name}</option>)}</select></label>
        <label>{m.target}<select aria-label={m.target} className="block w-full rounded border p-sm" value={targetType} onChange={e=>{setTargetType(e.target.value);changed();}}>{["library","document","relation"].map(s=><option key={s} value={s}>{m[s as "library"]}</option>)}</select></label>
        {targetType!=="library"&&<label>{m.targetId}<input className="block w-full rounded border p-sm" value={targetId} onChange={e=>{setTargetId(e.target.value);changed();}}/></label>}</>:
        <><p className="break-all">{current!.libraryName} / {m[current!.targetType as "library"]} / {current!.targetId}</p>
          <div className="flex flex-wrap gap-sm"><Link className="underline" href={targetLink(current!)}>{m.inspect}</Link>
            <Link className="underline" href={`/assets/${current!.kbId}/semantic`}>{m.review}</Link><Link className="underline" href={`/assets/${current!.kbId}/graph`}>{m.graph}</Link></div></>}
      <label>{m.taskTitle}<input maxLength={200} className="block w-full rounded border p-sm" value={title} onChange={e=>{setTitle(e.target.value);changed();}}/></label>
      {!creating&&<label>{m.state}<select aria-label={m.state} className="block w-full rounded border p-sm" value={taskState} onChange={e=>{setTaskState(e.target.value as OperationState);changed();}}>
        {OPERATION_STATES.filter(s=>!["resolved","dismissed"].includes(current!.state)||s==="open"||s===current!.state).map(s=><option key={s} value={s}>{m[s]}</option>)}</select></label>}
      <label>{m.priority}<select aria-label={m.priority} className="block w-full rounded border p-sm" value={taskPriority} onChange={e=>{setTaskPriority(e.target.value as OperationPriority);changed();}}>{OPERATION_PRIORITIES.map(p=><option key={p} value={p}>{m[p]}</option>)}</select></label>
      <label>{m.due}<input type="date" className="block w-full rounded border p-sm" value={due} onChange={e=>{setDue(e.target.value);changed();}}/></label>
      <label>{m.note}<textarea maxLength={10000} className="block w-full rounded border p-sm" rows={4} value={note} onChange={e=>{setNote(e.target.value);changed();}}/></label>
      <p>{m.closeHint}</p><Button disabled={busy||!title.trim()||!note.trim()||(creating&&(!createKb||(targetType!=="library"&&!OPERATION_UUID.test(targetId))))||(!creating&&!current)} onClick={()=>void save()}>{m.save}</Button>
    </section>}
    {detail&&<section className="grid min-w-0 gap-sm"><h2>{m.history}</h2>{detail.history.map(row=><article key={row.revision} className="min-w-0 rounded border p-md">
      <p>{m.revision} {row.revision} / {m[row.state]} / {m[row.priority]} / {row.dueDate??m.noDue}</p><p className="break-all">{row.createdAt} / {row.actor}</p>
      <p className="whitespace-pre-wrap break-words">{row.note}</p></article>)}
      {detail.nextHistoryBefore&&<Button variant="outline" disabled={busy} onClick={()=>void open(detail.tasks[0].taskId,detail.nextHistoryBefore!)}>{m.historyMore}</Button>}
      </section>}
  </div>;
}
