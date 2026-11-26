"use client";
import {useEffect,useRef,useState} from "react";
import {Banner,Button,Card,CardContent} from "@vxture/design-system";
import {PageHead} from "../../_shell/PageHead";
import {useMessages} from "../../_i18n/useMessages";
import {semantic} from "../../_i18n/messages/semantic";
import {SignInGate} from "../../_lib/ui";
import type {RolloutCommand,RolloutState} from "../../kb/semantic/rollout-control";

export function KnowledgeControlClient(){
  const m=useMessages(semantic),[state,setState]=useState<RolloutState|null>(null),[reason,setReason]=useState(""),[busy,setBusy]=useState(false),[error,setError]=useState(0);
  const sequence=useRef(0),controller=useRef<AbortController|null>(null),pending=useRef<RolloutCommand|null>(null);
  useEffect(()=>{void load();return()=>{sequence.current++;controller.current?.abort();};},[]);
  async function load(command?:RolloutCommand){
    const ticket=++sequence.current;controller.current?.abort();const current=new AbortController();controller.current=current;
    setBusy(true);setError(0);setState(null);
    try{
      const response=await fetch("/api/knowledge-rollout",{method:command?"POST":"GET",cache:"no-store",credentials:"same-origin",signal:current.signal,
        ...(command?{headers:{"Content-Type":"application/json"},body:JSON.stringify(command)}:{})});
      if(ticket!==sequence.current)return;
      if(!response.ok){if([400,401,403,409].includes(response.status))pending.current=null;setError(response.status);return;}
      const value=await response.json();if(ticket!==sequence.current)return;
      if(value.format!=="karda.knowledge-rollout.v1"||!Number.isInteger(value.revision)||typeof value.enabled!=="boolean"||!Array.isArray(value.history))throw Error("invalid_response");
      pending.current=null;setState(value);if(command)setReason("");
    }catch{if(ticket===sequence.current)setError(503);}finally{if(ticket===sequence.current)setBusy(false);}
  }
  function change(){if(!state||!reason.trim())return;const command={eventId:crypto.randomUUID(),expectedRevision:state.revision,enabled:!state.enabled,reason:reason.trim()};pending.current=command;void load(command);}
  if(error===401)return <SignInGate from="/knowledge-control"/>;
  return <div className="flex min-w-0 flex-col gap-md" aria-busy={busy}>
    <PageHead title={m.rolloutTitle}/><p>{m.rolloutHint}</p><p className="text-body-sm text-muted-foreground">{m.rolloutBoundary}</p>
    <Button variant="outline" disabled={busy} onClick={()=>void load()}>{m.rolloutRefresh}</Button>
    {busy&&<p role="status">{m.loading}</p>}
    {!!error&&<Banner tone="danger" title={error===403?m.rolloutDenied:error===409?m.rolloutConflict:m.rolloutUnavailable}/>}
    {error===503&&pending.current&&<Button disabled={busy} onClick={()=>void load(pending.current!)}>{m.rolloutRetry}</Button>}
    {state&&<>
      <Card><CardContent className="flex min-w-0 flex-col gap-sm p-md"><p role="status">{state.enabled?m.rolloutEnabled:m.rolloutPaused} / {m.rolloutRevision}: {state.revision}</p>
        <label htmlFor="rollout-reason">{m.rolloutReason}</label><textarea id="rollout-reason" value={reason} maxLength={1000} onChange={e=>setReason(e.target.value)} className="min-w-0 rounded-md border border-border bg-background p-sm"/>
        <Button variant="outline" disabled={busy||!reason.trim()} onClick={change}>{state.enabled?m.rolloutPause:m.rolloutResume}</Button>
      </CardContent></Card>
      <h2 className="text-title-sm">{m.rolloutHistory}</h2>{!state.history.length&&<p>{m.rolloutDefault}</p>}
      {state.history.map(event=><Card key={event.revision}><CardContent className="flex min-w-0 flex-col gap-sm p-md">
        <p>{event.revision} / {event.enabled?m.rolloutEnabled:m.rolloutPaused}</p><p className="break-words">{event.reason}</p>
        <p className="break-all font-mono text-code-sm">{event.changedBy} / {event.createdAt} / {event.eventId}</p>
      </CardContent></Card>)}
    </>}
  </div>;
}
