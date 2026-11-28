import {contextRecipe,type ContextRecipe} from './context-contract';
export const SERVICE_UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
export const CAPABILITIES=['facts','topics','source','package','context','visual'] as const;
export type Capability=typeof CAPABILITIES[number];
export interface ServiceConfig {name:string;description:string;kbIds:string[];capabilities:Capability[];sourceFallback:boolean;verificationFilter:'verified_only'|'verified_and_untracked'|'all';topK:number;contextBytes:number;context?:ContextRecipe}
export function record(v:unknown):Record<string,unknown>{if(!v||typeof v!=='object'||Array.isArray(v))throw Error('service_invalid_request');return v as Record<string,unknown>;}
export function keys(v:Record<string,unknown>,names:string[]){if(Object.keys(v).some(k=>!names.includes(k))||names.some(k=>!Object.hasOwn(v,k)))throw Error('service_invalid_request');}
export function uuid(v:unknown):string{if(typeof v!=='string'||!SERVICE_UUID.test(v))throw Error('service_invalid_request');return v;}
export function integer(v:unknown,min:number,max:number):number{if(!Number.isSafeInteger(v)||(v as number)<min||(v as number)>max)throw Error('service_invalid_request');return v as number;}
export function string(v:unknown,max:number,empty=false):string{if(typeof v!=='string'||v.length>max||(!empty&&!v.trim()))throw Error('service_invalid_request');return v.trim();}
export function config(value:unknown):ServiceConfig{
 const v=record(value);keys(v,[...(Object.hasOwn(v,'context')?['context']:[]),'name','description','kbIds','capabilities','sourceFallback','verificationFilter','topK','contextBytes']);
 if(!Array.isArray(v.kbIds)||!v.kbIds.length||v.kbIds.length>20||new Set(v.kbIds).size!==v.kbIds.length||!Array.isArray(v.capabilities)||!v.capabilities.length||v.capabilities.length>6||new Set(v.capabilities).size!==v.capabilities.length||v.capabilities.some(c=>!CAPABILITIES.includes(c as Capability))||typeof v.sourceFallback!=='boolean'||(v.sourceFallback&&!v.capabilities.includes('facts'))||!['verified_only','verified_and_untracked','all'].includes(v.verificationFilter as string))throw Error('service_invalid_request');
 if(v.capabilities.includes('context')!==Object.hasOwn(v,'context'))throw Error('service_invalid_context');
 return {name:string(v.name,120),description:string(v.description,2000,true),kbIds:v.kbIds.map(uuid).sort(),capabilities:(v.capabilities as Capability[]).slice().sort(),sourceFallback:v.sourceFallback,verificationFilter:v.verificationFilter as ServiceConfig['verificationFilter'],topK:integer(v.topK,1,20),contextBytes:integer(v.contextBytes,4096,262144),...(Object.hasOwn(v,'context')?{context:contextRecipe(v.context,v.kbIds as string[])}:{})};
}
export type ServiceCommand=
 |{action:'create';id:string;config:ServiceConfig;note:string}
 |{action:'save';id:string;eventId:string;expectedRevision:number;config:ServiceConfig;note:string}
 |{action:'preview';id:string;target:'draft'|'stop'|string}
 |{action:'apply';id:string;target:string;versionId:string;eventId:string;expectedRevision:number;previewHash:string;note:string};
export function command(value:unknown):ServiceCommand{const v=record(value);const action=v.action;
 if(action==='create'){keys(v,['action','id','config','note']);return {action,id:uuid(v.id),config:config(v.config),note:string(v.note,2000)};}
 if(action==='save'){keys(v,['action','id','eventId','expectedRevision','config','note']);return {action,id:uuid(v.id),eventId:uuid(v.eventId),expectedRevision:integer(v.expectedRevision,0,2147483646),config:config(v.config),note:string(v.note,2000)};}
 if(action==='preview'||action==='apply'){const target=v.target==='draft'||v.target==='stop'?v.target:uuid(v.target);
  if(action==='preview'){keys(v,['action','id','target']);return {action,id:uuid(v.id),target};}
  keys(v,['action','id','target','versionId','eventId','expectedRevision','previewHash','note']);if(typeof v.previewHash!=='string'||!/^[a-f0-9]{64}$/.test(v.previewHash))throw Error('service_invalid_request');return {action,id:uuid(v.id),target,versionId:uuid(v.versionId),eventId:uuid(v.eventId),expectedRevision:integer(v.expectedRevision,0,2147483646),previewHash:v.previewHash,note:string(v.note,2000)};
 }throw Error('service_invalid_request');}
