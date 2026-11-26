import type {PublishedRelationInput} from "./read-postgres";
type Structure=Pick<PublishedRelationInput,"relations"|"sources">;
export type ImpactKind="added"|"removed"|"changed";
const relation=(r:Structure["relations"][number])=>({id:r.id,type:r.type,sourceId:r.sourceId,targetId:r.targetId,assertionIds:[...r.assertionIds].sort(),
  schema:{namespace:r.schema.namespace,schemaId:r.schema.schemaId,version:r.schema.version},origin:r.origin});
/** Proposed replacement structure only: never revive old statements or evidence. */
export function publicationImpact(before:Structure,after:Structure){
  if([before,after].some(s=>s.relations.length>5000||s.sources.length>100))throw new Error("semantic_preview_budget");
  const left=new Map(before.relations.map(r=>[r.id,relation(r)])),right=new Map(after.relations.map(r=>[r.id,relation(r)]));
  const relations=[...new Set([...left.keys(),...right.keys()])].sort().flatMap(id=>{
    const a=left.get(id),b=right.get(id);if(JSON.stringify(a)===JSON.stringify(b))return [];
    return [{id,kind:(!a?"added":!b?"removed":"changed") as ImpactKind,before:a??null,after:b??null}];
  });
  const oldSources=new Map(before.sources.map(s=>[s.documentId,s])),newSources=new Map(after.sources.map(s=>[s.documentId,s]));
  const sources=[...new Set([...oldSources.keys(),...newSources.keys()])].sort().flatMap(id=>{
    const a=oldSources.get(id),b=newSources.get(id);if(a&&b&&a.version===b.version&&a.contentHash===b.contentHash)return [];
    return [{id,kind:(!a?"added":!b?"removed":"changed") as ImpactKind,beforeVersion:a?.version??null,afterVersion:b?.version??null,
      contentChanged:!!a&&!!b&&a.contentHash!==b.contentHash}];
  });
  const value={scope:"proposed_replacement_structure" as const,relations,sources};
  if(Buffer.byteLength(JSON.stringify(value))>2*1024*1024)throw new Error("semantic_preview_budget");return value;
}
export type PublicationImpact=ReturnType<typeof publicationImpact>;
