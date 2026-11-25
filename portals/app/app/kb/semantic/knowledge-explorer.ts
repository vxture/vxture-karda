import type {KnowledgePackage} from "./read-postgres";

/** A read view over already authorized published facts. No new assertions or inference. */
export function knowledgeTopics(pack:KnowledgePackage){
  const topics=new Map<string,{type:string;relationIds:string[];entityIds:Set<string>;assertionIds:Set<string>}>();
  const ids=new Set(pack.nodes.map(n=>n.id));
  for(const edge of pack.edges){
    if(!ids.has(edge.sourceId)||!ids.has(edge.targetId))continue;
    const topic=topics.get(edge.type)??{type:edge.type,relationIds:[],entityIds:new Set<string>(),assertionIds:new Set<string>()};
    topic.relationIds.push(edge.id);topic.entityIds.add(edge.sourceId);topic.entityIds.add(edge.targetId);
    for(const id of edge.assertionIds)topic.assertionIds.add(id);
    topics.set(edge.type,topic);
  }
  return [...topics.values()].sort((a,b)=>a.type.localeCompare(b.type)).map(t=>({type:t.type,
    relationIds:t.relationIds.sort(),entityIds:[...t.entityIds].sort(),assertionIds:[...t.assertionIds].sort()}));
}

export interface PassageMatch {evidenceId:string;relationIds:string[];assertionIds:string[];excerpt:string;start:number;end:number}

/** Literal, bounded search of verified excerpts only; coordinates are UTF-16 in the excerpt. */
export function searchPublishedPassages(pack:KnowledgePackage,query:string,limit=20):{matches:PassageMatch[];total:number}{
  const needle=query.trim();
  if(!needle||needle.length>200)return {matches:[],total:0};
  const max=Number.isFinite(limit)?Math.max(1,Math.min(50,Math.trunc(limit))):20;
  const passages=new Map(pack.passages.map(p=>[p.evidenceId,p.excerpt]));
  const assertions=new Map(pack.assertions.map(a=>[a.id,a]));
  const evidence=new Set(pack.evidence.filter(e=>e.stance==="supports").map(e=>e.id));
  const linked=new Map<string,{relations:Set<string>;assertions:Set<string>}>();
  const nodes=new Set(pack.nodes.map(n=>n.id));
  for(const relation of pack.edges){
    if(!nodes.has(relation.sourceId)||!nodes.has(relation.targetId))continue;
    for(const id of relation.assertionIds)for(const evidenceId of assertions.get(id)?.evidenceIds??[]){
      if(!evidence.has(evidenceId))continue;
      const links=linked.get(evidenceId)??{relations:new Set<string>(),assertions:new Set<string>()};
      links.relations.add(relation.id);links.assertions.add(id);linked.set(evidenceId,links);
    }
  }
  const matches:PassageMatch[]=[];let total=0;
  for(const [id,links] of [...linked.entries()].sort(([a],[b])=>a.localeCompare(b))){
    const excerpt=passages.get(id);if(excerpt===undefined)continue;
    const start=excerpt.indexOf(needle);if(start<0)continue;
    total++;
    if(matches.length<max)matches.push({evidenceId:id,relationIds:[...links.relations].sort(),assertionIds:[...links.assertions].sort(),
      excerpt,start,end:start+needle.length});
  }
  return {matches,total};
}
