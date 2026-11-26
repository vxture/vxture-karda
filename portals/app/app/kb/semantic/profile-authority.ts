import type {PoolClient} from "pg";
import {createHash} from "node:crypto";
import {localCompileProfile} from "./compile-profile";
import {validateCompileProfile,type CompileProfile} from "./profile-config";
/** Stable across JSONB object order, with array order preserved. */
export function profileHash(value:unknown):string{
  const canonical=(v:any):any=>Array.isArray(v)?v.map(canonical):v&&typeof v==="object"?Object.fromEntries(Object.keys(v).sort().map(k=>[k,canonical(v[k])])):v;
  return createHash("sha256").update(JSON.stringify(canonical(value))).digest("hex");
}
export async function activeCompileProfile(db:PoolClient,kbId:string):Promise<CompileProfile>{
  const active=(await db.query<{profile_id:string|null}>("SELECT profile_id FROM karda_kb.compile_profile_activation WHERE kb_id=$1 ORDER BY revision DESC LIMIT 1",[kbId])).rows[0];
  if(!active?.profile_id)return localCompileProfile();
  const row=(await db.query<{definition:CompileProfile;definition_hash:string}>("SELECT definition,definition_hash FROM karda_kb.compile_profile_version WHERE kb_id=$1 AND id=$2",[kbId,active.profile_id])).rows[0];
  if(!row||profileHash(row.definition)!==row.definition_hash)throw Error("semantic_profile_corrupt");
  return validateCompileProfile(row.definition);
}
