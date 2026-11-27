export const SOURCE_UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
export interface SourceItem {id:string;sourceDocId:string;sourceVersion:number;event:"upsert"|"delete";title:string;mime?:string;bytes?:string;contentHash?:string}
export type SourceCommand={action:"create";id:string;connectorCode:"api"|"arda";externalSourceId:string;note:string;acceptLibraryScope:true}|
 {action:"stage";bindingId:string;id:string;mode:"backfill"|"incremental";items:SourceItem[];note:string}|
 {action:"execute";bindingId:string;runId:string;itemId:string}|
 {action:"retry";bindingId:string;runId:string;itemIds:string[];eventId:string;note:string}|
 {action:"pause"|"resume"|"finish_backfill";bindingId:string;eventId:string;expectedRevision:number;note:string}|
 {action:"revoke_preview";bindingId:string}|
 {action:"revoke";bindingId:string;eventId:string;expectedRevision:number;previewHash:string;note:string}|
 {action:"cancel_run";bindingId:string;runId:string;eventId:string;note:string}|
 {action:"retry_processing";bindingId:string;documentIds:string[];eventId:string;note:string};
export function parseSource(value:unknown):SourceCommand{
 const bad=():never=>{throw Error("source_invalid_request");};
 if(!value||typeof value!=="object"||Array.isArray(value)||JSON.stringify(value).length>24*1024*1024)bad();const v=value as Record<string,unknown>;
 const fields:Record<string,string[]>={create:["action","id","connectorCode","externalSourceId","note","acceptLibraryScope"],stage:["action","bindingId","id","mode","items","note"],execute:["action","bindingId","runId","itemId"],retry:["action","bindingId","runId","itemIds","eventId","note"],pause:["action","bindingId","eventId","expectedRevision","note"],resume:["action","bindingId","eventId","expectedRevision","note"],finish_backfill:["action","bindingId","eventId","expectedRevision","note"],revoke_preview:["action","bindingId"],revoke:["action","bindingId","eventId","expectedRevision","previewHash","note"],cancel_run:["action","bindingId","runId","eventId","note"],retry_processing:["action","bindingId","documentIds","eventId","note"]};
 const expected=fields[String(v.action)];if(!expected||Object.keys(v).sort().join()!==[...expected].sort().join())bad();
 for(const k of ["id","bindingId","runId","itemId","eventId"])if(v[k]!==undefined&&(typeof v[k]!=="string"||!SOURCE_UUID.test(v[k] as string)))bad();
 if(v.note!==undefined&&(typeof v.note!=="string"||!v.note.trim()||v.note.length>2000))bad();
 if(v.expectedRevision!==undefined&&(!Number.isSafeInteger(v.expectedRevision)||(v.expectedRevision as number)<0||(v.expectedRevision as number)>=2147483647))bad();
 if(v.action==="create"&&(!["api","arda"].includes(String(v.connectorCode))||typeof v.externalSourceId!=="string"||!v.externalSourceId.trim()||v.externalSourceId.length>255||v.acceptLibraryScope!==true))bad();
 if(v.action==="revoke"&&(typeof v.previewHash!=="string"||!/^[a-f0-9]{64}$/.test(v.previewHash)))bad();
 for(const key of ["itemIds","documentIds"]){const a=v[key];if(a!==undefined&&(!Array.isArray(a)||!a.length||a.length>50||a.some(id=>typeof id!=="string"||!SOURCE_UUID.test(id))||new Set(a).size!==a.length))bad();}
 if(v.action==="stage"){
  if(!["backfill","incremental"].includes(String(v.mode))||!Array.isArray(v.items)||!v.items.length||v.items.length>50)bad();const items=v.items as SourceItem[];
  if(new Set(items.map(i=>i?.id)).size!==items.length||new Set(items.map(i=>i?.sourceDocId)).size!==items.length)bad();
  for(const i of items){if(!i||typeof i!=="object"||Array.isArray(i)||!SOURCE_UUID.test(String(i.id))||typeof i.sourceDocId!=="string"||!i.sourceDocId.trim()||i.sourceDocId.length>255||!Number.isSafeInteger(i.sourceVersion)||i.sourceVersion<1||i.sourceVersion>=2147483647||typeof i.title!=="string"||!i.title.trim()||i.title.length>512)bad();
   const keys=i.event==="upsert"?["id","sourceDocId","sourceVersion","event","title","mime","bytes","contentHash"]:i.event==="delete"?["id","sourceDocId","sourceVersion","event","title"]:bad();
   if(Object.keys(i).sort().join()!==keys.sort().join())bad();
   if(i.event==="upsert"&&(typeof i.mime!=="string"||!i.mime||i.mime.length>128||typeof i.bytes!=="string"||i.bytes.length>12*1024*1024||!/^[A-Za-z0-9+/]*={0,2}$/.test(i.bytes)||typeof i.contentHash!=="string"||!/^[a-f0-9]{64}$/.test(i.contentHash)))bad();
  }
 }
 return structuredClone(v) as SourceCommand;
}
export interface SourceBinding {id:string;connector_code:string;external_source_id:string;mode:string;state:string;cursor:string|null;last_synced_at:string|null;revision:number;readiness:"ready"|"external_contract_required";documents:number;failedDocuments:number;pendingItems:number}
export interface SourceRun {id:string;mode:string;state:string;note:string;created_at:string;total:number;applied:number;failed:number;queued:number}
export interface SourceProgressItem {id:string;source_doc_id:string;source_version:number;event:string;title:string;state:string;attempt:number;error_code:string|null;document_id:string|null;lease_until:string|null;outcome:string|null;processing_state:string|null;task_id:string|null}
