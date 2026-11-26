"use client";
import {useMemo,useState} from "react";
import {Button} from "@vxture/design-system";
import {useMessages} from "../../../../_i18n/useMessages";
import {semantic} from "../../../../_i18n/messages/semantic";
import type {PublicationImpact as Impact,ImpactKind} from "../../../../kb/semantic/publication-impact";
export function PublicationImpact({value}:{value:Impact}){
  const m=useMessages(semantic),[kind,setKind]=useState(""),[query,setQuery]=useState(""),[page,setPage]=useState(0),[view,setView]=useState<"relations"|"sources">("relations");
  const rows=useMemo(()=>value[view].filter(row=>(!kind||row.kind===kind)&&JSON.stringify(row).toLowerCase().includes(query.trim().toLowerCase())),[value,view,kind,query]);
  const labels:Record<ImpactKind,string>={added:m.added,removed:m.removed,changed:m.changed};
  return <section className="flex min-w-0 flex-col gap-sm" aria-label={m.publicationImpactTitle}>
    <h3 className="text-title-sm">{m.publicationImpactTitle}</h3><p className="text-body-sm text-muted-foreground">{m.publicationImpactHint}</p>
    <div className="flex flex-wrap gap-sm">
      <Button variant={view==="relations"?"default":"outline"} onClick={()=>{setView("relations");setPage(0);}}>{m.publicationImpactRelations} ({value.relations.length})</Button>
      <Button variant={view==="sources"?"default":"outline"} onClick={()=>{setView("sources");setPage(0);}}>{m.publicationImpactSources} ({value.sources.length})</Button>
    </div>
    <label>{m.publicationImpactFilter}<select value={kind} onChange={e=>{setKind(e.target.value);setPage(0);}} className="ml-sm min-w-0 rounded-md border border-border bg-background p-sm"><option value="">{m.allTypes}</option>{(["added","removed","changed"] as const).map(k=><option key={k} value={k}>{labels[k]}</option>)}</select></label>
    <label className="flex min-w-0 flex-col gap-xs">{m.publicationImpactSearch}<input value={query} maxLength={256} onChange={e=>{setQuery(e.target.value);setPage(0);}} className="min-w-0 rounded-md border border-border bg-background p-sm"/></label>
    <p role="status" className="text-body-sm">{m.publicationImpactMatches}: {rows.length} &middot; {page+1}/{Math.max(1,Math.ceil(rows.length/20))}</p>
    {rows.slice(page*20,page*20+20).map(row=><div key={row.id} className="flex min-w-0 flex-col gap-xs rounded-md border border-border p-sm">
      <p className="break-all text-body-sm">{labels[row.kind]} &middot; {row.id}</p>
      {"beforeVersion" in row?<><p className="text-body-sm">{m.publicationImpactBefore}: v{row.beforeVersion??"-"} &rarr; {m.publicationImpactAfter}: v{row.afterVersion??"-"}</p>{row.contentChanged&&<p className="text-body-sm">{m.publicationImpactContentChanged}</p>}</>:
      (["before","after"] as const).map(side=>row[side]&&<div key={side} className="break-all text-body-sm"><p>{side==="before"?m.publicationImpactBefore:m.publicationImpactAfter}: {row[side]!.sourceId} &rarr; {row[side]!.type} &rarr; {row[side]!.targetId}</p><p>{m.publicationImpactAssertions}: {row[side]!.assertionIds.join(", ")}</p><p>{row[side]!.schema.namespace}/{row[side]!.schema.schemaId}/{row[side]!.schema.version}</p></div>)}
    </div>)}
    <div className="flex flex-wrap gap-sm"><Button variant="outline" disabled={page===0} onClick={()=>setPage(p=>p-1)}>{m.publicationImpactPrevious}</Button><Button variant="outline" disabled={(page+1)*20>=rows.length} onClick={()=>setPage(p=>p+1)}>{m.publicationImpactNext}</Button></div>
  </section>;
}
