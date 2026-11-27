import {createHash} from 'node:crypto';
import type {GraphProjection,OntologySchema} from '../semantic/contracts';
export const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
export const hash=(v:unknown)=>{const stable=(x:unknown,depth=0):unknown=>{if(depth>32)throw Error('graph_budget');if(x===null||typeof x!=='object')return x;if(Array.isArray(x))return x.map(a=>stable(a,depth+1));return Object.fromEntries(Object.entries(x as Record<string,unknown>).sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>[k,stable(v,depth+1)]));};return createHash('sha256').update(JSON.stringify(stable(v))).digest('hex');};
export const id=(v:unknown)=>{if(typeof v!=='string'||!uuid.test(v))throw Error('graph_invalid_request');return v;};
export const obj=(v:unknown):Record<string,unknown>=>{if(!v||typeof v!=='object'||Array.isArray(v))throw Error('graph_invalid_request');return v as Record<string,unknown>;};
export const text=(v:unknown,max=200)=>{if(typeof v!=='string'||!v.trim()||v.length>max)throw Error('graph_invalid_request');return v.trim();};
const ids=(v:unknown,max=500)=>{if(!Array.isArray(v)||v.length>max||new Set(v).size!==v.length)throw Error('graph_invalid_request');return v.map(id);};
export interface GraphStep {title:string;description:string;nodeIds:string[];edgeIds:string[];evidenceIds:string[]}
export interface ViewConfig {nodeIds:string[];edgeIds:string[];layout:'structural'|'grouped'|'circular';positions:Record<string,{x:number;y:number}>;focus:string|null;relationTypes:string[];annotations:{id:string;text:string}[];steps:GraphStep[];groups:{id:string;title:string;nodeIds:string[]}[]}
export interface GraphRule {id:string;kind:'inverse'|'compose'|'transitive';input:string;second?:string;output:string}
export interface RuleConfig {schema:OntologySchema;rules:GraphRule[];hierarchy:{child:string;parent:string}[];constraints:{relationType:string;minSupport:number}[]}
export function viewConfig(v:unknown):ViewConfig{
 const r=obj(v);if(Object.keys(r).some(k=>!['nodeIds','edgeIds','layout','positions','focus','relationTypes','annotations','steps','groups'].includes(k)))throw Error('graph_invalid_request');
 const nodeIds=ids(r.nodeIds),edgeIds=ids(r.edgeIds,1000),positions:ViewConfig['positions']={};
 const p=obj(r.positions??{});if(Object.keys(p).length>500)throw Error('graph_invalid_request');for(const [key,value]of Object.entries(p)){id(key);const c=obj(value);if(!Number.isFinite(c.x)||!Number.isFinite(c.y)||Math.abs(Number(c.x))>1e7||Math.abs(Number(c.y))>1e7)throw Error('graph_invalid_request');positions[key]={x:Number(c.x),y:Number(c.y)};}
 const layout=r.layout;if(!['structural','grouped','circular'].includes(String(layout)))throw Error('graph_invalid_request');
 if(!Array.isArray(r.relationTypes)||r.relationTypes.length>100||!Array.isArray(r.annotations)||r.annotations.length>100||!Array.isArray(r.steps)||r.steps.length>50)throw Error('graph_invalid_request');
 const groups=Array.isArray(r.groups)?r.groups.map(v=>{const g=obj(v);return{id:id(g.id),title:text(g.title),nodeIds:ids(g.nodeIds)};}):[];if(groups.length>100)throw Error('graph_invalid_request');
 return{nodeIds,edgeIds,positions,groups,layout:layout as ViewConfig['layout'],focus:r.focus===null?null:id(r.focus),relationTypes:r.relationTypes.map(x=>text(x,128)),annotations:r.annotations.map(x=>{const a=obj(x);return{id:id(a.id),text:text(a.text,2000)};}),steps:r.steps.map(x=>{const a=obj(x);return{title:text(a.title),description:typeof a.description==='string'?a.description.slice(0,4000):'',nodeIds:ids(a.nodeIds),edgeIds:ids(a.edgeIds,1000),evidenceIds:ids(a.evidenceIds,1000)};})};
}
export function restoreView(config:ViewConfig,graph:GraphProjection){
 const nodes=new Set(graph.nodes.map(n=>n.id)),edges=new Set(graph.edges.map(e=>e.id)),evidence=new Set(graph.evidence.map(e=>e.id));
 const missing={nodeIds:config.nodeIds.filter(x=>!nodes.has(x)),edgeIds:config.edgeIds.filter(x=>!edges.has(x)),evidenceIds:[...new Set(config.steps.flatMap(s=>s.evidenceIds))].filter(x=>!evidence.has(x))};
 return{config:{...config,groups:config.groups.map(g=>({...g,nodeIds:g.nodeIds.filter(x=>nodes.has(x))})),nodeIds:config.nodeIds.filter(x=>nodes.has(x)),edgeIds:config.edgeIds.filter(x=>edges.has(x)),positions:Object.fromEntries(Object.entries(config.positions).filter(([key])=>nodes.has(key))),focus:config.focus&&nodes.has(config.focus)?config.focus:null,annotations:config.annotations.filter(a=>nodes.has(a.id)||edges.has(a.id)),steps:config.steps.map(s=>({...s,nodeIds:s.nodeIds.filter(x=>nodes.has(x)),edgeIds:s.edgeIds.filter(x=>edges.has(x)),evidenceIds:s.evidenceIds.filter(x=>evidence.has(x))}))},missing};
}
export function failure(e:unknown){const code=e instanceof Error?e.message:'';return{code:['graph_invalid_request','graph_denied','graph_conflict','graph_index_not_ready','graph_index_changed','graph_rule_invalid','graph_budget'].includes(code)?code:'graph_unavailable',status:code==='graph_denied'?403:code==='graph_conflict'||code==='graph_index_changed'?409:code==='graph_invalid_request'||code==='graph_rule_invalid'?400:503};}
