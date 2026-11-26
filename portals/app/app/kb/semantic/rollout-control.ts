export interface RolloutCommand {eventId:string;expectedRevision:number;enabled:boolean;reason:string}
export interface RolloutEvent {revision:number;eventId:string;enabled:boolean;reason:string;changedBy:string;createdAt:string}
export interface RolloutState {format:"karda.knowledge-rollout.v1";revision:number;enabled:boolean;history:RolloutEvent[]}
export function parseRolloutCommand(value:unknown):RolloutCommand{
  if(!value||typeof value!=="object"||Array.isArray(value))throw Error("knowledge_rollout_invalid");
  const v=value as Record<string,unknown>;
  if(Object.keys(v).sort().join(",")!=="enabled,eventId,expectedRevision,reason"||
    typeof v.eventId!=="string"||!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(v.eventId)||
    !Number.isInteger(v.expectedRevision)||(v.expectedRevision as number)<0||(v.expectedRevision as number)>=2147483647||
    typeof v.enabled!=="boolean"||typeof v.reason!=="string"||!v.reason.trim()||v.reason.length>1000)throw Error("knowledge_rollout_invalid");
  return {eventId:v.eventId,expectedRevision:v.expectedRevision as number,enabled:v.enabled,reason:v.reason.trim()};
}
export function rolloutState(history:RolloutEvent[]):RolloutState{
  return {format:"karda.knowledge-rollout.v1",revision:history[0]?.revision??0,enabled:history[0]?.enabled??true,history};
}
