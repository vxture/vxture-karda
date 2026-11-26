import {bm25Rank} from "../retrieval/bm25";
import type {GraphEntity,GraphEvidence,SemanticRelation} from "./contracts";
import {directoryFingerprint,decodeDirectoryCursor,encodeDirectoryCursor} from "./directory-cursor";

export interface PublishedSearchQuery {query:string;topK:number;pageCursor?:string}
export interface PublishedSearchRequest extends PublishedSearchQuery {kbIds:string[];relationTypes?:string[]}
export function validatePublishedSearch(v:PublishedSearchQuery){
  if(typeof v.query!=="string"||!v.query.trim()||v.query.length>500||!Number.isInteger(v.topK)||v.topK<1||v.topK>20)throw new Error("published_search_invalid_request");
  if(v.pageCursor!==undefined){
    if(typeof v.pageCursor!=="string")throw new Error("published_search_invalid_request");
    if(v.pageCursor)try{decodeDirectoryCursor(v.pageCursor);}catch{throw new Error("published_search_invalid_request");}
  }
}
export function parsePublishedSearch(value:unknown):PublishedSearchRequest{
  if(!value||typeof value!=="object"||Array.isArray(value))throw new Error("published_search_invalid_request");
  const v=value as Record<string,unknown>,uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
  if(Object.keys(v).some(k=>!["kb_ids","query","top_k","relation_types","page_cursor"].includes(k))||!Array.isArray(v.kb_ids)||!v.kb_ids.length||v.kb_ids.length>20||
    !v.kb_ids.every(id=>typeof id==="string"&&uuid.test(id))||
    (v.relation_types!==undefined&&(!Array.isArray(v.relation_types)||v.relation_types.length>50||v.relation_types.some(t=>typeof t!=="string"||!t.trim()||t.length>128))))throw new Error("published_search_invalid_request");
  const query={query:v.query as string,topK:(v.top_k??10) as number,...(v.page_cursor!==undefined?{pageCursor:v.page_cursor as string}:{})};validatePublishedSearch(query);
  return {...query,query:query.query.trim(),kbIds:[...new Set(v.kb_ids as string[])],...(v.relation_types?{relationTypes:[...new Set(v.relation_types as string[])]}:{})};
}

/** Called only AFTER current relation/evidence eligibility; ranking cannot expose hidden topology. */
export function rankPublishedRelations(edges:SemanticRelation[],nodes:ReadonlyMap<string,GraphEntity>,
  statements:ReadonlyMap<string,string>,support:ReadonlyMap<string,GraphEvidence[]>,excerpts:ReadonlyMap<string,string>,query:PublishedSearchQuery,binding:unknown=[]){
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
  let offset=0,hash="";
  if(query.pageCursor!==undefined){
    const nodeIds=[...new Set(edges.flatMap(e=>[e.sourceId,e.targetId]))].sort();
    const assertionIds=[...new Set(edges.flatMap(e=>e.assertionIds))].sort();
    const evidence=new Map<string,GraphEvidence>();
    for(const id of assertionIds)for(const g of support.get(id)??[])evidence.set(g.id,g);
    hash=directoryFingerprint(["published-search.v1",binding,query.query.trim(),query.topK,corpus,
      edges.map(e=>[e.id,e.kbId,e.type,e.sourceId,e.targetId,[...e.assertionIds].sort(),e.schema,e.origin]),
      nodeIds.map(id=>nodes.get(id)),assertionIds.map(id=>[id,[...(support.get(id)??[])].map(g=>g.id).sort()]),
      [...evidence.values()].sort((a,b)=>a.id.localeCompare(b.id))]);
    if(query.pageCursor){const cursor=decodeDirectoryCursor(query.pageCursor),index=ranked.findIndex(r=>r.id===cursor.last);
      if(cursor.hash!==hash||index<0)throw new Error("published_search_changed");offset=index+1;}
  }
  const items=ranked.slice(offset,offset+query.topK).map(r=>({relationId:r.id,score:r.score}));
  return {eligibleRelations:edges.length,matchedRelations:ranked.length,items,
    ...(query.pageCursor!==undefined?{page:{offset,nextCursor:offset+items.length<ranked.length?encodeDirectoryCursor(hash,items.at(-1)!.relationId):null}}:{})};
}
