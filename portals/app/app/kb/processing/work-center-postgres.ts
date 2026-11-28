import {createHash} from "node:crypto";
import {Pool} from "pg";
import {permits} from "../../authz/policy";
import {readProductAccess,type RoleSql} from "../../authz/store";
import type {SemanticReadIdentity} from "../semantic/read-postgres";
import {parseWorkQuery,WORK_UUID,WORK_KINDS,workHref,type WorkItem,type WorkQuery,type WorkCenter} from "./work-center";

interface Row extends Omit<WorkItem,"href"|"createdAt"|"updatedAt"> {createdAt:Date;updatedAt:Date}
interface Cursor {scope:string;kind:string;id:string;at:string}
const digest=(value:unknown)=>createHash("sha256").update(JSON.stringify(value)).digest("hex");
/** No model execution or mutation; one current authority snapshot per page. */
export class PostgresWorkCenter{
  constructor(private pool:Pool,private admit:(identity:SemanticReadIdentity)=>Promise<boolean>){}
  async read(identity:SemanticReadIdentity,input:WorkQuery):Promise<WorkCenter>{
    const query=parseWorkQuery(new URLSearchParams(Object.entries(input)));
    if(!WORK_UUID.test(identity.workspaceId)||identity.productCode!=="karda"||!/^usr_[a-f0-9-]{36}$/i.test(identity.sub))throw Error("work_invalid_scope");
    if(await this.admit(identity)!==true)throw Error("work_denied");
    const scope=digest([identity.workspaceId,identity.sub,identity.productCode,query.kbId??null,query.kind??null,query.state??null]);
    let cursor:Cursor|null=null;
    if(query.before){
      try{cursor=JSON.parse(Buffer.from(query.before,"base64url").toString("utf8"));}catch{throw Error("work_invalid_request");}
      if(!cursor||Object.keys(cursor).sort().join()!=="at,id,kind,scope"||cursor.scope!==scope||!WORK_UUID.test(cursor.id)||
        !(WORK_KINDS as readonly string[]).includes(cursor.kind)||typeof cursor.at!=="string"||!Number.isFinite(Date.parse(cursor.at)))throw Error("work_cursor_changed");
    }
    const db=await this.pool.connect();
    try{
      await db.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
      const sql:RoleSql={$queryRawUnsafe:async<T>(s:string,...v:unknown[])=>(await db.query(s,v)).rows as T,$executeRawUnsafe:async()=>{throw Error("work_denied");}};
      const access=await readProductAccess(identity,sql);
      if(!permits(access,"product.enter")||!permits(access,"data.read")||!permits(access,"data.write"))throw Error("work_denied");
      const publish=permits(access,"service.publish"),ai=permits(access,"ai.use");
      const libraries=(await db.query<{id:string;name:string}>(`SELECT id,name FROM karda_kb.knowledge_base
        WHERE workspace_id=$1 AND owner_type='user' AND owner_sub=$2 AND deleted_at IS NULL ORDER BY name,id LIMIT 501`,[identity.workspaceId,identity.sub])).rows;
      if(libraries.length>500)throw Error("work_library_budget");
      if(query.kbId&&!libraries.some(k=>k.id===query.kbId))throw Error("work_denied");
      const values=[identity.workspaceId,identity.sub,publish,ai,query.kbId??null,query.kind??null,query.state??null];
      const cte=`WITH libraries AS (SELECT id,name FROM karda_kb.knowledge_base WHERE workspace_id=$1 AND owner_type='user'
        AND owner_sub=$2 AND deleted_at IS NULL AND ($5::uuid IS NULL OR id=$5)),
      maintenance AS (SELECT DISTINCT ON(e.task_id) e.*,k.name FROM karda_kb.maintenance_task_event e JOIN libraries k ON k.id=e.kb_id
        WHERE e.workspace_id=$1 ORDER BY e.task_id,e.revision DESC),
      raw_jobs AS (
        SELECT p.id,'processing'::text AS kind,p.kb_id AS "kbId",k.name AS "libraryName",d.title,
          CASE p.state WHEN 'queued' THEN 'queued' WHEN 'running' THEN 'running' WHEN 'done' THEN 'completed' ELSE 'attention' END AS state,
          p.state AS "rawState",p.current_stage AS stage,p.attempt,p.document_id AS "documentId",p.created_at AS "createdAt",p.updated_at AS "updatedAt"
        FROM karda_kb.processing_task p JOIN libraries k ON k.id=p.kb_id JOIN karda_kb.document d ON d.id=p.document_id AND d.kb_id=k.id
        WHERE d.content_state NOT IN ('deleted','archived')
        UNION ALL
        SELECT t.id,'compilation',t.kb_id,k.name,'',CASE WHEN t.state='running' AND t.lease_until<=now() THEN 'attention'
          WHEN t.state IN ('queued','running') THEN t.state WHEN t.state='completed' THEN 'completed' ELSE 'attention' END,
          CASE WHEN t.state='running' AND t.lease_until<=now() THEN 'lease_expired' ELSE t.state END,NULL,t.attempt,NULL,t.created_at,t.updated_at
        FROM karda_kb.semantic_compile_task t JOIN libraries k ON k.id=t.kb_id WHERE $3::boolean AND t.created_by=$2
        UNION ALL
        SELECT o.id,'ocr',o.kb_id,k.name,d.title,CASE o.state WHEN 'running' THEN 'running' WHEN 'committed' THEN 'completed'
          WHEN 'rejected' THEN 'closed' ELSE 'attention' END,o.state,NULL,NULL,o.document_id,o.created_at,o.created_at
        FROM karda_kb.document_ocr_draft o JOIN libraries k ON k.id=o.kb_id JOIN karda_kb.document d ON d.id=o.document_id AND d.kb_id=k.id
        WHERE $4::boolean AND o.created_by=$2 AND d.content_state NOT IN ('deleted','archived')
        UNION ALL
        SELECT task_id,'maintenance',kb_id,name,payload->>'title',CASE payload->>'state' WHEN 'open' THEN 'queued' WHEN 'in_progress' THEN 'running'
          WHEN 'blocked' THEN 'attention' WHEN 'resolved' THEN 'completed' ELSE 'closed' END,payload->>'state',NULL,NULL,NULL,created_at,created_at FROM maintenance
        UNION ALL
        SELECT v.id,'visual',v.kb_id,k.name,d.title,CASE v.state WHEN 'planned' THEN 'queued' WHEN 'active' THEN 'running' WHEN 'completed' THEN 'completed' WHEN 'cancelled' THEN 'closed' ELSE 'attention' END,v.state,NULL,NULL,v.document_id,v.created_at,v.updated_at
        FROM karda_kb.visual_run v JOIN libraries k ON k.id=v.kb_id JOIN karda_kb.document d ON d.id=v.document_id WHERE d.content_state NOT IN ('deleted','archived')
      ) , jobs AS (SELECT id,kind,"kbId","libraryName",title,state,"rawState",stage,attempt,"documentId",
        date_trunc('milliseconds',"createdAt") AS "createdAt",date_trunc('milliseconds',"updatedAt") AS "updatedAt" FROM raw_jobs),
      filtered AS (SELECT * FROM jobs WHERE ($6::text IS NULL OR kind=$6) AND ($7::text IS NULL OR state=$7))`;
      // Counts cover the current library/kind selection; state is a drill-down.
      const counts=(await db.query<WorkCenter["counts"][number]>(cte+` SELECT kind,state,count(*)::integer AS count FROM jobs
        WHERE ($6::text IS NULL OR kind=$6) GROUP BY kind,state ORDER BY kind,state`,values)).rows;
      if(cursor){
        const anchor=(await db.query(cte+` SELECT id FROM filtered WHERE id=$8 AND kind=$9 AND "createdAt"=$10::timestamptz`,[...values,cursor.id,cursor.kind,cursor.at])).rowCount;
        if(anchor!==1)throw Error("work_cursor_changed");
      }
      const rows=(await db.query<Row>(cte+` SELECT * FROM filtered WHERE ($8::timestamptz IS NULL OR ("createdAt",kind,id)<($8::timestamptz,$9::text,$10::uuid))
        ORDER BY "createdAt" DESC,kind DESC,id DESC LIMIT 31`,[...values,cursor?.at??null,cursor?.kind??null,cursor?.id??null])).rows;
      const items=rows.slice(0,30).map(row=>({...row,title:row.title??"",createdAt:row.createdAt.toISOString(),updatedAt:row.updatedAt.toISOString(),href:workHref(row)}));
      const last=items.at(-1),nextBefore=rows.length>30&&last?Buffer.from(JSON.stringify({scope,kind:last.kind,id:last.id,at:last.createdAt})).toString("base64url"):null;
      await db.query("COMMIT");return {format:"karda.work-center.v1",checkedAt:new Date().toISOString(),items,nextBefore,libraries,counts};
    }catch(error){await db.query("ROLLBACK");throw error;}finally{db.release();}
  }
}
