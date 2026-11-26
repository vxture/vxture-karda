import {parseKnowledgeSync,type KnowledgeSyncRequest} from "./knowledge-sync";
export const SUB_UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
export type SubscriptionCommand={action:"create";id:string;name:string;window:Record<string,unknown>}|
  {action:"list";before?:string}|{action:"poll";id:string;after?:number}|
  {action:"ack";id:string;sequence:number;revision:string;expectedAck:number}|{action:"cancel";id:string};
const invalid=():never=>{throw Error("subscription_invalid_request");};
export function subscriptionWindow(value:unknown):KnowledgeSyncRequest{
  const parsed=parseKnowledgeSync(value);
  if(parsed.knownRevision!==undefined||parsed.input.query.pageCursor!==undefined)invalid();
  return parsed;
}
export function parseSubscription(value:unknown):SubscriptionCommand{
  if(!value||typeof value!=="object"||Array.isArray(value)||JSON.stringify(value).length>8192)invalid();
  const v=value as Record<string,unknown>,fields=v.action==="create"?["action","id","name","window"]:
    v.action==="list"?["action",...(v.before!==undefined?["before"]:[])]:v.action==="poll"?["action","id",...(v.after!==undefined?["after"]:[])]:
    v.action==="ack"?["action","id","sequence","revision","expectedAck"]:v.action==="cancel"?["action","id"]:invalid();
  if(Object.keys(v).sort().join()!==fields.sort().join())invalid();
  if(v.action!=="list"&&(typeof v.id!=="string"||!SUB_UUID.test(v.id)))invalid();
  if(v.before!==undefined&&(typeof v.before!=="string"||!SUB_UUID.test(v.before)))invalid();
  for(const key of ["after","sequence","expectedAck"])if(v[key]!==undefined&&(!Number.isSafeInteger(v[key])||(v[key] as number)<0||(v[key] as number)>=2147483647))invalid();
  if(v.action==="create"){
    if(typeof v.name!=="string"||!v.name.trim()||v.name.length>120)invalid();
    try{subscriptionWindow(v.window);}catch{return invalid();}
  }
  if(v.action==="ack"&&(typeof v.revision!=="string"||!/^[a-f0-9]{64}$/.test(v.revision)||(v.sequence as number)<1))invalid();
  return structuredClone(v) as SubscriptionCommand;
}
export interface SubscriptionRow {id:string;name:string;window:Record<string,unknown>;enabled:boolean;sequence:number;ack_sequence:number;
  last_revision:string|null;created_at:string;updated_at:string}
export interface SubscriptionEvent {sequence:number;revision:string;observedAt:string}
