import {Pool} from "pg";
import type {SemanticReadIdentity} from "../semantic/read-postgres";
import {getObjectStore,type ObjectStore,type StoredObject} from "../storage/objectstore";
import {PostgresSources} from "./source-store";
import {parseSource,type SourceCommand} from "./source-contract";
import {sourceBytes} from "./source-content";
export function sourceFailure(error:unknown){
 const raw=error instanceof Error?error.message:"",code=/^source_[a-z_]+$/.test(raw)?raw:/^capacity_(exceeded|unavailable|unconfigured)$/.test(raw)?"source_"+raw:
  (error as {code?:string})?.code==='23505'?"source_origin_conflict":"source_unavailable";
 return {code,status:/denied|capacity_exceeded/.test(code)?403:/not_found/.test(code)?404:/conflict|changed|inactive|busy|attempt_limit|not_ready|external_contract|pending_limit/.test(code)?409:/invalid|budget/.test(code)?400:503};
}
export async function executeSource(store:PostgresSources,objects:ObjectStore,who:SemanticReadIdentity,kbId:string,c:Extract<SourceCommand,{action:"execute"}>):Promise<{itemId:string;state?:string;outcome?:string;documentId?:string|null;errorCode?:string|null;duplicate?:boolean}>{
 const claim=await store.claim(who,kbId,c);if(!claim)return {itemId:c.itemId,duplicate:true};
 let stored:StoredObject|null=null;
 try{const bytes=sourceBytes(claim.item);if(bytes)stored=await objects.put(who.workspaceId,kbId,bytes);}
 catch(error){return store.settle(who,kbId,c,claim.lease,null,sourceFailure(error).code);}
 try{return await store.settle(who,kbId,c,claim.lease,stored,null);}
 catch(error){const failure=sourceFailure(error);if(/lease_changed|binding_inactive|denied/.test(failure.code))throw error;
  return store.settle(who,kbId,c,claim.lease,null,failure.code);
 }
}
export async function sourceService(who:SemanticReadIdentity,kbId:string,input:unknown,admit:()=>Promise<boolean>,query?:Parameters<PostgresSources["browse"]>[2]){
 const c=query?null:parseSource(input);if(!process.env.DATABASE_URL)throw Error("source_unavailable");
 const pool=new Pool({connectionString:process.env.DATABASE_URL,max:1,connectionTimeoutMillis:5000,statement_timeout:30000,allowExitOnIdle:true});
 try{const store=new PostgresSources(pool,admit);if(query)return await store.browse(who,kbId,query);if(!c)throw Error("source_invalid_request");
  return c.action==='execute'?await executeSource(store,getObjectStore(),who,kbId,c):await store.command(who,kbId,c);
 }finally{await pool.end();}
}
