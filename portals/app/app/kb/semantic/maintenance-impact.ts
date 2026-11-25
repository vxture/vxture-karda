import type {MaintenanceReport,MaintenanceIssue} from "./maintenance";

export const MAINTENANCE_ISSUES:MaintenanceIssue[]=["source_missing","source_changed","source_inactive","source_unavailable","assertion_inactive","evidence_missing","review_changed","entity_missing"];
export type MaintenanceAction="restore_source"|"retry_source"|"rebuild_candidates"|"review_relations"|"repair_entities";
export function maintenanceActions(issues:MaintenanceIssue[]):MaintenanceAction[]{
  const actions=new Set<MaintenanceAction>();
  for(const issue of issues){
    if(["source_missing","source_inactive"].includes(issue))actions.add("restore_source");
    if(issue==="source_unavailable")actions.add("retry_source");
    if(["source_changed","assertion_inactive","evidence_missing"].includes(issue))actions.add("rebuild_candidates");
    if(issue==="review_changed")actions.add("review_relations");
    if(issue==="entity_missing")actions.add("repair_entities");
  }
  return [...actions].sort();
}

/** Diagnostic connectivity only. No rule inference, source access or new facts. */
export function maintenanceImpact(report:MaintenanceReport,sourceId:string,hops:number,includeHealthy=false){
  if(!Number.isInteger(hops)||hops<0||hops>3||report.relations.length>5000||report.sources.length>100)throw new Error("semantic_invalid_impact");
  if(new Set(report.relations.map(r=>r.id)).size!==report.relations.length)throw new Error("semantic_invalid_impact");
  const direct=report.relations.filter(r=>(includeHealthy||r.issues.length>0)&&(!sourceId||r.documentIds.includes(sourceId))).sort((a,b)=>a.id.localeCompare(b.id));
  const levels=new Map(direct.map(r=>[r.id,0])),entities=new Set(direct.flatMap(r=>[r.sourceId,r.targetId]));
  const adjacent=new Map<string,typeof report.relations>();
  for(const r of report.relations)for(const id of new Set([r.sourceId,r.targetId])){const list=adjacent.get(id)??[];list.push(r);adjacent.set(id,list);}
  let frontier=[...entities].sort(),truncated=false;
  if(levels.size>1000||entities.size>500){truncated=true;
    levels.clear();entities.clear();
    for(const r of direct){const ids=[r.sourceId,r.targetId].filter(id=>!entities.has(id));
      if(levels.size>=1000||entities.size+new Set(ids).size>500)continue;
      levels.set(r.id,0);entities.add(r.sourceId);entities.add(r.targetId);}
    frontier=[...entities].sort();
  }
  for(let depth=1;depth<=hops;depth++){
    const candidates=new Map<string,MaintenanceReport["relations"][number]>();
    for(const id of frontier)for(const r of adjacent.get(id)??[])if(!levels.has(r.id))candidates.set(r.id,r);
    const next=new Set<string>();
    for(const r of [...candidates.values()].sort((a,b)=>a.id.localeCompare(b.id))){
      const extra=[...new Set([r.sourceId,r.targetId])].filter(id=>!entities.has(id));
      if(levels.size>=1000||entities.size+extra.length>500){truncated=true;continue;}
      levels.set(r.id,depth);for(const id of extra){entities.add(id);next.add(id);}
    }
    frontier=[...next].sort();if(!frontier.length)break;
  }
  const counts=MAINTENANCE_ISSUES.map(issue=>({issue,count:report.relations.filter(r=>r.issues.includes(issue)).length}));
  return {directCount:direct.length,counts,truncated,entityIds:[...entities].sort(),
    rows:report.relations.filter(r=>levels.has(r.id)).map(r=>({...r,depth:levels.get(r.id)!,actions:maintenanceActions(r.issues)})).sort((a,b)=>a.depth-b.depth||a.id.localeCompare(b.id))};
}
