import {Pool} from "pg";
import {getObjectStore} from "../storage/objectstore";
import type {SemanticReadIdentity} from "../semantic/read-postgres";
import {AtlasEmbedClient} from "../atlas/embed";
import {getAtlasCore} from "../atlas/wiring";
import {tenantForWorkspace} from "./atlas-embedder";
import {chunkGeneral} from "./chunk";
import {parseRebuild} from "./rebuild-contract";
import {PostgresRebuild,candidateIndex} from "./rebuild-store";
import type {EmbeddingClient} from "./orchestrator";

export async function executeRebuild(store:PostgresRebuild,who:SemanticReadIdentity,id:string,documentId:string,embedder:EmbeddingClient){
  const claim=await store.claim(who,id,documentId);
  if(!claim)return {id,documentId,duplicate:true};
  let candidate;
  try{
    const chunks=chunkGeneral(claim.ir,claim.params);
    if(!chunks.length||chunks.length>1000)throw Error("rebuild_index_budget");
    const embedded=await embedder.embed(chunks.map(c=>c.text),claim.model);
    if(claim.model!==null&&embedded.modelCode!==claim.model)throw Error("rebuild_embedding_invalid");
    candidate=candidateIndex(chunks,embedded);
  }catch(error){
    const code=error instanceof Error&&/^rebuild_(embedding_invalid|index_budget|payload_budget)$/.test(error.message)?error.message:"rebuild_embedding_failed";
    await store.settle(who,id,documentId,claim.lease,null,code);
    return {id,documentId,state:"failed",error:code};
  }
  try{await store.settle(who,id,documentId,claim.lease,candidate,null);}
  catch(error){
    if(error instanceof Error&&error.message==="rebuild_payload_budget")await store.settle(who,id,documentId,claim.lease,null,error.message);
    throw error;
  }
  return {id,documentId,state:"ready"};
}
export async function rebuildService(who:SemanticReadIdentity,input:unknown,admit:()=>Promise<boolean>,browse?:{kbId:string;id?:string;before?:string}){
  const command=browse?null:parseRebuild(input);
  if(!process.env.DATABASE_URL)throw Error("rebuild_unavailable");
  const pool=new Pool({connectionString:process.env.DATABASE_URL,max:1,connectionTimeoutMillis:5000,statement_timeout:30000,allowExitOnIdle:true});
  const store=new PostgresRebuild(pool,getObjectStore(),admit);
  try{
    if(browse)return await store.browse(who,browse.kbId,browse.id,browse.before);
    if(!command)throw Error("rebuild_invalid_request");
    if(command.action==="create")return await store.create(who,command);
    if(command.action!=="execute")return await store.transition(who,command);
    const embedder:EmbeddingClient={embed:async(texts,pin)=>{
      const core=getAtlasCore(),tenant=await tenantForWorkspace(who.workspaceId);
      if(!core||!tenant)throw Error("rebuild_embedding_failed");
      return new AtlasEmbedClient(core,{context:async()=>({org:tenant,ws:who.workspaceId}),taskId:`karda:rebuild:${command.id}:${command.documentId}`}).embed(texts,pin);
    }};
    return await executeRebuild(store,who,command.id,command.documentId,embedder);
  }finally{await pool.end();}
}
export function rebuildFailure(error:unknown){
  const raw=error instanceof Error?error.message:"";
  const code=/^rebuild_[a-z_]+$/.test(raw)?raw:"rebuild_unavailable";
  return {code,status:/denied/.test(code)?403:/not_found/.test(code)?404:/changed|conflict|not_ready|attempt_limit/.test(code)?409:/invalid_request|invalid_scope|budget/.test(code)?400:503};
}
