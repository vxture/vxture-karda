import {topicDossiers} from "./topic-dossier-store";
import type {SemanticReadIdentity} from "./read-postgres";
import {generateTopicSummary} from "./topic-summary";
import {tenantForWorkspace} from "../processing/atlas-embedder";
import {getGenerationClient} from "../retrieval/generation";

/** No database transaction is held across model execution; save rechecks authority. */
export async function executeTopicSummary(identity:SemanticReadIdentity,kbId:string,id:string,dossierId:string,admit:()=>Promise<boolean>,deps={
  handle:topicDossiers,tenant:tenantForWorkspace,client:getGenerationClient,
}){
  const prepared=await deps.handle(identity,kbId,{action:"summary_prepare",id,dossierId},admit);
  if(!prepared.modelInput)return prepared;
  const tenantId=await deps.tenant(identity.workspaceId),client=deps.client();
  if(!tenantId||!client)throw new Error("semantic_summary_unavailable");
  const generated=await generateTopicSummary(prepared.modelInput,{tenantId,workspaceId:identity.workspaceId,taskId:`karda:topic:${id}`},client);
  return deps.handle(identity,kbId,{action:"summary_save",id,dossierId,...generated},admit);
}
