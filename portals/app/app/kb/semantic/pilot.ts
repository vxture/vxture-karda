import type {SourceSearchResult} from "../retrieval/source-search";
import type {KnowledgePackage} from "./read-postgres";
export const PILOT_UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
export const PILOT_VERDICTS=["prefer_source","prefer_published","equivalent","neither"] as const;
export type PilotVerdict=typeof PILOT_VERDICTS[number];
export type PilotCommand={action:"create";kbId:string;id:string;title:string;query:string;topK:number;note:string}|
  {action:"compare";kbId:string;id:string;observationId:string}|
  {action:"review";kbId:string;id:string;observationId:string;eventId:string;expectedRevision:number;verdict:PilotVerdict;note:string}|
  {action:"close"|"reopen";kbId:string;id:string;eventId:string;expectedRevision:number;note:string};
export function parsePilot(value:unknown):PilotCommand{
  const bad=():never=>{throw Error("pilot_invalid_request");};
  if(!value||typeof value!=="object"||Array.isArray(value)||JSON.stringify(value).length>16384)bad();
  const v=value as Record<string,unknown>;
  const common=["action","kbId","id"],fields=v.action==="create"?[...common,"title","query","topK","note"]:
    v.action==="compare"?[...common,"observationId"]:v.action==="review"?[...common,"observationId","eventId","expectedRevision","verdict","note"]:
    v.action==="close"||v.action==="reopen"?[...common,"eventId","expectedRevision","note"]:bad();
  if(Object.keys(v).sort().join()!==fields.sort().join()||!PILOT_UUID.test(String(v.kbId))||!PILOT_UUID.test(String(v.id)))bad();
  if(v.action!=="compare"&&(typeof v.note!=="string"||!v.note.trim()||v.note.length>2000))bad();
  if(v.action==="create"){
    if(typeof v.title!=="string"||!v.title.trim()||v.title.length>200||typeof v.query!=="string"||!v.query.trim()||v.query.length>500||
      !Number.isInteger(v.topK)||(v.topK as number)<1||(v.topK as number)>20)bad();
  }else if(v.action!=="compare"&&(!PILOT_UUID.test(String(v.eventId))||!Number.isSafeInteger(v.expectedRevision)||(v.expectedRevision as number)<0||(v.expectedRevision as number)>=2147483647))bad();
  if((v.action==="compare"||v.action==="review")&&!PILOT_UUID.test(String(v.observationId)))bad();
  if(v.action==="review"&&!PILOT_VERDICTS.includes(v.verdict as PilotVerdict))bad();
  return structuredClone(v) as PilotCommand;
}
export interface PilotSummary {sourceCount:number;factCount:number;searchedDocuments:number;matchedPassages:number;matchedRelations:number;
  sharedDocuments:number;sourceTruncated:boolean;publishedTruncated:boolean;sourcePartial:boolean;publishedPartial:boolean}
export interface PilotComparison {format:"karda.pilot-comparison.v1";id:string;observationId:string;fingerprint:string;checkedAt:string;summary:PilotSummary;
  baseline:SourceSearchResult;published:KnowledgePackage}
export interface PilotRow {id:string;kb_id:string;title:string;query:string;top_k:number;note:string;state:"open"|"reviewed"|"closed";revision:number;
  verdict:PilotVerdict|null;reviewed_observation:string|null;created_at:string;updated_at:string}
export interface PilotObservation {id:string;fingerprint:string;summary:PilotSummary;created_at:string}
export interface PilotEvent {revision:number;action:string;note:string;verdict:PilotVerdict|null;observation_id:string|null;created_at:string}
