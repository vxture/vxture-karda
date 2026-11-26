import {pilotWindow} from "./pilot-window";
import {Pool,type PoolClient} from "pg";
import {permits} from "../../authz/policy";
import {readProductAccess,type RoleSql} from "../../authz/store";
import type {ObjectStore} from "../storage/objectstore";
import {PostgresSourceSearch} from "../retrieval/source-search-postgres";
import {PostgresSemanticReader,type SemanticReadIdentity} from "./read-postgres";
import {PostgresFormalSemanticLoader} from "./store-postgres";
import {requireKnowledgeRollout} from "./rollout-postgres";
import {profileHash} from "./profile-authority";
import {PILOT_UUID,parsePilot,type PilotCommand,type PilotRow,type PilotObservation} from "./pilot";
export class PostgresPilots{
  constructor(private pool:Pool,private objects:Pick<ObjectStore,"get">,private admit:(who:SemanticReadIdentity)=>Promise<boolean>){}
  private async scope<T>(who:SemanticReadIdentity,kbId:string,work:(db:PoolClient)=>Promise<T>,ai=false):Promise<T>{
    if(!PILOT_UUID.test(kbId)||!PILOT_UUID.test(who.workspaceId)||!/^usr_[a-f0-9-]{36}$/i.test(who.sub)||who.productCode!=="karda")throw Error("pilot_invalid_scope");
    if(await this.admit(who)!==true)throw Error("pilot_denied");
    const db=await this.pool.connect();try{
      await db.query("BEGIN ISOLATION LEVEL REPEATABLE READ");
      await db.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))",[`karda:roles:${who.workspaceId}`]);
      await db.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))",[`karda:semantic:${kbId}`]);
      await db.query("SELECT id FROM local_authz.member WHERE workspace_id=$1 AND sub=$2 FOR SHARE",[who.workspaceId,who.sub]);
      const sql:RoleSql={$queryRawUnsafe:async<T>(s:string,...v:unknown[])=>(await db.query(s,v)).rows as T,$executeRawUnsafe:async()=>{throw Error("pilot_denied");}};
      const access=await readProductAccess(who,sql);
      if(!permits(access,"product.enter")||!permits(access,"data.read")||!permits(access,"data.write")||(ai&&!permits(access,"ai.use")))throw Error("pilot_denied");
      if(!(await db.query(`SELECT id FROM karda_kb.knowledge_base WHERE id=$1 AND workspace_id=$2 AND owner_type='user' AND owner_sub=$3 AND deleted_at IS NULL FOR SHARE`,[kbId,who.workspaceId,who.sub])).rowCount)throw Error("pilot_denied");
      const result=await work(db);await db.query("COMMIT");return result;
    }catch(error){await db.query("ROLLBACK");throw error;}finally{db.release();}
  }
  private async row(db:PoolClient,who:SemanticReadIdentity,kbId:string,id:string){
    const row=(await db.query<PilotRow>("SELECT * FROM karda_kb.pilot_case WHERE id=$1 AND kb_id=$2 AND created_by=$3 FOR UPDATE",[id,kbId,who.sub])).rows[0];
    if(!row)throw Error("pilot_not_found");return row;
  }
  private async pair(db:PoolClient,who:SemanticReadIdentity,row:PilotRow){
    await requireKnowledgeRollout(db,who.workspaceId);
    if(!(await db.query("SELECT kb_id FROM karda_kb.kb_attachment WHERE kb_id=$1 AND workspace_id=$2 AND user_sub=$3 AND product_code='karda'",[row.kb_id,who.workspaceId,who.sub])).rowCount)throw Error("pilot_scope_changed");
    const baseline=await new PostgresSourceSearch(this.pool,this.objects,this.admit).read(who,{kbIds:[row.kb_id],query:row.query,topK:row.top_k,verificationFilter:"verified_and_untracked"},db);
    const loader=new PostgresFormalSemanticLoader();
    const published=await new PostgresSemanticReader(this.pool,this.objects,this.admit,(tx,ids)=>loader.load(tx,ids)).readPackage(who,[row.kb_id],
      {seedIds:["directory"],maxHops:0,maxNodes:40,maxEdges:20},true,false,db,{query:row.query,topK:row.top_k});
    return {baseline,published,...pilotWindow({workspaceId:who.workspaceId,sub:who.sub,productCode:who.productCode},row.id,row.query,row.top_k,baseline,published)};
  }
  async mutate(who:SemanticReadIdentity,input:PilotCommand){
    const c=parsePilot(input),fingerprint=profileHash(c);
    return this.scope(who,c.kbId,async db=>{
      if(c.action==="create"){
        const prior=(await db.query<{request_hash:string}>("SELECT request_hash FROM karda_kb.pilot_case WHERE id=$1 AND kb_id=$2 AND created_by=$3",[c.id,c.kbId,who.sub])).rows[0];
        if(prior){if(prior.request_hash!==fingerprint)throw Error("pilot_conflict");return {id:c.id,duplicate:true};}
        const count=(await db.query<{count:string}>("SELECT count(*)::text AS count FROM karda_kb.pilot_case WHERE kb_id=$1 AND created_by=$2 AND state<>'closed'",[c.kbId,who.sub])).rows[0];
        if(Number(count.count)>=100)throw Error("pilot_case_budget");
        await db.query("INSERT INTO karda_kb.pilot_case(id,kb_id,created_by,title,query,top_k,note,request_hash) VALUES($1,$2,$3,$4,$5,$6,$7,$8)",[c.id,c.kbId,who.sub,c.title,c.query,c.topK,c.note,fingerprint]);
        return {id:c.id,duplicate:false};
      }
      const row=await this.row(db,who,c.kbId,c.id);
      if(c.action==="compare"){
        const pair=await this.pair(db,who,row);
        const old=(await db.query<{fingerprint:string}>("SELECT fingerprint FROM karda_kb.pilot_observation WHERE id=$1 AND case_id=$2",[c.observationId,c.id])).rows[0];
        if(old&&old.fingerprint!==pair.fingerprint)throw Error("pilot_window_changed");
        if(!old)await db.query("INSERT INTO karda_kb.pilot_observation(id,case_id,fingerprint,summary) VALUES($1,$2,$3,$4)",[c.observationId,c.id,pair.fingerprint,JSON.stringify(pair.summary)]);
        return {format:"karda.pilot-comparison.v1",id:c.id,observationId:c.observationId,checkedAt:new Date().toISOString(),...pair};
      }
      const prior=(await db.query<{fingerprint:string;revision:number}>("SELECT fingerprint,revision FROM karda_kb.pilot_event WHERE case_id=$1 AND event_id=$2",[c.id,c.eventId])).rows[0];
      if(prior){if(prior.fingerprint!==fingerprint)throw Error("pilot_conflict");return {id:c.id,revision:prior.revision,duplicate:true};}
      if(row.revision!==c.expectedRevision||(c.action==="review"&&row.state==="closed")||(c.action==="close"&&row.state!=="reviewed")||(c.action==="reopen"&&row.state==="open"))throw Error("pilot_conflict");
      let observationId:string|null=null,verdict=row.verdict;
      if(c.action!=="reopen"){
        observationId=c.action==="review"?c.observationId:row.reviewed_observation;
        const observation=(await db.query<PilotObservation>("SELECT * FROM karda_kb.pilot_observation WHERE id=$1 AND case_id=$2",[observationId,c.id])).rows[0];
        if(!observation)throw Error("pilot_not_found");
        const pair=await this.pair(db,who,row);
        if(observation.fingerprint!==pair.fingerprint)throw Error("pilot_window_changed");
        if(pair.summary.sourcePartial||pair.summary.publishedPartial)throw Error("pilot_incomplete");
        if(c.action==="review")verdict=c.verdict;
      }else{
        const count=(await db.query<{count:string}>("SELECT count(*)::text AS count FROM karda_kb.pilot_case WHERE kb_id=$1 AND created_by=$2 AND state<>'closed'",[c.kbId,who.sub])).rows[0];
        if(row.state==="closed"&&Number(count.count)>=100)throw Error("pilot_case_budget");
        verdict=null;
      }
      const revision=row.revision+1,state=c.action==="review"?"reviewed":c.action==="close"?"closed":"open";
      await db.query("UPDATE karda_kb.pilot_case SET state=$2,revision=$3,verdict=$4,reviewed_observation=$5,updated_at=now() WHERE id=$1",[c.id,state,revision,verdict,c.action==="reopen"?null:observationId]);
      await db.query("INSERT INTO karda_kb.pilot_event(case_id,revision,event_id,fingerprint,action,observation_id,verdict,note,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)",[c.id,revision,c.eventId,fingerprint,c.action,observationId,verdict,c.note,who.sub]);
      return {id:c.id,revision,duplicate:false};
    },c.action==="compare"||c.action==="review"||c.action==="close");
  }
  async browse(who:SemanticReadIdentity,kbId:string,id?:string,before?:string,historyBefore?:number){
    if((id!==undefined&&!PILOT_UUID.test(id))||(before!==undefined&&!PILOT_UUID.test(before))||(id&&before)||
      (historyBefore!==undefined&&(!id||!Number.isSafeInteger(historyBefore)||historyBefore<1||historyBefore>2147483647)))throw Error("pilot_invalid_request");
    return this.scope(who,kbId,async db=>{
      const rows=(await db.query<PilotRow>(`SELECT id,kb_id,title,query,top_k,note,state,revision,verdict,reviewed_observation,created_at,updated_at FROM karda_kb.pilot_case
        WHERE kb_id=$1 AND created_by=$2 AND ($3::uuid IS NULL OR id=$3) AND ($4::uuid IS NULL OR id<$4) ORDER BY id DESC LIMIT 21`,[kbId,who.sub,id??null,before??null])).rows;
      if(id&&!rows.length)throw Error("pilot_not_found");
      const observations=id?(await db.query("SELECT id,fingerprint,summary,created_at FROM karda_kb.pilot_observation WHERE case_id=$1 ORDER BY created_at DESC,id DESC LIMIT 20",[id])).rows:[];
      const history=id?(await db.query("SELECT revision,action,observation_id,verdict,note,created_at FROM karda_kb.pilot_event WHERE case_id=$1 AND ($2::integer IS NULL OR revision<$2) ORDER BY revision DESC LIMIT 21",[id,historyBefore??null])).rows:[];
      return {format:"karda.pilots.v1",cases:rows.slice(0,20),nextBefore:rows.length>20?rows[19].id:null,observations,history:history.slice(0,20),nextHistoryBefore:history.length>20?history[19].revision:null};
    });
  }
}
