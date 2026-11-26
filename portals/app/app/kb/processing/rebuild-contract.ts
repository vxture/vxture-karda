export const REBUILD_UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
export interface RebuildParams {targetTokens:number;maxTokens:number;overlap:0}
export type RebuildCommand={action:"create";id:string;kbId:string;documentIds:string[];params:RebuildParams;note:string}|
  {action:"execute";id:string;documentId:string}|
  {action:"activate"|"revert"|"cancel";id:string;eventId:string;expectedRevision:number;note:string};
export function parseRebuild(value:unknown):RebuildCommand{
  const bad=():never=>{throw Error("rebuild_invalid_request");};
  if(!value||typeof value!=="object"||Array.isArray(value)||JSON.stringify(value).length>16384)bad();
  const v=value as Record<string,unknown>,fields=v.action==="create"?["action","id","kbId","documentIds","params","note"]:
    v.action==="execute"?["action","id","documentId"]:["activate","revert","cancel"].includes(String(v.action))?["action","id","eventId","expectedRevision","note"]:bad();
  if(Object.keys(v).sort().join()!==fields.sort().join()||typeof v.id!=="string"||!REBUILD_UUID.test(v.id))bad();
  if(v.action==="create"){
    const p=v.params as RebuildParams;
    if(!REBUILD_UUID.test(String(v.kbId))||!Array.isArray(v.documentIds)||v.documentIds.length<1||v.documentIds.length>10||
      v.documentIds.some(id=>typeof id!=="string"||!REBUILD_UUID.test(id))||new Set(v.documentIds).size!==v.documentIds.length||
      !p||Object.keys(p).sort().join()!=="maxTokens,overlap,targetTokens"||!Number.isInteger(p.targetTokens)||!Number.isInteger(p.maxTokens)||
      p.targetTokens<32||p.targetTokens>2048||p.maxTokens<p.targetTokens||p.maxTokens>4096||p.overlap!==0)bad();
  }else if(v.action==="execute"){if(!REBUILD_UUID.test(String(v.documentId)))bad();}
  else if(!REBUILD_UUID.test(String(v.eventId))||!Number.isSafeInteger(v.expectedRevision)||(v.expectedRevision as number)<0||(v.expectedRevision as number)>=2147483647)bad();
  if(v.action!=="execute"&&(typeof v.note!=="string"||!v.note.trim()||v.note.length>2000))bad();
  return structuredClone(v) as RebuildCommand;
}
export interface RebuildItem {document_id:string;title:string;state:"planned"|"running"|"ready"|"failed";attempt:number;lease_until:string|null;error_code:string|null;
  source_version:number;oldCount:number;newCount:number;model:string|null}
export interface RebuildView {id:string;kb_id:string;name:string;state:"planned"|"active"|"reverted"|"cancelled";revision:number;
  params:RebuildParams;note:string;created_at:string;items:RebuildItem[];events:{revision:number;action:string;note:string;created_at:string}[]}
