import type {SemanticRelation} from "./contracts";
import type {PublishedRelationInput} from "./read-postgres";

export interface AuditRelease {
  id:string;generation:number;createdAt:string;createdBy:string;compileRunId:string;fingerprint:string;
  verified:boolean;issues:string[];relations:SemanticRelation[];sources:PublishedRelationInput["sources"];
  reviewCount:number;
}
export interface AuditHistory {
  checkedAt:string;headGeneration:number;headReleaseId:string|null;headMatches:boolean;
  releases:AuditRelease[];nextBefore:number|null;completeHistory:boolean;replay:"complete"|"window"|"failed";
}
const relationValue=(r:SemanticRelation)=>JSON.stringify({type:r.type,sourceId:r.sourceId,targetId:r.targetId,
  assertionIds:[...r.assertionIds].sort(),schema:r.schema,origin:r.origin});

/** Compare immutable historical structure only. No historical assertion text is served. */
export function compareAuditReleases(before:AuditRelease,after:AuditRelease){
  if(!before.verified||!after.verified||before.generation>=after.generation)throw new Error("semantic_invalid_comparison");
  const left=new Map(before.relations.map(r=>[r.id,r])),right=new Map(after.relations.map(r=>[r.id,r]));
  const added=[...right.keys()].filter(id=>!left.has(id)).sort(),removed=[...left.keys()].filter(id=>!right.has(id)).sort();
  const changed=[...right.keys()].filter(id=>left.has(id)&&relationValue(left.get(id)!)!==relationValue(right.get(id)!)).sort();
  const oldSources=new Map(before.sources.map(s=>[s.documentId,s])),newSources=new Map(after.sources.map(s=>[s.documentId,s]));
  const sourceChanges=[...new Set([...oldSources.keys(),...newSources.keys()])].sort().flatMap(id=>{
    const a=oldSources.get(id),b=newSources.get(id);
    return a&&b&&a.version===b.version&&a.contentHash===b.contentHash?[]:[{documentId:id,before:a??null,after:b??null}];
  });
  return {added,removed,changed,sourceChanges};
}

export function verifyAuditWindow(releases:AuditRelease[],headMatches:boolean,completeHistory:boolean):AuditHistory["replay"]{
  const ordered=[...releases].sort((a,b)=>a.generation-b.generation);
  if(!headMatches||ordered.some((r,i)=>!r.verified||(i>0&&r.generation!==ordered[i-1].generation+1))||
    (completeHistory&&ordered.length>0&&ordered[0].generation!==1))return "failed";
  return completeHistory?"complete":"window";
}
