"use client";
import {useEffect,useRef,useState,useMemo} from "react";
import Link from "next/link";
import {Banner,Button,Card,CardContent} from "@vxture/design-system";
import {PageHead} from "../../../../_shell/PageHead";
import {useMessages} from "../../../../_i18n/useMessages";
import {semantic} from "../../../../_i18n/messages/semantic";
import {SignInGate} from "../../../../_lib/ui";
import type {MaintenanceReport} from "../../../../kb/semantic/maintenance";
import {maintenanceImpact,MAINTENANCE_ISSUES} from "../../../../kb/semantic/maintenance-impact";

export function MaintenanceClient({kbId}:{kbId:string}){
  const m=useMessages(semantic),sequence=useRef(0);
  const [report,setReport]=useState<MaintenanceReport|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState(0);
  const [selected,setSelected]=useState(""),[onlyIssues,setOnlyIssues]=useState(true);
  const [issue,setIssue]=useState(""),[query,setQuery]=useState(""),[hops,setHops]=useState(0),[page,setPage]=useState(0);
  const impact=useMemo(()=>report?maintenanceImpact(report,selected,hops,!onlyIssues):null,[report,selected,hops,onlyIssues]);
  const rows=useMemo(()=>impact?.rows.filter(r=>(!issue||r.issues.includes(issue as typeof r.issues[number]))&&
    (!onlyIssues||r.depth>0||r.issues.length>0)&&`${r.id} ${r.sourceId} ${r.type} ${r.targetId}`.toLowerCase().includes(query.toLowerCase()))??[],[impact,issue,onlyIssues,query]);
  useEffect(()=>{void load();return()=>{sequence.current++;};
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[]);
  async function load(){
    const ticket=++sequence.current;setBusy(true);setError(0);setReport(null);setSelected("");setPage(0);setIssue("");setQuery("");setHops(0);
    try{
      const response=await fetch(`/api/kb/${encodeURIComponent(kbId)}/semantic?view=maintenance`,{cache:"no-store"});
      if(ticket!==sequence.current)return;
      if(!response.ok){setError(response.status);return;}
      const value=await response.json() as MaintenanceReport;
      if(ticket===sequence.current)setReport(value);
    }catch{if(ticket===sequence.current)setError(503);}
    finally{if(ticket===sequence.current)setBusy(false);}
  }
  if(error===401)return <SignInGate from={`/assets/${kbId}/maintenance`}/>;
  const affected=report?.relations.filter(row=>row.issues.length).length??0;
  return <div className="flex min-w-0 flex-col gap-md" aria-busy={busy}>
    <PageHead title={m.maintenanceTitle}/>
    <Link href={`/assets/${kbId}/knowledge`}>{m.back}</Link>
    <p className="text-body-sm text-muted-foreground">{m.maintenanceHint}</p>
    <div className="flex flex-wrap gap-sm">
      <Button variant="outline" disabled={busy} onClick={()=>void load()}>{m.refresh}</Button>
      {report&&<Button variant="outline" asChild><a href={`/api/kb/${kbId}/semantic?view=maintenance&format=json`}>{m.impactExport}</a></Button>}
      <Button variant="outline" asChild><Link href={`/assets/${kbId}/history`}>{m.historyTitle}</Link></Button>
      <Button variant="outline" asChild><Link href={`/assets/${kbId}/topics`}>{m.dossierTitle}</Link></Button>
      <Button asChild><Link href={`/assets/${kbId}/semantic`}>{m.maintenanceRebuild}</Link></Button>
      <Button variant="outline" asChild><Link href={`/assets/${kbId}/published`}>{m.knowledgeTitle}</Link></Button>
      <Button variant="outline" asChild><Link href={`/assets/${kbId}/graph`}>{m.graphTitle}</Link></Button>
    </div>
    {busy&&<p role="status">{m.loading}</p>}
    {!!error&&<Banner tone="danger" title={error===403?m.denied:m.unavailable}/>}
    {report&&<>
      <p className="break-all text-body-sm">{m.generation}: {report.generation} / {m.maintenanceChecked}: {report.checkedAt}</p>
      {!report.releaseId?<Banner tone="warning" title={m.noPublished}/>:<>
        <p role="status">{m.maintenanceAffected}: {affected} / {report.relations.length}</p>
        <p className="text-body-sm text-muted-foreground">{m.impactHint}</p>
        <div className="flex flex-wrap gap-sm">{impact?.counts.filter(c=>c.count).map(c=><Button key={c.issue} variant={issue===c.issue?"default":"outline"} onClick={()=>{setIssue(issue===c.issue?"":c.issue);setPage(0);}}>{m[c.issue]} ({c.count})</Button>)}</div>
        <h2 className="text-title-md">{m.maintenanceSources}</h2>
        <Button variant="outline" onClick={()=>{setSelected("");setPage(0);}} aria-pressed={!selected}>{m.maintenanceAll}</Button>
        <div className="grid min-w-0 gap-sm md:grid-cols-2">{report.sources.map(source=><Card key={source.id}>
          <CardContent className="flex min-w-0 flex-col gap-sm p-md">
            <Button variant="outline" className="h-auto whitespace-normal break-all" aria-pressed={selected===source.id}
              onClick={()=>{setSelected(source.id);setPage(0);}}>{source.title}</Button>
            <p className="break-all font-mono text-code-sm">{source.id} / v{source.publishedVersion} &rarr; v{source.currentVersion??"?"}</p>
            <p>{m.maintenanceAffected}: {source.relationIds.length}</p>
            <ul>{source.issues.map(issue=><li key={issue}>{m[issue]}</li>)}</ul>
          </CardContent>
        </Card>)}</div>
        <h2 className="text-title-md">{m.maintenanceRelations}</h2>
        <div className="flex min-w-0 flex-wrap gap-sm"><label htmlFor="impact-issue">{m.impactIssue}</label><select id="impact-issue" value={issue} onChange={e=>{setIssue(e.target.value);setPage(0);}} className="min-w-0 rounded-md border border-border bg-background p-sm"><option value="">{m.allTypes}</option>{MAINTENANCE_ISSUES.map(i=><option key={i} value={i}>{m[i]}</option>)}</select>
          <label htmlFor="impact-hops">{m.impactHops}</label><select id="impact-hops" value={hops} onChange={e=>{setHops(Number(e.target.value));setPage(0);}} className="rounded-md border border-border bg-background p-sm">{[0,1,2,3].map(n=><option key={n} value={n}>{n}</option>)}</select>
          <label htmlFor="impact-search">{m.impactSearch}</label><input id="impact-search" maxLength={200} value={query} onChange={e=>{setQuery(e.target.value);setPage(0);}} className="min-w-0 rounded-md border border-border bg-background p-sm"/>
        </div>
        <label className="flex items-center gap-sm"><input type="checkbox" checked={onlyIssues} onChange={e=>{setOnlyIssues(e.target.checked);setPage(0);}}/>{m.maintenanceOnlyIssues}</label>
        <p role="status">{m.impactDirect}: {impact?.directCount} / {m.impactRelated}: {impact?.rows.filter(r=>r.depth>0).length} / {m.graphNodes}: {impact?.entityIds.length}</p>
        {impact?.truncated&&<Banner tone="warning" title={m.impactTruncated}/>}
        <div className="flex flex-wrap gap-sm"><Button variant="outline" disabled={!page} onClick={()=>setPage(p=>p-1)}>{m.topicHistoryBack}</Button><span>{page+1} / {Math.max(1,Math.ceil(rows.length/50))} ({rows.length})</span><Button variant="outline" disabled={(page+1)*50>=rows.length} onClick={()=>setPage(p=>p+1)}>{m.more}</Button></div>
        {rows.slice(page*50,(page+1)*50).map(row=><Card key={row.id}>
          <CardContent className="flex min-w-0 flex-col gap-sm p-md">
            <p className="break-all font-mono text-code-sm">{row.id}</p>
            <p className="break-all">{row.sourceId} &rarr; {row.type} &rarr; {row.targetId}</p>
            <p className="text-body-sm">{row.depth===0?m.impactDirect:m.impactRelated} / {row.depth}</p>
            <ul className="text-body-sm">{row.actions.map(action=><li key={action}>{m[action]}</li>)}</ul>
            <ul>{row.issues.map(issue=><li key={issue}>{m[issue]}</li>)}</ul>
            {!row.issues.length&&<p>{m.maintenanceNoIssues}</p>}
          </CardContent>
        </Card>)}
        {!rows.length&&<p>{m.maintenanceEmpty}</p>}
      </>}
    </>}
  </div>;
}
