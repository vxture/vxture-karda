"use client";
import {useEffect,useRef,useState} from "react";
import Link from "next/link";
import {Banner,Button,Card,CardContent} from "@vxture/design-system";
import {PageHead} from "../../../../_shell/PageHead";
import {useMessages} from "../../../../_i18n/useMessages";
import {semantic} from "../../../../_i18n/messages/semantic";
import {SignInGate} from "../../../../_lib/ui";
import type {MaintenanceReport} from "../../../../kb/semantic/maintenance";

export function MaintenanceClient({kbId}:{kbId:string}){
  const m=useMessages(semantic),sequence=useRef(0);
  const [report,setReport]=useState<MaintenanceReport|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState(0);
  const [selected,setSelected]=useState(""),[onlyIssues,setOnlyIssues]=useState(true);
  useEffect(()=>{void load();return()=>{sequence.current++;};
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[]);
  async function load(){
    const ticket=++sequence.current;setBusy(true);setError(0);setReport(null);setSelected("");
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
      <Button variant="outline" asChild><Link href={`/assets/${kbId}/history`}>{m.historyTitle}</Link></Button>
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
        <h2 className="text-title-md">{m.maintenanceSources}</h2>
        <Button variant="outline" onClick={()=>setSelected("")} aria-pressed={!selected}>{m.maintenanceAll}</Button>
        <div className="grid min-w-0 gap-sm md:grid-cols-2">{report.sources.map(source=><Card key={source.id}>
          <CardContent className="flex min-w-0 flex-col gap-sm p-md">
            <Button variant="outline" className="h-auto whitespace-normal break-all" aria-pressed={selected===source.id}
              onClick={()=>setSelected(source.id)}>{source.title}</Button>
            <p className="break-all font-mono text-code-sm">{source.id} / v{source.publishedVersion} &rarr; v{source.currentVersion??"?"}</p>
            <p>{m.maintenanceAffected}: {source.relationIds.length}</p>
            <ul>{source.issues.map(issue=><li key={issue}>{m[issue]}</li>)}</ul>
          </CardContent>
        </Card>)}</div>
        <h2 className="text-title-md">{m.maintenanceRelations}</h2>
        <label className="flex items-center gap-sm"><input type="checkbox" checked={onlyIssues} onChange={e=>setOnlyIssues(e.target.checked)}/>{m.maintenanceOnlyIssues}</label>
        {report.relations.filter(row=>(!selected||row.documentIds.includes(selected))&&(!onlyIssues||row.issues.length>0)).map(row=><Card key={row.id}>
          <CardContent className="flex min-w-0 flex-col gap-sm p-md">
            <p className="break-all font-mono text-code-sm">{row.id}</p>
            <p className="break-all">{row.sourceId} &rarr; {row.type} &rarr; {row.targetId}</p>
            <ul>{row.issues.map(issue=><li key={issue}>{m[issue]}</li>)}</ul>
            {!row.issues.length&&<p>{m.maintenanceNoIssues}</p>}
          </CardContent>
        </Card>)}
        {!report.relations.some(row=>(!selected||row.documentIds.includes(selected))&&(!onlyIssues||row.issues.length>0))&&<p>{m.maintenanceEmpty}</p>}
      </>}
    </>}
  </div>;
}
