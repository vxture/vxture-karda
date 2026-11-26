import type {CompilerSnapshot} from "./compiler";
export type CompileProfile=Pick<CompilerSnapshot,"schema"|"entityTypes">;
export const PROFILE_UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const code=(v:unknown)=>typeof v==="string"&&/^[a-zA-Z][a-zA-Z0-9_.-]{0,63}$/.test(v);
const keys=(v:Record<string,unknown>,list:string[])=>Object.keys(v).sort().join()===list.sort().join();
export function validateCompileProfile(value:unknown):CompileProfile{
  const bad=():never=>{throw Error("profile_invalid_definition");};
  if(!value||typeof value!=="object"||Array.isArray(value))bad();
  const p=value as CompileProfile,s=p.schema;
  if(!keys(p as unknown as Record<string,unknown>,["schema","entityTypes"])||!s||typeof s!=="object"||
    !keys(s as unknown as Record<string,unknown>,["namespace","schemaId","version","entityTypes","relationTypes"])||
    !["karda.config","karda.local"].includes(s.namespace)||!code(s.schemaId)||typeof s.version!=="string"||!code(`v${s.version}`)||
    !Array.isArray(s.entityTypes)||s.entityTypes.length<1||s.entityTypes.length>50||!s.entityTypes.every(code)||
    !Array.isArray(s.relationTypes)||s.relationTypes.length<1||s.relationTypes.length>50||
    !Array.isArray(p.entityTypes)||p.entityTypes.length<1||p.entityTypes.length>100)bad();
  for(const r of s.relationTypes)if(!r||!keys(r as unknown as Record<string,unknown>,["id","sourceTypes","targetTypes"])||!code(r.id)||
    !Array.isArray(r.sourceTypes)||!Array.isArray(r.targetTypes)||r.sourceTypes.length>50||r.targetTypes.length>50||![...r.sourceTypes,...r.targetTypes].every(code))bad();
  for(const m of p.entityTypes)if(!m||!keys(m as unknown as Record<string,unknown>,["kind","type"])||!code(m.kind)||!s.entityTypes.includes(m.type))bad();
  if(new Set(p.entityTypes.map(m=>m.kind)).size!==p.entityTypes.length)bad();
  if(new Set(s.entityTypes).size!==s.entityTypes.length||new Set(s.relationTypes.map(r=>r.id)).size!==s.relationTypes.length)bad();
  for(const r of s.relationTypes)if(!r.sourceTypes.length||!r.targetTypes.length||
    new Set(r.sourceTypes).size!==r.sourceTypes.length||new Set(r.targetTypes).size!==r.targetTypes.length||
    ![...r.sourceTypes,...r.targetTypes].every(t=>s.entityTypes.includes(t)))bad();
  return structuredClone(p);
}
export type ProfileCommand={action:"save";id:string;title:string;definition:CompileProfile}|
  {action:"activate";eventId:string;profileId:string|null;expectedRevision:number;note:string};
export function parseProfileCommand(text:string):ProfileCommand{
  const bad=():never=>{throw Error("profile_invalid_request");};
  if(text.length>65536)bad();let v:any;try{v=JSON.parse(text);}catch{return bad();}
  if(!v||typeof v!=="object"||Array.isArray(v))bad();
  if(v.action==="save"){
    if(!keys(v,["action","id","title","definition"])||!PROFILE_UUID.test(v.id)||typeof v.title!=="string"||!v.title.trim()||v.title.length>200)bad();
    v.definition=validateCompileProfile(v.definition);
    if(v.definition.schema.namespace!=="karda.config")bad();
  }else if(v.action==="activate"){
    if(!keys(v,["action","eventId","profileId","expectedRevision","note"])||!PROFILE_UUID.test(v.eventId)||
      (v.profileId!==null&&!PROFILE_UUID.test(v.profileId))||!Number.isSafeInteger(v.expectedRevision)||v.expectedRevision<0||v.expectedRevision>=2147483647||
      typeof v.note!=="string"||!v.note.trim()||v.note.length>10000)bad();
  }else bad();return v;
}
