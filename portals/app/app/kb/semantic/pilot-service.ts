import {Pool} from "pg";
import {getObjectStore} from "../storage/objectstore";
import type {SemanticReadIdentity} from "./read-postgres";
import {PostgresPilots} from "./pilot-postgres";
import {parsePilot} from "./pilot";
import {recordDeliveredUsage} from "../../usage/lib/buffer";
export async function pilotService(who:SemanticReadIdentity,input:unknown,admit:()=>Promise<boolean>,browse?:{kbId:string;id?:string;before?:string;historyBefore?:number}){
  const command=browse?null:parsePilot(input);
  if(!process.env.DATABASE_URL)throw Error("pilot_unavailable");
  const pool=new Pool({connectionString:process.env.DATABASE_URL,max:1,connectionTimeoutMillis:5000,statement_timeout:30000,allowExitOnIdle:true});
  try{
    const store=new PostgresPilots(pool,getObjectStore(),admit);
    if(browse)return await store.browse(who,browse.kbId,browse.id,browse.before,browse.historyBefore);
    if(!command)throw Error("pilot_invalid_request");
    const result=await store.mutate(who,command);
    if(command.action==="compare")await recordDeliveredUsage({workspaceId:who.workspaceId,metric:"karda.search",amount:2,idempotencyKey:`karda.pilot-search:${command.observationId}`});
    return result;
  }finally{await pool.end();}
}
export function pilotFailure(error:unknown){
  const raw=error instanceof Error?error.message:"",code=/^pilot_[a-z_]+$/.test(raw)?raw:/denied/.test(raw)?"pilot_denied":raw==="knowledge_rollout_paused"?"pilot_paused":/budget|snapshot_limit/.test(raw)?"pilot_payload_budget":"pilot_unavailable";
  return {code,status:/denied/.test(code)?403:/not_found/.test(code)?404:/changed|conflict|incomplete/.test(code)?409:/invalid|budget/.test(code)?400:503};
}
