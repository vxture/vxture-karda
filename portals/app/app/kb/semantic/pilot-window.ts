import {profileHash} from "./profile-authority";
import type {SourceSearchResult} from "../retrieval/source-search";
import type {KnowledgePackage} from "./read-postgres";
import type {PilotSummary} from "./pilot";
export function pilotWindow(identity:unknown,id:string,query:string,topK:number,baseline:SourceSearchResult,published:KnowledgePackage){
  const sourceDocs=new Set(baseline.items.map(i=>i.documentId)),factDocs=new Set(published.evidence.map(e=>e.documentId));
  const summary:PilotSummary={sourceCount:baseline.items.length,factCount:published.edges.length,searchedDocuments:baseline.searchedDocuments,
    matchedPassages:baseline.matchedPassages,matchedRelations:published.search?.matchedRelations??published.edges.length,
    sharedDocuments:[...sourceDocs].filter(d=>factDocs.has(d)).length,sourceTruncated:baseline.truncated,publishedTruncated:published.truncated,
    sourcePartial:baseline.partial,publishedPartial:published.sourceStatus!=="complete"};
  if(Buffer.byteLength(JSON.stringify([baseline,published]))>2*1024*1024)throw Error("pilot_payload_budget");
  return {summary,fingerprint:profileHash(["karda.pilot-window.v1",identity,id,query,topK,baseline,published])};
}
