"use client";
import {integration} from "../../../../_i18n/messages/integration";
import {useEffect,useMemo,useRef,useState} from "react";
import Link from "next/link";
import {Banner,Button,Card,CardContent} from "@vxture/design-system";
import {PageHead} from "../../../../_shell/PageHead";
import {useMessages} from "../../../../_i18n/useMessages";
import {semantic} from "../../../../_i18n/messages/semantic";
import {SignInGate} from "../../../../_lib/ui";
import {compareAuditReleases,type AuditHistory} from "../../../../kb/semantic/audit-history";

export function HistoryClient({kbId}:{kbId:string}){
  const im=useMessages(integration);
  const m=useMessages(semantic),sequence=useRef(0),[data,setData]=useState<AuditHistory|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState(0);
  const [from,setFrom]=useState(""),[to,setTo]=useState("");
  async function load(before?:number){
    const ticket=++sequence.current;setBusy(true);setError(0);setData(null);setFrom("");setTo("");
    try{
      const response=await fetch(`/api/kb/${encodeURIComponent(kbId)}/history${before?`?before=${before}`:""}`,{cache:"no-store",credentials:"same-origin"});
      if(!response.ok){if(ticket===sequence.current)setError(response.status);return;}
      const value=await response.json() as AuditHistory;
      if(ticket===sequence.current){setData(value);const eligible=value.releases.filter(r=>r.verified);setTo(eligible[0]?.id??"");setFrom(eligible[1]?.id??"");}
    }catch{if(ticket===sequence.current)setError(503);}finally{if(ticket===sequence.current)setBusy(false);}
  }
  useEffect(()=>{void load();return()=>{sequence.current++;};
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[]);
  const comparison=useMemo(()=>{const a=data?.releases.find(r=>r.id===from),b=data?.releases.find(r=>r.id===to);
    return a&&b&&a.verified&&b.verified&&a.generation<b.generation?compareAuditReleases(a,b):null;},[data,from,to]);
  if(error===401)return <SignInGate from={`/assets/${kbId}/history`}/>;
  return <div className="flex min-w-0 flex-col gap-md" aria-busy={busy}>
    <PageHead title={m.historyTitle}/><p className="text-body-sm text-muted-foreground">{m.historyHint}</p>
    <div className="flex flex-wrap gap-sm"><Button disabled={busy} variant="outline" onClick={()=>void load()}>{m.historyLatest}</Button>
      <Button variant="outline" asChild><Link href={`/assets/${kbId}/maintenance`}>{m.maintenanceTitle}</Link></Button>
      <Button variant="outline" asChild><Link href={`/assets/${kbId}/graph`}>{m.graphTitle}</Link></Button></div>
    {busy&&<p role="status">{m.loading}</p>}{!!error&&<Banner tone="danger" title={error===403?m.denied:m.unavailable}/>}
    {data&&<>
      <Banner tone={data.replay==="failed"?"danger":data.replay==="window"?"warning":"success"} title={!data.releases.length?im.emptyHistory:data.replay==="complete"?m.historyComplete:data.replay==="window"?m.historyWindow:m.historyFailed}/>
      <p className="break-all text-body-sm">{m.generation}: {data.headGeneration} / {data.checkedAt}</p>
      <div className="flex flex-wrap gap-sm"><label htmlFor="history-from">{m.historyFrom}</label><select id="history-from" value={from} onChange={e=>setFrom(e.target.value)} className="min-w-0 rounded-md border border-border bg-background p-sm"><option value="">-</option>{data.releases.filter(r=>r.verified).map(r=><option key={r.id} value={r.id}>v{r.generation}</option>)}</select>
        <label htmlFor="history-to">{m.historyTo}</label><select id="history-to" value={to} onChange={e=>setTo(e.target.value)} className="min-w-0 rounded-md border border-border bg-background p-sm"><option value="">-</option>{data.releases.filter(r=>r.verified).map(r=><option key={r.id} value={r.id}>v{r.generation}</option>)}</select></div>
      {comparison?<section aria-label={m.historyComparison} className="flex min-w-0 flex-col gap-sm">
        <h2 className="text-title-md">{m.historyComparison}</h2>
        {(["added","removed","changed"] as const).map(kind=><div key={kind}><h3>{m[kind]} ({comparison[kind].length})</h3><ul>{comparison[kind].map(id=><li className="break-all font-mono text-code-sm" key={id}>{id}</li>)}</ul></div>)}
        <h3>{m.historySources} ({comparison.sourceChanges.length})</h3>{comparison.sourceChanges.map(row=><p className="break-all font-mono text-code-sm" key={row.documentId}>{row.documentId} / v{row.before?.version??"-"} &rarr; v{row.after?.version??"-"}</p>)}
      </section>:data.releases.length>1&&<p>{m.historyChoose}</p>}
      <h2 className="text-title-md">{m.historyTimeline}</h2>
      {data.releases.map(row=><Card key={row.id}><CardContent className="flex min-w-0 flex-col gap-sm p-md">
        <h3>v{row.generation} / {row.verified?m.historyVerified:m.historyCorrupt}</h3>
        <p className="break-all text-body-sm">{row.createdAt} / {row.createdBy}</p>
        <p className="break-all font-mono text-code-sm">{row.id} / {row.compileRunId}</p>
        <p>{row.relations.length} {m.relations} / {row.sources.length} {m.historySources} / {row.reviewCount} {m.historyReviews}</p>
        {!!row.issues.length&&<p role="alert">{m.historyCorrupt}</p>}
        <details><summary>{m.historyStructure}</summary>{row.relations.map(r=><p key={r.id} className="break-all font-mono text-code-sm">{r.id}: {r.sourceId} &rarr; {r.type} &rarr; {r.targetId}</p>)}</details>
      </CardContent></Card>)}
      {!data.releases.length&&<p>{m.historyEmpty}</p>}
      {data.nextBefore!==null&&<Button variant="outline" disabled={busy} onClick={()=>void load(data.nextBefore!)}>{m.historyOlder}</Button>}
    </>}
  </div>;
}
