import {bm25Rank} from "../retrieval/bm25";
import type {GraphEntity,GraphEvidence,SemanticRelation} from "./contracts";

export interface PublishedSearchQuery {query:string;topK:number}
export interface PublishedSearchRequest extends PublishedSearchQuery {kbIds:string[];relationTypes?:string[]}
export function validatePublishedSearch(v:PublishedSearchQuery){
  if(typeof v.query!=="string"||!v.query.trim()||v.query.length>500||!Number.isInteger(v.topK)||v.topK<1||v.topK>20)throw new Error("published_search_invalid_request");
}
export function parsePublishedSearch(value:unknown):PublishedSearchRequest{
  if(!value||typeof value!=="object"||Array.isArray(value))throw new Error("published_search_invalid_request");
  const v=value as Record<string,unknown>,uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
  if(Object.keys(v).some(k=>!["kb_ids","query","top_k","relation_types"].includes(k))||!Array.isArray(v.kb_ids)||!v.kb_ids.length||v.kb_ids.length>20||
    !v.kb_ids.every(id=>typeof id==="string"&&uuid.test(id))||
    (v.relation_types!==undefined&&(!Array.isArray(v.relation_types)||v.relation_types.length>50||v.relation_types.some(t=>typeof t!=="string"||!t.trim()||t.length>128))))throw new Error("published_search_invalid_request");
  const query={query:v.query as string,topK:(v.top_k??10) as number};validatePublishedSearch(query);
  return {...query,query:query.query.trim(),kbIds:[...new Set(v.kb_ids as string[])],...(v.relation_types?{relationTypes:[...new Set(v.relation_types as string[])]}:{})};
}

/** Called only AFTER current relation/evidence eligibility; ranking cannot expose hidden topology. */
export function rankPublishedRelations(edges:SemanticRelation[],nodes:ReadonlyMap<string,GraphEntity>,
  statements:ReadonlyMap<string,string>,support:ReadonlyMap<string,GraphEvidence[]>,excerpts:ReadonlyMap<string,string>,query:PublishedSearchQuery){
  validatePublishedSearch(query);let chars=0;
  const corpus=edges.map(edge=>{
    const pieces=[nodes.get(edge.sourceId)!.label,edge.type,nodes.get(edge.targetId)!.label];
    const evidence=new Set<string>();
    for(const id of edge.assertionIds){pieces.push(statements.get(id)??"");for(const proof of support.get(id)??[])evidence.add(proof.id);}
    for(const id of [...evidence].sort())pieces.push(excerpts.get(id)??"");
    const length=pieces.reduce((n,p)=>n+p.length+1,0);chars+=length;
    if(length>65536||chars>8*1024*1024||edges.length>5000)throw new Error("published_search_budget");
    return {id:edge.id,text:pieces.join("\n")};
  });
  const ranked=bm25Rank(corpus,query.query);
  return {eligibleRelations:edges.length,matchedRelations:ranked.length,items:ranked.slice(0,query.topK).map(r=>({relationId:r.id,score:r.score}))};
}
