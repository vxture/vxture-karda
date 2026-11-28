/**
 * Public knowledge validation, provenance and release validation.
 * @package @karda/app
 * @layer Application
 * @category ProductOperations
 * @author AI-Generated
 * @date 2026-11-28
 */
import {createHash} from 'node:crypto';
import {OPS_ROLES,type OpsRole} from './identity';
export const hash=(value:unknown)=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
export function text(value:unknown,max=10000):string{if(typeof value!=='string'||!value.trim()||value.length>max)throw Error('operations_invalid_input');return value.trim();}
export function uuid(value:unknown){const s=text(value,36);if(!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(s))throw Error('operations_invalid_id');return s;}
export function record(value:unknown):Record<string,unknown>{if(!value||typeof value!=='object'||Array.isArray(value))throw Error('operations_invalid_input');return value as Record<string,unknown>;}
export function roles(value:unknown):OpsRole[]{if(!Array.isArray(value)||value.length>5||!value.every(v=>typeof v==='string'&&Object.hasOwn(OPS_ROLES,v))||new Set(value).size!==value.length)throw Error('operations_invalid_roles');return value as OpsRole[];}
export interface Artifact {id:string;kind:'source'|'item'|'relation';payload:Record<string,unknown>;revision:number;created_by:string}
export function artifact(kind:unknown,value:unknown):Record<string,unknown>{
 const p=record(value),title=text(p.title,512);
 if(kind==='source'){
  const url=new URL(text(p.url,2048));if(url.protocol!=='https:'||url.username||url.password)throw Error('operations_invalid_source_url');
  const content=text(p.text,500000).replace(/\r\n/g,'\n'),effective=p.effective==null?'':String(p.effective);if(effective&&!/^\d{4}-\d{2}-\d{2}$/.test(effective))throw Error('operations_invalid_date');
  return {title,url:url.href,text:content,issuer:text(p.issuer,255),edition:text(p.edition,255),effective,validity:['current','historical','unknown','withdrawn'].includes(String(p.validity))?p.validity:'unknown',rights:text(p.rights,2000),contentHash:hash(content),nature:'source'};
 }
 if(kind==='item'){
  const start=p.start,end=p.end;if(!Number.isInteger(start)||!Number.isInteger(end)||(start as number)<0||(end as number)<=(start as number))throw Error('operations_invalid_locator');
  return {title,statement:text(p.statement,10000),sourceId:uuid(p.sourceId),sourceHash:text(p.sourceHash,64),start,end,category:text(p.category,64),nature:['explanation','checklist','template','fact'].includes(String(p.nature))?p.nature:'fact',conditions:text(p.conditions,4000),exceptions:text(p.exceptions,4000)};
 }
 if(kind==='relation')return{title,sourceId:uuid(p.sourceId),targetId:uuid(p.targetId),evidenceId:uuid(p.evidenceId),type:text(p.type,64)};
 throw Error('operations_invalid_kind');
}
export function validateSnapshot(artifacts:Artifact[]){
 if(!artifacts.length||artifacts.length>5000)throw Error('operations_empty_or_large');const map=new Map(artifacts.map(a=>[a.id,a]));
 for(const a of artifacts){const p=a.payload;
 if(a.kind==='item'){const s=map.get(String(p.sourceId));if(!s||s.kind!=='source'||s.payload.contentHash!==p.sourceHash||!['current','historical'].includes(String(s.payload.validity))||Number(p.end)>String(s.payload.text).length)throw Error('operations_stale_evidence');}
 if(a.kind==='relation'&&(![p.sourceId,p.targetId].every(id=>map.get(String(id))?.kind==='item')||map.get(String(p.evidenceId))?.kind!=='source'))throw Error('operations_invalid_relation');
 }
}
export function projection(artifacts:Artifact[]){return {nodes:artifacts.filter(a=>a.kind!=='relation').map(a=>({id:a.id,label:String(a.payload.title),kind:a.kind})),edges:artifacts.flatMap(a=>a.kind==='relation'?[{id:a.id,source:String(a.payload.sourceId),target:String(a.payload.targetId),label:String(a.payload.type)}]:a.kind==='item'?[{id:'evidence-'+a.id,source:a.id,target:String(a.payload.sourceId),label:'依据'}]:[])};}
