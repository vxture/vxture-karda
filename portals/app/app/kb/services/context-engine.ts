import {createHash} from 'node:crypto';
import type {ContextRecipe,ContextSection} from './context-contract';
export const contextHash=(v:unknown):string=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
type Row=Record<string,unknown>;
const row=(v:unknown):Row=>v&&typeof v==='object'&&!Array.isArray(v)?v as Row:{};
const rows=(v:unknown):Row[]=>Array.isArray(v)?v.map(row):[];
export interface ContextEvidence {id:string;kbId:string;documentId:string;documentVersion:number;contentHash:string;start:number;end:number;pages:number[];text:string}
export interface ContextUnit {id:string;kind:'published_fact'|'source_passage'|'accepted_summary'|'deterministic_inference';data:Row;evidence:ContextEvidence[]}
export interface SectionInput {section:ContextSection;units:ContextUnit[];gaps:string[]}
export interface ContextManifest {queryHash:string;revision:string;items:string[];evidence:string[];state:string}
export interface ContextResult {format:string;goal:string;status:string;sections:{id:string;name:string;required:boolean;items:string[];gaps:string[]}[];items:Omit<ContextUnit,'evidence'>[];evidence:ContextEvidence[];selection:{sectionId:string;candidateCount:number;selectedCount:number;excludedByBudget:number;excludedByLimit:number}[];revision:string;fingerprint:string;diff:{comparable:boolean;added:number;removed:number;unchanged:number;addedEvidence:number;removedEvidence:number}|null;budget:{limitBytes:number;usedBytes:number;maxItems:number};untrustedContent:true}
export function normalizeContext(section:ContextSection,result:unknown,sourceHashes:Record<string,string>):SectionInput{
 const r=row(result),pack=row(r.knowledge??result),units:ContextUnit[]=[],gaps=(Array.isArray(r.gaps)?r.gaps:[]).filter((g):g is string=>typeof g==='string');
 function proof(v:Row,kb?:string):ContextEvidence{const kbId=String(v.kbId??kb??''),documentId=String(v.documentId??''),documentVersion=Number(v.documentVersion??v.version),start=Number(v.start),end=Number(v.end),text=String(v.text??v.excerpt??''),contentHash=String(v.contentHash??sourceHashes[kbId+':'+documentId]??'');
  if(!kbId||!documentId||!Number.isSafeInteger(documentVersion)||!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||start<0||end<=start||text.length!==end-start||!/^[a-f0-9]{64}$/.test(contentHash))throw Error('service_context_corrupt');
  const value={kbId,documentId,documentVersion,contentHash,start,end,pages:(Array.isArray(v.pages)?v.pages:[]).filter((x):x is number=>Number.isSafeInteger(x)),text};return {id:contextHash([kbId,documentId,documentVersion,contentHash,start,end]),...value};
 }
 function unit(kind:ContextUnit['kind'],data:Row,evidence:ContextEvidence[]){if(!evidence.length)throw Error('service_context_corrupt');const unique=[...new Map(evidence.map(e=>[e.id,e])).values()].sort((a,b)=>a.id.localeCompare(b.id));const id=contextHash([kind,data,unique.map(e=>e.id)]);units.push({id,kind,data,evidence:unique});}
 if(section.mode==='source'){for(const p of rows(r.items)){const e=proof(p);unit('source_passage',{title:p.title,verificationState:p.verificationState,evidenceIds:[e.id]},[e]);}}
 else if(section.mode==='topics'){
  const dossier=row(r.dossier),known=new Map<string,ContextEvidence>();
  for(const s of rows(dossier.sections)){const statements=rows(s.statements),evidence=statements.flatMap(a=>rows(a.evidence).map(e=>{const p=proof(e,section.kbId);known.set(String(e.id),p);return p;}));unit('published_fact',{kbId:section.kbId,relationId:s.relationId,source:s.source,target:s.target,relationType:section.relationType,statements:statements.map(a=>({id:a.id,text:a.text,evidenceIds:rows(a.evidence).map(e=>known.get(String(e.id))!.id)}))},evidence);}
  const summary=row(r.summary);for(const p of rows(row(summary.payload).paragraphs)){const ids=Array.isArray(p.citations)?p.citations.map(String):[];const evidence=ids.map(id=>known.get(id));if(evidence.some(e=>!e))throw Error('service_context_corrupt');unit('accepted_summary',{summaryId:summary.id,revision:summary.revision,state:'human_accepted',text:p.text,evidenceIds:evidence.map(e=>e!.id)},evidence as ContextEvidence[]);}
 }else{
  const proofs=new Map(rows(pack.evidence).map(e=>[String(e.id),e])),excerpts=new Map(rows(pack.passages).map(p=>[String(p.evidenceId),p.excerpt])),assertions=new Map(rows(pack.assertions).map(a=>[String(a.id),a])),statements=new Map(rows(pack.statements).map(a=>[String(a.id),a.statement])),nodes=new Map(rows(pack.nodes).map(n=>[String(n.id),n])),byRelation=new Map<string,ContextUnit>();
  const ranked=rows(row(pack.search).items).map(x=>String(x.relationId));
  for(const edge of rows(pack.edges).sort((a,b)=>{const ai=ranked.indexOf(String(a.id)),bi=ranked.indexOf(String(b.id));return (ai<0?1000:ai)-(bi<0?1000:bi)||String(a.id).localeCompare(String(b.id));})){const evidence:ContextEvidence[]=[];const as=(Array.isArray(edge.assertionIds)?edge.assertionIds:[]).map(String).map(id=>{const a=assertions.get(id);if(!a)throw Error('service_context_corrupt');const refs=(Array.isArray(a.evidenceIds)?a.evidenceIds:[]).map(String).map(eid=>{const e=proofs.get(eid);if(!e||!excerpts.has(eid))throw Error('service_context_corrupt');const p=proof({...e,text:excerpts.get(eid)});evidence.push(p);return {id:p.id,stance:e.stance};});return {id,statement:statements.get(id),verificationState:a.verificationState,validFrom:a.validFrom,validUntil:a.validUntil,evidence:refs};});
   const source=nodes.get(String(edge.sourceId)),target=nodes.get(String(edge.targetId));if(!source||!target)throw Error('service_context_corrupt');unit('published_fact',{kbId:edge.kbId,relationId:edge.id,type:edge.type,schema:edge.schema,source,target,assertions:as},evidence);byRelation.set(String(edge.id),units.at(-1)!);
  }
  for(const inf of rows(row(r.inference).inferences)){const ids=Array.isArray(inf.premiseIds)?inf.premiseIds.map(String):[],premises=ids.map(id=>byRelation.get(id));if(!premises.length||premises.some(p=>!p))throw Error('service_context_corrupt');unit('deterministic_inference',{...inf,premises:premises.map(p=>p!.data)},premises.flatMap(p=>p!.evidence));}
  if(rows(pack.identity).some(i=>Number(i.unresolved)>0))gaps.push('known_identity_conflicts');
  if(row(r.inference).truncated===true)gaps.push('inference_window_truncated');
 }
 if(pack.sourceStatus==='partial'||r.partial===true)gaps.push('source_unavailable');if(pack.truncated===true||r.truncated===true)gaps.push('candidate_window_truncated');
 if(Array.isArray(pack.gaps))for(const g of pack.gaps)if(typeof g==='string')gaps.push(g);
 if(!units.length)gaps.push('no_match');
 if(units.length>1000||Buffer.byteLength(JSON.stringify(units))>4*1024*1024)throw Error('service_context_candidate_budget');
 return {section,units:[...new Map(units.map(u=>[u.id,u])).values()],gaps:[...new Set(gaps)].sort()};
}
export function assembleContext(recipe:ContextRecipe,inputs:SectionInput[],limit:number,revision:string,queryHash:string,previous:ContextManifest|null,wrap:(r:ContextResult)=>unknown){
 const selected=new Map<string,ContextUnit>(),refs=new Map<string,Set<string>>(),counts=new Map<string,{budget:number;limit:number}>();for(const x of inputs){refs.set(x.section.id,new Set());counts.set(x.section.id,{budget:0,limit:0});}
 const fingerprint=()=>contextHash([revision,[...selected.keys()].sort(),inputs.map(x=>[x.section.id,[...refs.get(x.section.id)!].sort(),x.gaps])]);
 function render():ContextResult{const evidence=[...new Map([...selected.values()].flatMap(u=>u.evidence).map(e=>[e.id,e])).values()].sort((a,b)=>a.id.localeCompare(b.id));const sections=inputs.map(x=>({id:x.section.id,name:x.section.name,required:x.section.required,items:[...refs.get(x.section.id)!],gaps:[...x.gaps,...(counts.get(x.section.id)!.budget?['budget_excluded']:[]),...(counts.get(x.section.id)!.limit?['item_limit_excluded']:[])]}));
 const incomplete=sections.some(s=>s.required&&!s.items.length),partial=sections.some(s=>s.gaps.length);const old=previous?.queryHash===queryHash?previous:null,keys=[...selected.keys()];
 return {format:'karda.task-context.v1',goal:recipe.goal,status:incomplete?'insufficient':selected.size===0?(sections.some(s=>s.gaps.includes('backend_failed'))?'partial':'empty'):partial?'partial':'complete',sections,items:[...selected.values()].map(({evidence:_,...u})=>u),evidence,selection:inputs.map(x=>({sectionId:x.section.id,candidateCount:x.units.length,selectedCount:refs.get(x.section.id)!.size,excludedByBudget:counts.get(x.section.id)!.budget,excludedByLimit:counts.get(x.section.id)!.limit})),revision,fingerprint:fingerprint(),diff:previous?{comparable:!!old,added:old?keys.filter(k=>!old.items.includes(k)).length:keys.length,removed:old?old.items.filter(k=>!selected.has(k)).length:0,unchanged:old?keys.filter(k=>old.items.includes(k)).length:0,addedEvidence:old?evidence.filter(e=>!old.evidence.includes(e.id)).length:evidence.length,removedEvidence:old?old.evidence.filter(id=>!evidence.some(e=>e.id===id)).length:0}:null,budget:{limitBytes:limit,usedBytes:limit,maxItems:recipe.maxItems},untrustedContent:true};}
 const ordered=inputs.slice().sort((a,b)=>Number(b.section.required)-Number(a.section.required)||b.section.priority-a.section.priority||a.section.id.localeCompare(b.section.id));
 const attempted=new Set<string>();
 const attempt=(x:SectionInput,u:ContextUnit)=>{const key=x.section.id+':'+u.id;if(attempted.has(key))return;attempted.add(key);const set=refs.get(x.section.id)!;if(set.has(u.id))return;const existed=selected.has(u.id);if(!existed&&selected.size>=recipe.maxItems){counts.get(x.section.id)!.limit++;return;}selected.set(u.id,u);set.add(u.id);if(Buffer.byteLength(JSON.stringify(wrap(render())))>limit-512){set.delete(u.id);if(!existed)selected.delete(u.id);counts.get(x.section.id)!.budget++;}};
 // Give every mandatory section a chance before filling any section.
 for(const x of ordered.filter(x=>x.section.required))for(const u of x.units){attempt(x,u);if(refs.get(x.section.id)!.size)break;}
 for(const x of ordered)for(const u of x.units)if(!refs.get(x.section.id)!.has(u.id))attempt(x,u);
 const result=render();result.budget.usedBytes=Buffer.byteLength(JSON.stringify(wrap(result)));for(let i=0;i<3;i++)result.budget.usedBytes=Buffer.byteLength(JSON.stringify(wrap(result)));
 if(result.budget.usedBytes>limit)throw Error('service_context_budget');
 return {result,manifest:{queryHash,revision,items:[...selected.keys()].sort(),evidence:result.evidence.map(e=>e.id),state:result.status} satisfies ContextManifest};
}
