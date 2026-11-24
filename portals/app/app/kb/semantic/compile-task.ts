import { runSemanticCompile, type SemanticCandidateClient } from "./compiler";
import { semanticValueHash, type PostgresSemanticStore } from "./store-postgres";
import type { SemanticReadIdentity } from "./read-postgres";
import { UnavailableError } from "../processing/unavailable";
import { QuotaError } from "../processing/orchestrator";

export function parseCompileTaskRequest(text:string):{action:"create"|"execute";taskId:string} {
  const invalid=():never=>{throw new Error("semantic_invalid_task_request");};
  if(Buffer.byteLength(text)>1024)invalid();
  let value:Record<string,unknown>;
  try{value=JSON.parse(text);}catch{return invalid();}
  if(!value||typeof value!=="object"||Array.isArray(value)||Object.keys(value).sort().join(",")!=="action,taskId"||
    !["create","execute"].includes(value.action as string)||typeof value.taskId!=="string"||
    !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(value.taskId))return invalid();
  return value as {action:"create"|"execute";taskId:string};
}

/** Request-driven durable worker: reauthenticated on every attempt, no stored RP tokens. */
export async function executeCompileTask(identity:SemanticReadIdentity,kbId:string,taskId:string,deps:{
  store:Pick<PostgresSemanticStore,"claimCompileTask"|"loadCompilerSnapshot"|"recordCompile"|"settleCompileTask">;
  tenantForWorkspace:(workspaceId:string)=>Promise<string|null>;
  candidates:()=>SemanticCandidateClient|null;
}) {
  const actor={...identity,roles:[...identity.roles]},task=await deps.store.claimCompileTask(actor,kbId,taskId);
  if(!task)return {claimed:false,runId:null};
  try{
    const result=await runSemanticCompile(actor,kbId,task.id,{
      loadAuthorizedSnapshot:async()=>{
        const snapshot=await deps.store.loadCompilerSnapshot(actor,kbId,task.snapshot);
        if(semanticValueHash(snapshot)!==task.snapshot_hash)throw new Error("semantic_task_source_changed");
        const tenantId=await deps.tenantForWorkspace(actor.workspaceId);
        if(!tenantId)throw new UnavailableError("workspace_not_provisioned",{cause:"workspace_not_provisioned",arg:null});
        return {snapshot,tenantId};
      },
      candidates:{propose:async(input,context)=>{
        const client=deps.candidates();
        if(!client)throw new UnavailableError("atlas_not_configured",{cause:"atlas_not_configured",arg:null});
        return client.propose(input,context);
      }},
      store:{recordCompile:(who,id,input)=>deps.store.recordCompile(who,id,{...input,task:{id:task.id,leaseId:task.lease_id}})},
    });
    if(!result.runId)await deps.store.settleCompileTask(actor,kbId,task.id,task.lease_id,"needs_review",
      {compilation:result.compilation},null);
    return {claimed:true,runId:result.runId||null};
  }catch(error){
    const unavailable=error instanceof UnavailableError,quota=error instanceof QuotaError;
    const code=unavailable?error.unavailable.cause:quota?"semantic_model_quota":error instanceof Error&&/^semantic_[a-z_]+$/.test(error.message)?error.message:"semantic_compile_failed";
    await deps.store.settleCompileTask(actor,kbId,task.id,task.lease_id,unavailable||quota?"suspended":"failed",{},code);
    return {claimed:true,runId:null};
  }
}
