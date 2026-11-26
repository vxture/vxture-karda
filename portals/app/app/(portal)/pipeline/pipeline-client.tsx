"use client";
import {useEffect,useRef,useState} from "react";
import Link from "next/link";
import {Banner,Button} from "@vxture/design-system";
import {PageHead} from "../../_shell/PageHead";
import {useMessages} from "../../_i18n/useMessages";
import {workCenter} from "../../_i18n/messages/work-center";
import {SignInGate} from "../../_lib/ui";
import {WORK_KINDS,WORK_STATES,workHref,type WorkCenter} from "../../kb/processing/work-center";

export function PipelineClient(){
  const m=useMessages(workCenter),[value,setValue]=useState<WorkCenter|null>(null),[error,setError]=useState(0),[busy,setBusy]=useState(false),
    [kb,setKb]=useState(""),[kind,setKind]=useState(""),[state,setState]=useState(""),[trail,setTrail]=useState<(string|undefined)[]>([undefined]);
  const sequence=useRef(0),controller=useRef<AbortController|null>(null);
  const [libraries,setLibraries]=useState<WorkCenter["libraries"]>([]);
  useEffect(()=>{void load();return()=>{sequence.current++;controller.current?.abort();};},[]);
  async function load(before?:string,nextTrail:(string|undefined)[]=[undefined],filter={kb,kind,state}){
    const ticket=++sequence.current;controller.current?.abort();const abort=new AbortController();controller.current=abort;
    setValue(null);setError(0);setBusy(true);
    const params=new URLSearchParams();if(filter.kb)params.set("kbId",filter.kb);if(filter.kind)params.set("kind",filter.kind);if(filter.state)params.set("state",filter.state);if(before)params.set("before",before);
    try{
      const response=await fetch(`/api/pipeline?${params}`,{cache:"no-store",credentials:"same-origin",signal:abort.signal});
      if(ticket!==sequence.current)return;
      if(!response.ok){setError(response.status);setLibraries([]);return;}
      const result=await response.json() as WorkCenter;if(ticket!==sequence.current)return;
      if(result.format!=="karda.work-center.v1"||!Array.isArray(result.items)||!Array.isArray(result.libraries)||!Array.isArray(result.counts))throw Error("invalid_response");
      result.items=result.items.map(item=>({...item,href:workHref(item)}));
      setValue(result);setLibraries(result.libraries);setTrail(nextTrail);
    }catch{if(ticket===sequence.current){setError(503);setLibraries([]);}}finally{if(ticket===sequence.current)setBusy(false);}
  }
  function filterChanged(){sequence.current++;controller.current?.abort();setValue(null);setError(0);setBusy(false);setTrail([undefined]);}
  if(error===401)return <SignInGate from="/pipeline"/>;
  const rawState=(key:string)=>m[key as keyof typeof m]??key;
  return <div className="flex min-w-0 flex-col gap-md" aria-busy={busy}>
    <PageHead title={m.title}/><p>{m.hint}</p><p className="text-body-sm text-muted-foreground">{m.scope}</p>
    <div className="flex flex-wrap gap-sm"><Button variant="outline" disabled={busy} onClick={()=>void load()}>{m.refresh}</Button>
      <Button variant="outline" asChild><Link href="/assets">{m.libraries}</Link></Button>
      <Button variant="outline" asChild><Link href="/pipeline/operations">{m.maintenanceCenter}</Link></Button></div>
    <form className="flex min-w-0 flex-wrap items-end gap-sm" onSubmit={e=>{e.preventDefault();void load();}}>
      <label>{m.library}<select aria-label={m.library} className="block max-w-full rounded border p-sm" value={kb} onChange={e=>{filterChanged();setKb(e.target.value);}}>
        <option value="">{m.all}</option>{libraries.map(lib=><option key={lib.id} value={lib.id}>{lib.name}</option>)}</select></label>
      <label>{m.kind}<select aria-label={m.kind} className="block rounded border p-sm" value={kind} onChange={e=>{filterChanged();setKind(e.target.value);}}>
        <option value="">{m.all}</option>{WORK_KINDS.map(k=><option key={k} value={k}>{m[k]}</option>)}</select></label>
      <label>{m.state}<select aria-label={m.state} className="block rounded border p-sm" value={state} onChange={e=>{filterChanged();setState(e.target.value);}}>
        <option value="">{m.all}</option>{WORK_STATES.map(s=><option key={s} value={s}>{m[s]}</option>)}</select></label>
      <Button type="submit" disabled={busy}>{m.apply}</Button></form>
    {busy&&<p role="status">{m.loading}</p>}
    {error!==0&&<Banner tone="danger" title={error===403?m.denied:error===409?m.changed:m.unavailable}/>}
    {value&&<>
      <p>{m.checked} {value.checkedAt}</p><p>{m.countScope}</p>
      <div className="grid gap-sm sm:grid-cols-5">{WORK_STATES.map(s=><Button key={s} variant={state===s?"default":"outline"} disabled={busy}
        onClick={()=>{setState(s);void load(undefined,[undefined],{kb,kind,state:s});}}>{m[s]} ({value.counts.filter(c=>c.state===s).reduce((n,c)=>n+c.count,0)})</Button>)}</div>
      <p>{m.pageScope} {value.items.length}</p>
      {!value.items.length&&<p>{m.empty}</p>}
      <section className="grid min-w-0 gap-sm">{value.items.map(item=><article key={`${item.kind}/${item.id}`} className="grid min-w-0 gap-sm rounded border p-md">
        <h2 className="break-words text-title-sm">{item.title||m[item.kind]}</h2>
        <p className="break-words">{item.libraryName} / {m[item.kind]} / {m[item.state]} / {rawState(item.rawState)}</p>
        <p>{item.stage&&<>{m.stage}: {rawState(item.stage)} / </>}{item.attempt!==null&&<>{m.attempt}: {item.attempt}</>}</p>
        <small className="break-all">{m.created}: {item.createdAt} / {m.observed}: {item.updatedAt}</small>
        <small className="break-all">{item.id}</small>
        <div className="flex flex-wrap gap-sm"><Button variant="outline" asChild><Link href={item.href}>{m.open}</Link></Button>
          <Link className="underline" href={`/assets/${item.kbId}/maintenance`}>{m.inspect}</Link>
          <Link className="underline" href={`/pipeline/operations?kbId=${item.kbId}`}>{m.createWork}</Link></div>
      </article>)}</section>
      <div className="flex flex-wrap gap-sm"><Button variant="outline" disabled={busy||trail.length<2} onClick={()=>{const prev=trail.slice(0,-1);void load(prev.at(-1),prev);}}>{m.previous}</Button>
        <Button variant="outline" disabled={busy||!value.nextBefore} onClick={()=>void load(value.nextBefore!,[...trail,value.nextBefore!])}>{m.next}</Button></div>
    </>}
  </div>;
}
