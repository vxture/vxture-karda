import {preparePublication} from "./publication";
import type {KnowledgePackage} from "./read-postgres";

export interface TopicDossier {
  format:"karda.topic-dossier.v1";relationType:string;inputHash:string;
  schema:KnowledgePackage["schema"];
  sections:{relationId:string;source:{id:string;label:string};target:{id:string;label:string};
    statements:{id:string;text:string;evidence:{id:string;documentId:string;version:number;start:number;end:number;pages:number[];excerpt:string}[]}[]}[];
}
const hash=(value:unknown)=>preparePublication({kbId:"00000000-0000-0000-0000-000000000000",eventId:"00000000-0000-0000-0000-000000000000",
  expectedGeneration:0,sourceRevision:"topic-v1",reviewRevision:"topic-v1",schemaRevision:"topic-v1",payload:value}).fingerprint;

/** Extractive, version-bound topic composition. Never generates or approves facts. */
export function composeTopicDossier(pack:KnowledgePackage,relationType:string):TopicDossier{
  if(!relationType.trim()||relationType.length>128||pack.truncated||pack.sourceStatus!=="complete")throw new Error("semantic_topic_incomplete");
  const nodes=new Map(pack.nodes.map(n=>[n.id,n])),assertions=new Map(pack.assertions.map(a=>[a.id,a])),
    statements=new Map(pack.statements.map(s=>[s.id,s.statement])),evidence=new Map(pack.evidence.map(e=>[e.id,e])),passages=new Map(pack.passages.map(p=>[p.evidenceId,p.excerpt]));
  const relations=pack.edges.filter(r=>r.type===relationType).sort((a,b)=>a.id.localeCompare(b.id));
  if(!relations.length)throw new Error("semantic_topic_empty");
  const sections=relations.map(relation=>{
    const source=nodes.get(relation.sourceId),target=nodes.get(relation.targetId);
    if(!source||!target)throw new Error("semantic_topic_corrupt");
    return {relationId:relation.id,source:{id:source.id,label:source.label},target:{id:target.id,label:target.label},
      statements:[...relation.assertionIds].sort().map(id=>{
        const assertion=assertions.get(id),text=statements.get(id);
        if(!assertion||!text)throw new Error("semantic_topic_corrupt");
        return {id,text,evidence:[...assertion.evidenceIds].sort().map(evidenceId=>{
          const e=evidence.get(evidenceId),excerpt=passages.get(evidenceId);
          if(!e||e.stance!=="supports"||excerpt===undefined)throw new Error("semantic_topic_corrupt");
          return {id:e.id,documentId:e.documentId,version:e.documentVersion,start:e.start,end:e.end,pages:[...e.pages??[]],excerpt};
        })};
      })};
  });
  const value={format:"karda.topic-dossier.v1" as const,relationType,schema:pack.schema,sections};
  if(Buffer.byteLength(JSON.stringify(value))>240000)throw new Error("semantic_topic_budget");
  return {...value,inputHash:hash(value)};
}
export function topicDossierHash(value:TopicDossier){return hash(value);}
