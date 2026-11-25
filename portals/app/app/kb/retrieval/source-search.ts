import {bm25Rank} from "./bm25";
import {VERIFICATION_FILTERS,type VerificationFilter,type VerificationState} from "../lib/state";

export interface SourceSearchRequest {kbIds:string[];query:string;topK:number;verificationFilter:VerificationFilter}
export interface SourcePassage {
  kbId:string;documentId:string;documentVersion:number;title:string;contentHash:string;
  verificationState:VerificationState;start:number;end:number;text:string;pages:number[];
}
export interface SourceSearchResult {
  mode:"source_only";items:(SourcePassage&{score:number})[];partial:boolean;gaps:string[];
  searchedDocuments:number;searchedPassages:number;matchedPassages:number;truncated:boolean;
}
export const SOURCE_SEARCH_TEXT_LIMIT=2*1024*1024;
export const SOURCE_SEARCH_PASSAGE_LIMIT=2000;

export function parseSourceSearch(value:unknown):SourceSearchRequest{
  const bad=():never=>{throw new Error("source_search_invalid_request");};
  if(!value||typeof value!=="object"||Array.isArray(value))return bad();
  const v=value as Record<string,unknown>,uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
  if(Object.keys(v).some(k=>!["kb_ids","query","top_k","verification_filter"].includes(k))||
    !Array.isArray(v.kb_ids)||!v.kb_ids.length||v.kb_ids.length>20||v.kb_ids.some(id=>typeof id!=="string"||!uuid.test(id))||
    typeof v.query!=="string"||!v.query.trim()||v.query.length>500||
    (v.top_k!==undefined&&(!Number.isInteger(v.top_k)||(v.top_k as number)<1||(v.top_k as number)>20))||
    (v.verification_filter!==undefined&&!VERIFICATION_FILTERS.includes(v.verification_filter as VerificationFilter)))return bad();
  return {kbIds:[...new Set((v.kb_ids as string[]).map(id=>id.toLowerCase()))],query:v.query.trim(),topK:(v.top_k??10) as number,
    verificationFilter:(v.verification_filter??"verified_and_untracked") as VerificationFilter};
}

/** Exact canonical slices, not synthesized index chunks. Never split a surrogate pair. */
export function sourcePassages(source:Omit<SourcePassage,"start"|"end"|"text"|"pages">,text:string,
  locators:{start:number;end:number;page?:number}[]=[]):SourcePassage[]{
  if(text.length>SOURCE_SEARCH_TEXT_LIMIT)throw new Error("source_search_budget");
  const result:SourcePassage[]=[];
  for(let start=0;start<text.length;){
    let end=Math.min(start+1200,text.length);
    if(end<text.length){
      const newline=text.lastIndexOf("\n",end-1);
      if(newline>start+600)end=newline+1;
      const before=text.charCodeAt(end-1),after=text.charCodeAt(end);
      if(before>=0xd800&&before<=0xdbff&&after>=0xdc00&&after<=0xdfff)end--;
    }
    const excerpt=text.slice(start,end);
    if(excerpt.trim())result.push({...source,start,end,text:excerpt,pages:[...new Set(locators.filter(l=>l.page!==undefined&&l.start<end&&l.end>start).map(l=>l.page!))]});
    start=end;
  }
  return result;
}

export function rankSourcePassages(passages:SourcePassage[],query:string,topK:number){
  if(passages.length>SOURCE_SEARCH_PASSAGE_LIMIT||passages.reduce((n,p)=>n+p.text.length,0)>SOURCE_SEARCH_TEXT_LIMIT)
    throw new Error("source_search_budget");
  const key=(p:SourcePassage)=>`${p.documentId}:${p.documentVersion}:${p.start}:${p.end}`;
  const byId=new Map(passages.map(p=>[key(p),p]));
  if(byId.size!==passages.length)throw new Error("source_search_corrupt");
  const ranked=bm25Rank(passages.map(p=>({id:key(p),text:p.text})),query);
  return {items:ranked.slice(0,topK).map(row=>({...byId.get(row.id)!,pages:[...byId.get(row.id)!.pages],score:row.score})),
    matchedPassages:ranked.length,truncated:ranked.length>topK};
}