export interface Invoke {serviceId:string;requestId:string;capability:Capability;draft:boolean;query?:string;kbId?:string;relationType?:string;summaryId?:string;before?:string;entityIds?:string[];pageCursor?:string;taskId?:string;runId?:string;previousRequestId?:string;export?:boolean;assetId?:string;versionId?:string;documentId?:string;visualKind?:string;page?:number}
export function invocation(value:unknown):Invoke{const v=record(value);if(Object.keys(v).some(k=>!['serviceId','requestId','capability','draft','query','kbId','relationType','summaryId','before','entityIds','pageCursor','taskId','runId','previousRequestId','export','assetId','versionId','documentId','visualKind','page'].includes(k))||!CAPABILITIES.includes(v.capability as Capability)||(v.draft!==undefined&&typeof v.draft!=='boolean'))throw Error('service_invalid_request');
 const result:Invoke={serviceId:uuid(v.serviceId),requestId:uuid(v.requestId),capability:v.capability as Capability,draft:v.draft===true};
 const allowed=result.capability==='visual'?['query','assetId','versionId','documentId','visualKind','page']:result.capability==='context'?['query','taskId','runId','previousRequestId','export']:result.capability==='facts'?['query','pageCursor']:result.capability==='source'?['query']:result.capability==='topics'?['kbId','relationType','summaryId','before']:['entityIds','pageCursor'];
 for(const k of ['query','kbId','relationType','summaryId','before','entityIds','pageCursor','taskId','runId','previousRequestId','export','assetId','versionId','documentId','visualKind','page'])if(Object.hasOwn(v,k)&&!allowed.includes(k))throw Error('service_invalid_request');
 if(result.capability==='facts'||result.capability==='source')result.query=string(v.query,500);
 for(const k of ['kbId','summaryId','before'] as const)if(v[k]!==undefined)result[k]=uuid(v[k]);
 if(v.relationType!==undefined)result.relationType=string(v.relationType,128);
 if((v.summaryId||v.before)&&(!v.relationType||v.summaryId&&v.before))throw Error('service_invalid_request');
 if(v.pageCursor!==undefined)result.pageCursor=string(v.pageCursor,16384,true);
 if(result.capability==='package'){if(!Array.isArray(v.entityIds)||v.entityIds.length>20)throw Error('service_invalid_request');result.entityIds=v.entityIds.map(uuid);if(result.entityIds.length&&v.pageCursor!==undefined)throw Error('service_invalid_request');}
 if(result.capability==='context'){result.query=string(v.query,250);for(const k of ['taskId','runId'] as const)if(v[k]!==undefined)result[k]=string(v[k],128);if(v.previousRequestId!==undefined)result.previousRequestId=uuid(v.previousRequestId);if(v.export!==undefined){if(typeof v.export!=='boolean')throw Error('service_invalid_request');result.export=v.export;}}
 if(result.capability==='visual'){result.query=v.query===undefined?'':string(v.query,500,true);for(const k of ['assetId','versionId','documentId'] as const)if(v[k]!==undefined)result[k]=uuid(v[k]);if((result.assetId===undefined)!==(result.versionId===undefined))throw Error('service_invalid_request');if(v.visualKind!==undefined){if(!['transcript','table','chart','diagram','formula'].includes(String(v.visualKind)))throw Error('service_invalid_request');result.visualKind=String(v.visualKind);}if(v.page!==undefined)result.page=integer(v.page,1,300);}
 return result;}
export function serviceError(e:unknown){const raw=e instanceof Error?e.message:'';const code=/^service_[a-z_]+$/.test(raw)?raw:'service_unavailable';return {code,status:/denied/.test(code)?403:/not_found/.test(code)?404:/invalid|budget/.test(code)?400:/changed|conflict|inactive|replay|limit/.test(code)?409:503};}
