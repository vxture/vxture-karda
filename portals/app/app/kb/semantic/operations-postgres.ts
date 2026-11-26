import {Pool,type PoolClient} from "pg";
import {permits} from "../../authz/policy";
import {readProductAccess,type RoleSql} from "../../authz/store";
import type {SemanticReadIdentity} from "./read-postgres";
import {semanticValueHash} from "./store-postgres";
import {OPERATION_UUID,parseOperationCommand,parseOperationsQuery,operationTransition,type OperationCommand,type OperationRow,type OperationsQuery,type OperationsResult} from "./operations";

interface Event {task_id:string;kb_id:string;revision:number;payload:OperationRow;fingerprint:string;event_id:string;created_at:Date}
export class PostgresOperations{
  constructor(private pool:Pool,private admit:(identity:SemanticReadIdentity)=>Promise<boolean>){}
  private async scope<T>(identity:SemanticReadIdentity,work:(db:PoolClient)=>Promise<T>):Promise<T>{
    if(!OPERATION_UUID.test(identity.workspaceId)||identity.productCode!=="karda"||!/^usr_[a-f0-9-]{36}$/i.test(identity.sub))throw Error("operations_invalid_scope");
    if(await this.admit(identity)!==true)throw Error("operations_denied");
    const db=await this.pool.connect();try{
      await db.query("BEGIN");
      await db.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))",[`karda:roles:${identity.workspaceId}`]);
      await db.query("SELECT id FROM local_authz.member WHERE workspace_id=$1 AND sub=$2 FOR SHARE",[identity.workspaceId,identity.sub]);
      const sql:RoleSql={$queryRawUnsafe:async<T>(s:string,...v:unknown[])=>(await db.query(s,v)).rows as T,$executeRawUnsafe:async()=>{throw Error("operations_denied");}};
      const access=await readProductAccess(identity,sql);
      if(!permits(access,"product.enter")||!permits(access,"data.read")||!permits(access,"data.write"))throw Error("operations_denied");
      const result=await work(db);await db.query("COMMIT");return result;
    }catch(error){await db.query("ROLLBACK");throw error;}finally{db.release();}
  }
  private async library(db:PoolClient,identity:SemanticReadIdentity,kbId:string){
    const kb=(await db.query<{name:string}>(`SELECT name FROM karda_kb.knowledge_base WHERE id=$1 AND workspace_id=$2
      AND owner_type='user' AND owner_sub=$3 AND deleted_at IS NULL FOR SHARE`,[kbId,identity.workspaceId,identity.sub])).rows[0];
    if(!kb)throw Error("operations_denied");return kb;
  }
  async browse(identity:SemanticReadIdentity,request:OperationsQuery):Promise<OperationsResult>{
    const query=parseOperationsQuery(new URLSearchParams(Object.entries(request).map(([k,v])=>[k,String(v)])));
    return this.scope(identity,async db=>{
      const accessible=`SELECT e.*,k.name FROM karda_kb.maintenance_task_event e JOIN karda_kb.knowledge_base k ON k.id=e.kb_id
        WHERE e.workspace_id=$1 AND k.workspace_id=$1 AND k.owner_type='user' AND k.owner_sub=$2 AND k.deleted_at IS NULL`;
      const project=(row:Event&{name:string}):OperationRow=>({...row.payload,libraryName:row.name,createdAt:row.created_at.toISOString()});
      const result:OperationsResult={format:"karda.operations.v1",tasks:[],history:[],nextBefore:null,nextHistoryBefore:null,checkedAt:new Date().toISOString()};
      if(query.taskId){
        const latest=(await db.query<Event&{name:string}>(accessible+" AND e.task_id=$3 ORDER BY e.revision DESC LIMIT 1",[identity.workspaceId,identity.sub,query.taskId])).rows[0];
        if(!latest)throw Error("operations_not_found");
        const rows=(await db.query<Event&{name:string}>(accessible+" AND e.task_id=$3 AND ($4::integer IS NULL OR revision<$4) ORDER BY e.revision DESC LIMIT 21",[identity.workspaceId,identity.sub,query.taskId,query.historyBefore??null])).rows;
        result.history=rows.slice(0,20).map(project);result.tasks=[project(latest)];result.nextHistoryBefore=rows.length>20?rows[19].revision:null;return result;
      }
      if(query.kbId)await this.library(db,identity,query.kbId);
      const rows=(await db.query<Event&{name:string}>(`WITH latest AS (SELECT DISTINCT ON(task_id) * FROM (${accessible}) permitted ORDER BY task_id,revision DESC)
        SELECT * FROM latest WHERE ($3::uuid IS NULL OR kb_id=$3) AND ($4::text IS NULL OR payload->>'state'=$4)
        AND ($5::text IS NULL OR payload->>'priority'=$5) AND ($6::uuid IS NULL OR task_id<$6)
        AND (NOT $7::boolean OR (payload->>'dueDate'<(now() AT TIME ZONE 'Asia/Shanghai')::date::text AND payload->>'state' NOT IN ('resolved','dismissed')))
        ORDER BY task_id DESC LIMIT 51`,[identity.workspaceId,identity.sub,query.kbId??null,query.state??null,query.priority??null,query.before??null,query.overdue??false])).rows;
      result.tasks=rows.slice(0,50).map(row=>({...project(row),note:""}));result.nextBefore=rows.length>50?rows[49].task_id:null;return result;
    });
  }
  async mutate(identity:SemanticReadIdentity,input:OperationCommand){
    const command=parseOperationCommand(JSON.stringify(input)),fingerprint=semanticValueHash(command);
    return this.scope(identity,async db=>{
      await db.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))",[`karda:operation:${command.taskId}`]);
      const latest=(await db.query<Event>("SELECT * FROM karda_kb.maintenance_task_event WHERE task_id=$1 ORDER BY revision DESC LIMIT 1",[command.taskId])).rows[0];
      const kbId=command.action==="create"?command.kbId:latest?.kb_id;
      if(!kbId)throw Error("operations_not_found");const library=await this.library(db,identity,kbId);
      const replay=(await db.query<Event>("SELECT * FROM karda_kb.maintenance_task_event WHERE workspace_id=$1 AND event_id=$2",[identity.workspaceId,command.eventId])).rows[0];
      if(replay){if(replay.fingerprint!==fingerprint)throw Error("operations_conflict");return {taskId:replay.task_id,revision:replay.revision,duplicate:true};}
      if(command.action==="create"){
        if(latest)throw Error("operations_conflict");
        if(command.targetType==="document"&&(await db.query(`SELECT id FROM karda_kb.document WHERE id=$1 AND kb_id=$2
          UNION ALL SELECT s.document_id FROM karda_kb.semantic_release_source s JOIN karda_kb.semantic_release_head h
          ON h.kb_id=s.kb_id AND h.release_id=s.release_id WHERE s.document_id=$1 AND s.kb_id=$2 LIMIT 1`,[command.targetId,kbId])).rowCount!==1)throw Error("operations_target_changed");
        if(command.targetType==="relation"&&(await db.query(`SELECT r.relation_id FROM karda_kb.semantic_relation r JOIN karda_kb.semantic_release_head h
          ON h.kb_id=r.kb_id AND h.release_id=r.release_id WHERE r.kb_id=$1 AND r.relation_id=$2 FOR SHARE OF h`,[kbId,command.targetId])).rowCount!==1)throw Error("operations_target_changed");
      }else if(!latest||latest.revision!==command.expectedRevision||!operationTransition(latest.payload.state,command.state))throw Error("operations_conflict");
      const revision=(latest?.revision??0)+1;
      const payload:OperationRow={taskId:command.taskId,kbId,libraryName:library.name,targetType:command.action==="create"?command.targetType:latest!.payload.targetType,
        targetId:command.action==="create"?command.targetId:latest!.payload.targetId,title:command.title,state:command.state,priority:command.priority,dueDate:command.dueDate,
        revision,note:command.note,actor:identity.sub,createdAt:new Date().toISOString()};
      await db.query(`INSERT INTO karda_kb.maintenance_task_event(task_id,revision,kb_id,workspace_id,event_id,fingerprint,payload,created_by)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8)`,[command.taskId,revision,kbId,identity.workspaceId,command.eventId,fingerprint,JSON.stringify(payload),identity.sub]);
      return {taskId:command.taskId,revision,duplicate:false};
    });
  }
}
