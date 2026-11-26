import {Pool,type PoolClient} from "pg";
import {permits} from "../../authz/policy";
import {readProductAccess,type RoleSql} from "../../authz/store";
import type {SemanticReadIdentity} from "./read-postgres";
import {parseRolloutCommand,rolloutState,type RolloutCommand,type RolloutEvent} from "./rollout-control";

/** Called inside the same authorized read transaction. Absence preserves the live baseline. */
export async function requireKnowledgeRollout(db:PoolClient,workspaceId:string){
  const rows=(await db.query<{enabled:boolean}>("SELECT enabled FROM karda_kb.knowledge_rollout_event WHERE workspace_id=$1 ORDER BY revision DESC LIMIT 1",[workspaceId])).rows;
  if(rows[0]?.enabled===false)throw Error("knowledge_rollout_paused");
}
async function history(db:PoolClient,workspace:string):Promise<RolloutEvent[]>{
  const rows=(await db.query<{revision:number;event_id:string;enabled:boolean;reason:string;changed_by:string;created_at:Date}>(
    "SELECT revision,event_id,enabled,reason,changed_by,created_at FROM karda_kb.knowledge_rollout_event WHERE workspace_id=$1 ORDER BY revision DESC LIMIT 20",[workspace])).rows;
  return rows.map(r=>({revision:r.revision,eventId:r.event_id,enabled:r.enabled,reason:r.reason,changedBy:r.changed_by,createdAt:r.created_at.toISOString()}));
}
export class PostgresKnowledgeRollout {
  constructor(private pool:Pool,private admit:(identity:SemanticReadIdentity)=>Promise<boolean>){}
  async handle(identity:SemanticReadIdentity,command?:RolloutCommand){
    identity={...identity,roles:[...identity.roles]};if(command)command=parseRolloutCommand(command);
    if(!/^[a-f0-9-]{36}$/.test(identity.workspaceId)||await this.admit(identity)!==true)throw Error("knowledge_rollout_denied");
    const db=await this.pool.connect();
    try{
      await db.query("BEGIN");
      if(command)await db.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))",[`karda:knowledge-rollout:${identity.workspaceId}`]);
      const sql:RoleSql={$queryRawUnsafe:async<T>(s:string,...v:unknown[])=>(await db.query(s,v)).rows as T,$executeRawUnsafe:async()=>{throw Error("knowledge_rollout_denied");}};
      const access=await readProductAccess(identity,sql);
      if(!permits(access,"product.enter")||!permits(access,"product.manage"))throw Error("knowledge_rollout_denied");
      let duplicate=false;
      if(command){
        const prior=(await db.query<{revision:number;enabled:boolean;reason:string;changed_by:string}>(
          "SELECT revision,enabled,reason,changed_by FROM karda_kb.knowledge_rollout_event WHERE workspace_id=$1 AND event_id=$2",[identity.workspaceId,command.eventId])).rows[0];
        if(prior){
          if(prior.revision!==command.expectedRevision+1||prior.enabled!==command.enabled||prior.reason!==command.reason||prior.changed_by!==identity.sub)throw Error("knowledge_rollout_conflict");
          duplicate=true;
        }else{
          const current=rolloutState(await history(db,identity.workspaceId));
          if(current.revision!==command.expectedRevision)throw Error("knowledge_rollout_conflict");
          await db.query("INSERT INTO karda_kb.knowledge_rollout_event(workspace_id,revision,event_id,enabled,reason,changed_by) VALUES($1,$2,$3,$4,$5,$6)",
            [identity.workspaceId,current.revision+1,command.eventId,command.enabled,command.reason,identity.sub]);
        }
      }
      const state=rolloutState(await history(db,identity.workspaceId));await db.query("COMMIT");return {...state,duplicate};
    }catch(error){await db.query("ROLLBACK");throw error;}finally{db.release();}
  }
}
export async function knowledgeRollout(identity:SemanticReadIdentity,admit:()=>Promise<boolean>,command?:RolloutCommand){
  if(!process.env.DATABASE_URL)throw Error("knowledge_rollout_unavailable");
  const pool=new Pool({connectionString:process.env.DATABASE_URL,max:1,connectionTimeoutMillis:5000,statement_timeout:15000,allowExitOnIdle:true});
  try{return await new PostgresKnowledgeRollout(pool,admit).handle(identity,command);}finally{await pool.end();}
}
