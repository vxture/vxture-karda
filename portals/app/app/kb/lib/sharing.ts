import type {PublishState} from "./ownership";
export const SHARING_UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
export type SharingCommand={action:"preview";target:PublishState}|{action:"apply";target:PublishState;eventId:string;expectedRevision:number;previewHash:string;note:string};
export function parseSharing(value:unknown):SharingCommand{
 const bad=():never=>{throw Error("sharing_invalid_request");};
 if(!value||typeof value!=="object"||Array.isArray(value)||JSON.stringify(value).length>8192)bad();const v=value as Record<string,unknown>;
 const fields=v.action==="preview"?["action","target"]:v.action==="apply"?["action","target","eventId","expectedRevision","previewHash","note"]:bad();
 if(Object.keys(v).sort().join()!==fields.sort().join()||!["private","ws_published","org_published"].includes(String(v.target)))bad();
 if(v.action==="apply"&&(!SHARING_UUID.test(String(v.eventId))||!Number.isSafeInteger(v.expectedRevision)||(v.expectedRevision as number)<0||(v.expectedRevision as number)>=2147483647||
  typeof v.previewHash!=="string"||!/^[a-f0-9]{64}$/.test(v.previewHash)||typeof v.note!=="string"||!v.note.trim()||v.note.length>2000))bad();
 return structuredClone(v) as SharingCommand;
}
export interface SharingImpact {attachments:number;consumerProducts:number;otherUsers:number;activeSubscriptions:number;pendingDeliveries:number}
export interface SharingHistory {revision:number;before_state:PublishState;after_state:PublishState;note:string;created_by:string;created_at:string;impact:SharingImpact}
export interface SharingView {format:"karda.library-sharing.v1";kbId:string;name:string;state:PublishState;revision:number;allowedTargets:PublishState[];impact:SharingImpact;history:SharingHistory[];nextBefore:number|null}
export interface SharingPreview {format:"karda.library-sharing-preview.v1";kbId:string;from:PublishState;target:PublishState;revision:number;previewHash:string;impact:SharingImpact;checkedAt:string}
