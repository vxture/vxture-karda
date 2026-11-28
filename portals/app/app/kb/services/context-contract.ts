// Task recipes extend knowledge service versions; no separate authority.
export type ContextMode='facts'|'topics'|'source'|'package'|'visual';
export interface ContextSection {id:string;name:string;mode:ContextMode;required:boolean;priority:number;query:string;kbId?:string;relationType?:string;entityIds:string[];relationTypes:string[];maxHops:number;maxNodes:number;maxEdges:number;ruleAssetId?:string;visualKind?:string}
export interface ContextRecipe {goal:string;allowPartial:boolean;maxItems:number;sections:ContextSection[]}
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
function bad():never{throw Error('service_invalid_context');}
function obj(v:unknown):Record<string,unknown>{if(!v||typeof v!=='object'||Array.isArray(v))return bad();return v as Record<string,unknown>;}
function text(v:unknown,max:number,empty=false):string{if(typeof v!=='string'||v.length>max||(!empty&&!v.trim()))return bad();return v.trim();}
function num(v:unknown,min:number,max:number):number{if(!Number.isSafeInteger(v)||(v as number)<min||(v as number)>max)return bad();return v as number;}
export function contextRecipe(value:unknown,kbIds:string[]):ContextRecipe{
 const v=obj(value);if(Object.keys(v).sort().join(',')!=='allowPartial,goal,maxItems,sections'||typeof v.allowPartial!=='boolean'||!Array.isArray(v.sections)||!v.sections.length||v.sections.length>8)return bad();
 const sections=v.sections.map(raw=>{const s=obj(raw);if(Object.keys(s).some(k=>!['id','name','mode','required','priority','query','kbId','relationType','entityIds','relationTypes','maxHops','maxNodes','maxEdges','ruleAssetId','visualKind'].includes(k))||typeof s.required!=='boolean'||!['facts','topics','source','package','visual'].includes(String(s.mode)))return bad();
 const id=text(s.id,40);if(!/^[a-z][a-z0-9_-]*$/.test(id))return bad();const mode=s.mode as ContextMode;
 const ids=s.entityIds,types=s.relationTypes;if(!Array.isArray(ids)||ids.length>20||ids.some(x=>typeof x!=='string'||!uuid.test(x))||new Set(ids).size!==ids.length||!Array.isArray(types)||types.length>20)return bad();
 const section:ContextSection={id,name:text(s.name,120),mode,required:s.required,priority:num(s.priority,0,100),query:text(s.query,249,true),entityIds:[...ids] as string[],relationTypes:types.map(x=>text(x,128)),maxHops:num(s.maxHops,1,3),maxNodes:num(s.maxNodes,2,100),maxEdges:num(s.maxEdges,1,100)};
 if(s.kbId!==undefined){if(typeof s.kbId!=='string'||!kbIds.includes(s.kbId))return bad();section.kbId=s.kbId;}
 if(s.relationType!==undefined)section.relationType=text(s.relationType,128);
 if(mode==='topics'&&(!section.kbId||!section.relationType))return bad();
 if(mode!=='package'&&(ids.length||types.length||s.ruleAssetId!==undefined))return bad();
 if(mode!=='topics'&&s.relationType!==undefined)return bad();
 if(s.ruleAssetId!==undefined){if(typeof s.ruleAssetId!=='string'||!uuid.test(s.ruleAssetId)||!section.kbId)return bad();section.ruleAssetId=s.ruleAssetId;}
 if(s.visualKind!==undefined){if(mode!=='visual'||!['transcript','table','chart','diagram','formula'].includes(String(s.visualKind)))return bad();section.visualKind=String(s.visualKind);}
 return section;});
 if(new Set(sections.map(s=>s.id)).size!==sections.length)return bad();
 return {goal:text(v.goal,1000),allowPartial:v.allowPartial,maxItems:num(v.maxItems,1,80),sections};
}
