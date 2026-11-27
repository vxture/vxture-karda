import {hash} from '../graph/contract';
export {hash};
export const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
export function id(v:unknown):string{if(typeof v!=='string'||!uuid.test(v))throw Error('identity_invalid_request');return v;}
export function object(v:unknown):Record<string,unknown>{if(!v||typeof v!=='object'||Array.isArray(v))throw Error('identity_invalid_request');return v as Record<string,unknown>;}
export function text(v:unknown,max=512):string{if(typeof v!=='string'||!v.trim()||v.length>max)throw Error('identity_invalid_request');return v.trim();}
export function strings(v:unknown,max=50):string[]{if(!Array.isArray(v)||v.length>max)throw Error('identity_invalid_request');const a=v.map(x=>text(x));if(new Set(a).size!==a.length)throw Error('identity_invalid_request');return a;}
export interface Profile {id:string;name:string;kind:string;aliases:string[];external:{namespace:string;value:string}[]}
export interface Decision {key:string;relationIds:string[];fingerprint:string;outcome:'accept'|'reject'|'coexist'|'supersede'|'pending';winner:string|null;scope:string;from:string|null;until:string|null;note:string}
export interface IdentityConfig {profiles:Profile[];links:{from:string;to:string}[];dismissals:{key:string;fingerprint:string;outcome:'reject'|'defer';note:string}[];singleValue:string[];decisions:Decision[]}
export const emptyConfig=():IdentityConfig=>({profiles:[],links:[],dismissals:[],singleValue:[],decisions:[]});
export interface EntityRecord {id:string;kbId:string;name:string;kind:string;aliases:string[]}
export interface FactRecord {id:string;kbId:string;type:string;sourceId:string;targetId:string;assertionIds:string[];statements:{id:string;statement:string;asOf?:string|null;from:string|null;until:string|null;fingerprint:string}[];evidence:{id:string;documentId:string;version:number;start:number;end:number;excerpt:string;fingerprint:string}[]}
export interface Inventory {entities:EntityRecord[];facts:FactRecord[];relationTypes:string[];entityKinds:string[];generation:number}
export function config(v:unknown):IdentityConfig{
 const c=object(v),e=emptyConfig();if(Object.keys(c).sort().join()!==Object.keys(e).sort().join())throw Error('identity_invalid_request');
 for(const k of ['profiles','links','dismissals','decisions'] as const)if(!Array.isArray(c[k])||(c[k] as unknown[]).length>1000)throw Error('identity_budget');
 e.profiles=(c.profiles as unknown[]).map(x=>{const p=object(x);if(!Array.isArray(p.external)||p.external.length>50)throw Error('identity_invalid_request');return{id:id(p.id),name:text(p.name),kind:text(p.kind,64),aliases:strings(p.aliases),external:p.external.map(x=>{const t=object(x);return{namespace:text(t.namespace,128),value:text(t.value)};})};});
 e.links=(c.links as unknown[]).map(x=>{const p=object(x);return{from:id(p.from),to:id(p.to)};});
 e.singleValue=strings(c.singleValue,100);
 e.dismissals=(c.dismissals as unknown[]).map(x=>{const p=object(x);if(!['reject','defer'].includes(String(p.outcome)))throw Error('identity_invalid_request');return{key:text(p.key,128),fingerprint:text(p.fingerprint,64),outcome:p.outcome as 'reject'|'defer',note:text(p.note,4000)};});
 e.decisions=(c.decisions as unknown[]).map(x=>{const p=object(x);if(!['accept','reject','coexist','supersede','pending'].includes(String(p.outcome)))throw Error('identity_invalid_request');const stamp=(v:unknown)=>{if(v===null)return null;if(typeof v!=='string'||!Number.isFinite(Date.parse(v)))throw Error('identity_invalid_request');return new Date(v).toISOString();};const relationIds=strings(p.relationIds,100).map(id);if(relationIds.length<1)throw Error('identity_invalid_request');const d:Decision={key:text(p.key,128),relationIds,fingerprint:text(p.fingerprint,64),outcome:p.outcome as Decision['outcome'],winner:p.winner===null?null:id(p.winner),scope:text(p.scope,512),from:stamp(p.from),until:stamp(p.until),note:text(p.note,4000)};if(d.scope!=='library')throw Error('identity_invalid_request');if(d.from&&d.until&&d.from>=d.until||['accept','supersede'].includes(d.outcome)&&(!d.winner||!d.relationIds.includes(d.winner)))throw Error('identity_invalid_request');return d;});
 for(const rows of [e.profiles.map(p=>p.id),e.links.map(p=>p.from),e.dismissals.map(p=>p.key),e.decisions.map(p=>p.key)])if(new Set(rows).size!==rows.length)throw Error('identity_invalid_request');canonicalMap(e);if(JSON.stringify(e).length>1024*1024)throw Error('identity_budget');return e;
}
export function canonicalMap(c:IdentityConfig):Map<string,string>{const links=new Map(c.links.map(l=>[l.from,l.to])),out=new Map<string,string>();for(const start of links.keys()){const seen=new Set<string>();let at=start;while(links.has(at)){if(seen.has(at))throw Error('identity_cycle');seen.add(at);at=links.get(at)!;}out.set(start,at);}return out;}
export function failure(e:unknown){const code=e instanceof Error?e.message:'';return code==='identity_denied'?{status:403,code}:code==='identity_conflict'||code==='identity_stale'?{status:409,code}:code==='identity_budget'?{status:413,code}:/^identity_(invalid|cycle|type)/.test(code)?{status:400,code}:{status:503,code:'identity_unavailable'};}
