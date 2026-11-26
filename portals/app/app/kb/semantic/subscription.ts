import {parseKnowledgeSync,type KnowledgeSyncRequest} from "./knowledge-sync";
export const SUB_UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
export type SubscriptionCommand={action:"create";id:string;name:string;window:Record<string,unknown>}|
  {action:"list";before?:string;deliveryStatus?:DeliveryMetadata["delivery_status"]}|{action:"poll";id:string;after?:number}|
  {action:"ack";id:string;sequence:number;revision:string;expectedAck:number}|{action:"cancel";id:string}|
  {action:"claim";id:string;requestId:string;expectedDeliveryRevision:number;worker:string}|
  {action:"complete";id:string;eventId:string;leaseId:string;expectedDeliveryRevision:number;sequence:number;revision:string}|
  {action:"fail";id:string;eventId:string;leaseId:string;expectedDeliveryRevision:number;reason:"transient"|"permanent"}|
  {action:"redrive";id:string;eventId:string;expectedDeliveryRevision:number;note:string}|
  {action:"delivery_history";id:string;before?:number};
const invalid=():never=>{throw Error("subscription_invalid_request");};
export function subscriptionWindow(value:unknown):KnowledgeSyncRequest{
  const parsed=parseKnowledgeSync(value);
  if(parsed.knownRevision!==undefined||parsed.input.query.pageCursor!==undefined)invalid();
  return parsed;
}
export function parseSubscription(value:unknown):SubscriptionCommand{
  if(!value||typeof value!=="object"||Array.isArray(value)||JSON.stringify(value).length>8192)invalid();
  const v=value as Record<string,unknown>,fields=v.action==="create"?["action","id","name","window"]:
    v.action==="list"?["action",...(v.before!==undefined?["before"]:[]),...(v.deliveryStatus!==undefined?["deliveryStatus"]:[])]:v.action==="poll"?["action","id",...(v.after!==undefined?["after"]:[])]:
    v.action==="ack"?["action","id","sequence","revision","expectedAck"]:v.action==="cancel"?["action","id"]:
    v.action==="claim"?["action","id","requestId","expectedDeliveryRevision","worker"]:
    v.action==="complete"?["action","id","eventId","leaseId","expectedDeliveryRevision","sequence","revision"]:
    v.action==="fail"?["action","id","eventId","leaseId","expectedDeliveryRevision","reason"]:
    v.action==="redrive"?["action","id","eventId","expectedDeliveryRevision","note"]:
    v.action==="delivery_history"?["action","id",...(v.before!==undefined?["before"]:[])]:invalid();
  if(Object.keys(v).sort().join()!==fields.sort().join())invalid();
  if(v.action!=="list"&&(typeof v.id!=="string"||!SUB_UUID.test(v.id)))invalid();
  if(v.before!==undefined&&(v.action==="delivery_history"?(!Number.isSafeInteger(v.before)||(v.before as number)<1||(v.before as number)>2147483647):(typeof v.before!=="string"||!SUB_UUID.test(v.before))))invalid();
  for(const key of ["after","sequence","expectedAck","expectedDeliveryRevision"])if(v[key]!==undefined&&(!Number.isSafeInteger(v[key])||(v[key] as number)<0||(v[key] as number)>=2147483647))invalid();
  if(v.deliveryStatus!==undefined&&!["ready","leased","retry","dead","done","cancelled"].includes(String(v.deliveryStatus)))invalid();
  if(["claim","complete","fail","redrive"].includes(String(v.action))&&!Number.isSafeInteger(v.expectedDeliveryRevision))invalid();
  if(v.action==="claim"&&(typeof v.requestId!=="string"||!SUB_UUID.test(v.requestId)))invalid();
  if(["complete","fail","redrive"].includes(String(v.action))&&(typeof v.eventId!=="string"||!SUB_UUID.test(v.eventId)))invalid();
  if(["complete","fail"].includes(String(v.action))&&(typeof v.leaseId!=="string"||!SUB_UUID.test(v.leaseId)))invalid();
  if(v.action==="create"){
    if(typeof v.name!=="string"||!v.name.trim()||v.name.length>120)invalid();
    try{subscriptionWindow(v.window);}catch{return invalid();}
  }
  if((v.action==="ack"||v.action==="complete")&&(typeof v.revision!=="string"||!/^[a-f0-9]{64}$/.test(v.revision)||(v.sequence as number)<1))invalid();
  for(const key of ["requestId","eventId","leaseId"])if(v[key]!==undefined&&(typeof v[key]!=="string"||!SUB_UUID.test(v[key] as string)))invalid();
  if(v.action==="claim"&&(typeof v.worker!=="string"||!v.worker.trim()||v.worker.length>80))invalid();
  if(v.action==="fail"&&!['transient','permanent'].includes(String(v.reason)))invalid();
  if(v.action==="redrive"&&(typeof v.note!=="string"||!v.note.trim()||v.note.length>2000))invalid();
  return structuredClone(v) as SubscriptionCommand;
}
export interface SubscriptionRow {id:string;name:string;window:Record<string,unknown>;enabled:boolean;sequence:number;ack_sequence:number;
  last_revision:string|null;created_at:string;updated_at:string}
export interface SubscriptionEvent {sequence:number;revision:string;observedAt:string}
export interface DeliveryMetadata {delivery_revision:number;delivery_sequence:number;delivery_attempt:number;
  delivery_status:"ready"|"leased"|"retry"|"dead"|"done"|"cancelled";delivery_worker:string|null;lease_until:string|null;retry_after:string|null}
export type DeliveryCommand=Extract<SubscriptionCommand,{action:"claim"|"complete"|"fail"|"redrive"}>;
