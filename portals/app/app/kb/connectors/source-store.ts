import {randomUUID} from "node:crypto";
import {Pool,type PoolClient} from "pg";
import {permits} from "../../authz/policy";
import {readProductAccess,type RoleSql} from "../../authz/store";
import type {SemanticReadIdentity} from "../semantic/read-postgres";
import {profileHash} from "../semantic/profile-authority";
import {platformLimit,validateCapacityLimit,type CapacityLimitSource} from "../lib/capacity";
import type {StoredObject} from "../storage/objectstore";
import {SOURCE_UUID,parseSource,type SourceCommand,type SourceItem} from "./source-contract";
import {sourceBytes,sourceVersionDecision} from "./source-content";
interface Binding {id:string;kb_id:string;connector_code:string;external_source_id:string;mode:string;state:string;cursor:string|null}
interface Item {id:string;run_id:string;source_doc_id:string;source_version:number;payload:SourceItem;payload_hash:string;state:string;attempt:number;lease_id:string|null;lease_until:Date|null}
interface KB {id:string;name:string;owner_sub:string;processing_template_id:string|null;embedding_model:string|null}
export class PostgresSources{
 constructor(private pool:Pool,private admit:(who:SemanticReadIdentity)=>Promise<boolean>,private limits:CapacityLimitSource=platformLimit,private trackedStorage=true){}
 private async scope<T>(who:SemanticReadIdentity,kbId:string,work:(db:PoolClient,kb:KB)=>Promise<T>,ai=false){
  if(!SOURCE_UUID.test(kbId)||!SOURCE_UUID.test(who.workspaceId)||!/^usr_[a-f0-9-]{36}$/i.test(who.sub)||who.productCode!=="karda")throw Error("source_invalid_scope");
  if(await this.admit(who)!==true)throw Error("source_denied");const db=await this.pool.connect();try{
   await db.query("BEGIN");await db.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))",["karda:roles:"+who.workspaceId]);await db.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))",["karda:semantic:"+kbId]);
   await db.query("SELECT id FROM local_authz.member WHERE workspace_id=$1 AND sub=$2 FOR SHARE",[who.workspaceId,who.sub]);
   const sql:RoleSql={$queryRawUnsafe:async<T>(s:string,...v:unknown[])=>(await db.query(s,v)).rows as T,$executeRawUnsafe:async()=>{throw Error("source_denied");}};
   const access=await readProductAccess(who,sql);if(!permits(access,"product.enter")||!permits(access,"data.read")||!permits(access,"data.write")||(ai&&!permits(access,"ai.use")))throw Error("source_denied");
   const kb=(await db.query<KB>("SELECT id,name,owner_sub,processing_template_id,embedding_model FROM karda_kb.knowledge_base WHERE id=$1 AND workspace_id=$2 AND owner_type='user' AND deleted_at IS NULL FOR SHARE",[kbId,who.workspaceId])).rows[0];
   if(!kb||(kb.owner_sub!==who.sub&&!access.roles.some(r=>r==="owner"||r==="administrator")))throw Error("source_denied");
   const result=await work(db,kb);await db.query("COMMIT");return result;
  }catch(error){await db.query("ROLLBACK");throw error;}finally{db.release();}
 }
 private async binding(db:PoolClient,kbId:string,id:string){const row=(await db.query<Binding>("SELECT * FROM karda_kb.binding WHERE id=$1 AND kb_id=$2 FOR UPDATE",[id,kbId])).rows[0];if(!row)throw Error("source_not_found");return row;}
 private async revision(db:PoolClient,id:string){return Number((await db.query("SELECT COALESCE(max(revision),0) AS n FROM karda_kb.source_control_event WHERE binding_id=$1",[id])).rows[0].n);}
 private async event(db:PoolClient,bindingId:string,eventId:string,c:unknown,who:SemanticReadIdentity,action:string,note:string,result:unknown){
  const revision=await this.revision(db,bindingId)+1;if(revision>=2147483647)throw Error("source_limit");
  await db.query("INSERT INTO karda_kb.source_control_event(binding_id,revision,event_id,fingerprint,action,note,result,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8)",[bindingId,revision,eventId,profileHash(c),action,note,JSON.stringify(result),who.sub]);return revision;
 }
 private async replay(db:PoolClient,id:string,eventId:string,c:unknown){const old=(await db.query("SELECT fingerprint,result,revision FROM karda_kb.source_control_event WHERE binding_id=$1 AND event_id=$2",[id,eventId])).rows[0];if(old&&old.fingerprint!==profileHash(c))throw Error("source_conflict");return old;}
 private async quota(db:PoolClient,ws:string,metric:"binding.max"|"document.max",limit:number){
  await db.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))",["karda:capacity:"+metric+":"+ws]);
  const q=metric==="binding.max"?"SELECT count(*) AS n FROM karda_kb.binding b JOIN karda_kb.knowledge_base k ON k.id=b.kb_id WHERE k.workspace_id=$1 AND k.deleted_at IS NULL AND b.state<>'revoked'":
   "SELECT (SELECT count(*) FROM karda_kb.document d JOIN karda_kb.knowledge_base k ON k.id=d.kb_id WHERE k.workspace_id=$1 AND k.deleted_at IS NULL AND d.content_state<>'deleted')+(SELECT count(*) FROM karda_kb.entry e JOIN karda_kb.knowledge_base k ON k.id=e.kb_id WHERE k.workspace_id=$1 AND k.deleted_at IS NULL AND e.content_state<>'deleted') AS n";
  if(limit!==-1&&Number((await db.query(q,[ws])).rows[0].n)>=limit)throw Error("source_capacity_exceeded");
 }
 async command(who:SemanticReadIdentity,kbId:string,input:SourceCommand){
  const c=parseSource(input),limit=c.action==="create"?validateCapacityLimit(await this.limits(who.workspaceId,"binding.max")):-1;
  return this.scope(who,kbId,async(db)=>{
   if(c.action==="create"){
    const existing=(await db.query("SELECT * FROM karda_kb.binding WHERE id=$1 AND kb_id=$2",[c.id,kbId])).rows[0];
    if(existing){const replay=await this.replay(db,c.id,c.id,c);if(!replay)throw Error("source_conflict");return {id:c.id,duplicate:true};}
    await this.quota(db,who.workspaceId,"binding.max",limit);
    await db.query("INSERT INTO karda_kb.binding(id,kb_id,connector_code,external_source_id,created_by) VALUES($1,$2,$3,$4,$5)",[c.id,kbId,c.connectorCode,c.externalSourceId,who.sub]);
    await this.event(db,c.id,c.id,c,who,"create",c.note,{id:c.id});return {id:c.id};
   }
   const b=await this.binding(db,kbId,c.bindingId);
   if('eventId' in c){const old=await this.replay(db,b.id,c.eventId,c);if(old)return {...old.result,revision:old.revision,duplicate:true};}
   const impact=async()=>{
    const docs=(await db.query("SELECT id,content_state,active_chunk_version,updated_at FROM karda_kb.document WHERE kb_id=$1 AND source='connector' AND source_ref->>'binding_id'=$2 AND content_state<>'deleted' ORDER BY id LIMIT 10001",[kbId,b.id])).rows;
    if(docs.length>10000)throw Error("source_revoke_budget");
    const pending=(await db.query("SELECT i.id,i.state,i.updated_at FROM karda_kb.source_sync_item i JOIN karda_kb.source_sync_run r ON r.id=i.run_id WHERE r.binding_id=$1 AND i.state IN ('queued','running','failed') ORDER BY i.id LIMIT 10001",[b.id])).rows;
    if(pending.length>10000)throw Error("source_revoke_budget");
    const revision=await this.revision(db,b.id);return {documents:docs.length,pendingItems:pending.length,revision,previewHash:profileHash([who.workspaceId,who.sub,b,revision,docs,pending])};
   };
   if(c.action==="revoke_preview")return {format:"karda.source-revoke-preview.v1",bindingId:b.id,...await impact()};
   if(c.action==="stage"){
    if(b.state!=="active")throw Error("source_binding_inactive");if(b.connector_code!=="api")throw Error("source_external_contract_required");if(c.mode!==b.mode)throw Error("source_mode_changed");
    const old=(await db.query("SELECT request_hash FROM karda_kb.source_sync_run WHERE id=$1 AND binding_id=$2",[c.id,b.id])).rows[0];if(old){if(old.request_hash!==profileHash(c))throw Error("source_conflict");return {id:c.id,duplicate:true};}
    let bytes=0;for(const item of c.items){bytes+=sourceBytes(item)?.length??0;}if(bytes>16*1024*1024)throw Error("source_payload_budget");
    if(Number((await db.query("SELECT count(*) AS n FROM karda_kb.source_sync_run WHERE binding_id=$1 AND state IN ('queued','attention')",[b.id])).rows[0].n)>=20)throw Error("source_pending_limit");
    await db.query("INSERT INTO karda_kb.source_sync_run(id,binding_id,mode,request_hash,note,created_by) VALUES($1,$2,$3,$4,$5,$6)",[c.id,b.id,c.mode,profileHash(c),c.note,who.sub]);
    for(const i of c.items)await db.query("INSERT INTO karda_kb.source_sync_item(id,run_id,source_doc_id,source_version,event,title,payload,payload_hash) VALUES($1,$2,$3,$4,$5,$6,$7,$8)",[i.id,c.id,i.sourceDocId,i.sourceVersion,i.event,i.title,JSON.stringify(i),profileHash(i)]);
    return {id:c.id,total:c.items.length};
   }
   if(c.action==="execute")throw Error("source_invalid_request");
   if(c.action==="retry"||c.action==="cancel_run"){
    const run=(await db.query("SELECT * FROM karda_kb.source_sync_run WHERE id=$1 AND binding_id=$2 FOR UPDATE",[c.runId,b.id])).rows[0];if(!run)throw Error("source_not_found");
    if(c.action==="cancel_run"){
     if(run.state==="done")throw Error("source_conflict");await db.query("UPDATE karda_kb.source_sync_run SET state='cancelled',updated_at=now() WHERE id=$1",[c.runId]);
     await db.query("UPDATE karda_kb.source_sync_item SET state='cancelled',lease_id=NULL,lease_until=NULL,updated_at=now() WHERE run_id=$1 AND state IN ('queued','running','failed')",[c.runId]);
    }else{
     if(b.state!=="active"||run.state==="cancelled")throw Error("source_binding_inactive");
     const items=(await db.query("SELECT id,state FROM karda_kb.source_sync_item WHERE run_id=$1 AND id=ANY($2::uuid[]) FOR UPDATE",[c.runId,c.itemIds])).rows;
     if(items.length!==c.itemIds.length||items.some(i=>i.state!=="failed"))throw Error("source_conflict");
     await db.query("UPDATE karda_kb.source_sync_item SET state='queued',attempt=0,error_code=NULL,updated_at=now() WHERE run_id=$1 AND id=ANY($2::uuid[])",[c.runId,c.itemIds]);await db.query("UPDATE karda_kb.source_sync_run SET state='queued',updated_at=now() WHERE id=$1",[c.runId]);
    }
    const result={id:c.runId};const revision=await this.event(db,b.id,c.eventId,c,who,c.action,c.note,result);return {...result,revision};
   }
   if(c.action==="retry_processing"){
    if(b.state!=="active")throw Error("source_binding_inactive");const docs=(await db.query("SELECT id,content_state FROM karda_kb.document WHERE kb_id=$1 AND source_ref->>'binding_id'=$2 AND id=ANY($3::uuid[]) FOR UPDATE",[kbId,b.id,c.documentIds])).rows;
    if(docs.length!==c.documentIds.length||docs.some(d=>d.content_state==='deleted'||d.content_state==='archived'))throw Error("source_conflict");
    for(const d of docs){const live=(await db.query("SELECT id,state FROM karda_kb.processing_task WHERE document_id=$1 AND kind='processing' AND state IN ('queued','running')",[d.id])).rows;if(live.length)continue;
     await db.query("UPDATE karda_kb.document SET content_state='processing',failure_reason=NULL,failed_at=NULL,updated_at=now() WHERE id=$1",[d.id]);await db.query("INSERT INTO karda_kb.processing_task(document_id,kb_id,tier,state,created_in_product,created_by) VALUES($1,$2,'sync','queued','karda',$3)",[d.id,kbId,who.sub]);}
    const result={documents:docs.length};const revision=await this.event(db,b.id,c.eventId,c,who,c.action,c.note,result);return {...result,revision};
   }
   const revision=await this.revision(db,b.id);if(revision!==c.expectedRevision)throw Error("source_conflict");if(b.state==="revoked")throw Error("source_binding_inactive");
   if(c.action==="revoke"){
    const preview=await impact();if(preview.previewHash!==c.previewHash)throw Error("source_preview_changed");
    await db.query("UPDATE karda_kb.document SET content_state='deleted',updated_at=now() WHERE kb_id=$1 AND source='connector' AND source_ref->>'binding_id'=$2 AND content_state<>'deleted'",[kbId,b.id]);
    await db.query("UPDATE karda_kb.processing_task SET state='failed',failure_class='permanent',failure_reason='source_binding_revoked',finished_at=now(),updated_at=now() WHERE kb_id=$1 AND document_id IN (SELECT id FROM karda_kb.document WHERE source_ref->>'binding_id'=$2) AND state IN ('queued','running','suspended')",[kbId,b.id]);
    await db.query("UPDATE karda_kb.source_sync_item SET state='cancelled',lease_id=NULL,lease_until=NULL,updated_at=now() WHERE run_id IN (SELECT id FROM karda_kb.source_sync_run WHERE binding_id=$1) AND state IN ('queued','running','failed')",[b.id]);
    await db.query("UPDATE karda_kb.source_sync_run SET state='cancelled',updated_at=now() WHERE binding_id=$1 AND state IN ('queued','attention')",[b.id]);
    await db.query("UPDATE karda_kb.binding SET state='revoked',updated_at=now() WHERE id=$1",[b.id]);const result={id:b.id,documents:preview.documents};const rev=await this.event(db,b.id,c.eventId,c,who,c.action,c.note,result);return {...result,revision:rev};
   }
   if(c.action==="finish_backfill"){
    if(b.state!=="active"||b.mode!=="backfill")throw Error("source_conflict");
    const counts=(await db.query("SELECT count(*) FILTER(WHERE state='done') AS total,count(*) FILTER(WHERE state IN ('queued','attention')) AS pending FROM karda_kb.source_sync_run WHERE binding_id=$1 AND mode='backfill'",[b.id])).rows[0];
    if(!Number(counts.total)||Number(counts.pending))throw Error("source_not_ready");await db.query("UPDATE karda_kb.binding SET mode='incremental',updated_at=now() WHERE id=$1",[b.id]);
   }else await db.query("UPDATE karda_kb.binding SET state=$2,updated_at=now() WHERE id=$1",[b.id,c.action==="pause"?"paused":"active"]);
   const result={id:b.id};const rev=await this.event(db,b.id,c.eventId,c,who,c.action,c.note,result);return {...result,revision:rev};
  },c.action==='retry_processing');
 }
 async claim(who:SemanticReadIdentity,kbId:string,c:Extract<SourceCommand,{action:"execute"}>){
  return this.scope(who,kbId,async db=>{
   const b=await this.binding(db,kbId,c.bindingId);if(b.state!=="active")throw Error("source_binding_inactive");
   const run=(await db.query("SELECT * FROM karda_kb.source_sync_run WHERE id=$1 AND binding_id=$2 FOR UPDATE",[c.runId,b.id])).rows[0];if(!run||run.state==="cancelled")throw Error("source_not_found");
   const item=(await db.query<Item>("SELECT * FROM karda_kb.source_sync_item WHERE id=$1 AND run_id=$2 FOR UPDATE",[c.itemId,c.runId])).rows[0];if(!item)throw Error("source_not_found");
   if(['applied','cancelled'].includes(item.state))return null;if(item.state==='running'&&item.lease_until&&item.lease_until.getTime()>Date.now())throw Error("source_lease_busy");if(item.attempt>=3)throw Error("source_attempt_limit");
   if(profileHash(item.payload)!==item.payload_hash)throw Error("source_payload_changed");const lease=randomUUID();await db.query("UPDATE karda_kb.source_sync_item SET state='running',attempt=attempt+1,lease_id=$2,lease_until=now()+interval '3 minutes',error_code=NULL,updated_at=now() WHERE id=$1",[item.id,lease]);
   return {lease,item:item.payload};
  },true);
 }
 async settle(who:SemanticReadIdentity,kbId:string,c:Extract<SourceCommand,{action:"execute"}>,lease:string,stored:StoredObject|null,errorCode:string|null){
  const docLimit=stored?validateCapacityLimit(await this.limits(who.workspaceId,"document.max")):-1;
  return this.scope(who,kbId,async(db,kb)=>{
   const b=await this.binding(db,kbId,c.bindingId);if(b.state!=="active")throw Error("source_binding_inactive");
   const run=(await db.query("SELECT * FROM karda_kb.source_sync_run WHERE id=$1 AND binding_id=$2 FOR UPDATE",[c.runId,b.id])).rows[0],item=(await db.query<Item>("SELECT * FROM karda_kb.source_sync_item WHERE id=$1 AND run_id=$2 FOR UPDATE",[c.itemId,c.runId])).rows[0];
   if(!run||run.state==="cancelled"||!item||item.state!=="running"||item.lease_id!==lease||!item.lease_until||item.lease_until.getTime()<=Date.now())throw Error("source_lease_changed");
   let documentId:string|null=null,outcome="failed";
   if(!errorCode){
    const i=item.payload;if(profileHash(i)!==item.payload_hash)throw Error("source_payload_changed");
    const head=(await db.query("SELECT * FROM karda_kb.source_document_head WHERE binding_id=$1 AND source_doc_id=$2 FOR UPDATE",[b.id,i.sourceDocId])).rows[0];outcome=sourceVersionDecision(head,i);documentId=head?.document_id??null;
    if(outcome==="apply"&&i.event==="upsert"&&head?.event==="upsert"&&head.content_hash===i.contentHash&&head.document_id){
     const current=(await db.query("SELECT id FROM karda_kb.document WHERE id=$1 AND kb_id=$2 AND content_state<>'deleted' FOR UPDATE",[head.document_id,kbId])).rows[0];
     if(current){await db.query("UPDATE karda_kb.document SET title=$2,updated_at=now() WHERE id=$1 AND title<>$2",[current.id,i.title]);await db.query("UPDATE karda_kb.source_document_head SET source_version=$3,updated_at=now() WHERE binding_id=$1 AND source_doc_id=$2",[b.id,i.sourceDocId,i.sourceVersion]);outcome="unchanged";}
    }
    if(outcome==="apply"){
     const legacy=(await db.query("SELECT id,source_ref FROM karda_kb.document WHERE kb_id=$1 AND source='connector' AND connector_code=$2 AND source_ref->>'source_doc_id'=$3 AND content_state<>'deleted' ORDER BY id LIMIT 2 FOR UPDATE",[kbId,b.connector_code,i.sourceDocId])).rows;
     if(legacy.some(d=>d.source_ref.binding_id!==b.id)||legacy.length>1)throw Error("source_origin_conflict");
     if(i.event==='upsert'&&(!stored||stored.contentHash!==i.contentHash||stored.sizeBytes!==sourceBytes(i)!.length))throw Error("source_content_invalid");
     await db.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))",["karda:capacity:document.max:"+who.workspaceId]);
     if(stored&&this.trackedStorage){await db.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))",["karda:capacity:storage.bytes:"+who.workspaceId]);
      if(!(await db.query("SELECT id FROM karda_kb.stored_object WHERE object_key=$1 AND workspace_id=$2 AND kb_id=$3 AND state='ready' AND size_bytes=$4",[stored.key,who.workspaceId,kbId,stored.sizeBytes])).rowCount)throw Error("source_storage_unavailable");}
     for(const old of legacy)await db.query("UPDATE karda_kb.document SET content_state='deleted',updated_at=now() WHERE id=$1",[old.id]);
     if(i.event==='upsert'){
      await this.quota(db,who.workspaceId,"document.max",docLimit);documentId=randomUUID();
      await db.query("INSERT INTO karda_kb.document(id,kb_id,title,mime,size_bytes,source,connector_code,source_ref,storage_ref,content_hash,processing_template_id,created_in_product,created_by) VALUES($1,$2,$3,$4,$5,'connector',$6,$7,$8,$9,$10,'karda',$11)",[documentId,kbId,i.title,i.mime,stored!.sizeBytes,b.connector_code,JSON.stringify({binding_id:b.id,source_doc_id:i.sourceDocId,external_version:String(i.sourceVersion)}),stored!.key,i.contentHash,kb.processing_template_id,who.sub]);
      await db.query("INSERT INTO local_usage.raw(workspace_id,metric,amount,idempotency_key) VALUES($1,'karda.ingest',1,$2)",[who.workspaceId,"karda.ingest:"+documentId]);
      await db.query("INSERT INTO karda_kb.processing_task(document_id,kb_id,tier,state,created_in_product,created_by) VALUES($1,$2,$3,'queued','karda',$4)",[documentId,kbId,run.mode==='backfill'?'bulk':'sync',who.sub]);outcome=legacy.length?'superseded':'created';
     }else {documentId=legacy[0]?.id??head?.document_id??null;outcome=legacy.length?'deleted':'absent';}
     await db.query("INSERT INTO karda_kb.source_document_head(binding_id,source_doc_id,source_version,event,content_hash,document_id) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(binding_id,source_doc_id) DO UPDATE SET source_version=EXCLUDED.source_version,event=EXCLUDED.event,content_hash=EXCLUDED.content_hash,document_id=EXCLUDED.document_id,updated_at=now()",[b.id,i.sourceDocId,i.sourceVersion,i.event,i.contentHash??null,documentId]);
    }
   }
   await db.query("UPDATE karda_kb.source_sync_item SET state=$2,outcome=$3,document_id=$4,error_code=$5,lease_id=NULL,lease_until=NULL,updated_at=now() WHERE id=$1",[item.id,errorCode?'failed':'applied',outcome,documentId,errorCode]);
   const count=(await db.query("SELECT count(*) FILTER(WHERE state IN ('queued','running')) AS pending,count(*) FILTER(WHERE state='failed') AS failed FROM karda_kb.source_sync_item WHERE run_id=$1",[c.runId])).rows[0];
   await db.query("UPDATE karda_kb.source_sync_run SET state=$2,updated_at=now() WHERE id=$1",[c.runId,Number(count.pending)?'queued':Number(count.failed)?'attention':'done']);
   if(!errorCode)await db.query("UPDATE karda_kb.binding SET last_synced_at=now(),cursor=$2,updated_at=now() WHERE id=$1",[b.id,c.runId+":"+item.id]);
   return {itemId:item.id,state:errorCode?'failed':'applied',outcome,documentId,errorCode};
  },true);
 }
 async browse(who:SemanticReadIdentity,kbId:string,q:{bindingId?:string;runId?:string;before?:string;historyBefore?:number;documentBefore?:string}={}){
  for(const x of [q.bindingId,q.runId,q.before,q.documentBefore])if(x!==undefined&&!SOURCE_UUID.test(x))throw Error("source_invalid_request");if((q.runId&&!q.bindingId)||(q.historyBefore!==undefined&&(!q.bindingId||!Number.isSafeInteger(q.historyBefore)||q.historyBefore<1||q.historyBefore>2147483647)))throw Error("source_invalid_request");
  return this.scope(who,kbId,async db=>{
   const bindings=(await db.query(`SELECT b.id,b.connector_code,b.external_source_id,b.mode,b.state,b.last_synced_at,
    (SELECT COALESCE(max(revision),0) FROM karda_kb.source_control_event e WHERE e.binding_id=b.id) AS revision,
    (SELECT count(*)::integer FROM karda_kb.document d WHERE d.kb_id=b.kb_id AND d.source_ref->>'binding_id'=b.id::text AND d.content_state<>'deleted') AS documents,
    (SELECT count(*)::integer FROM karda_kb.document d WHERE d.kb_id=b.kb_id AND d.source_ref->>'binding_id'=b.id::text AND d.content_state='failed') AS "failedDocuments",
    (SELECT count(*)::integer FROM karda_kb.source_sync_item i JOIN karda_kb.source_sync_run r ON r.id=i.run_id WHERE r.binding_id=b.id AND i.state IN ('queued','running','failed')) AS "pendingItems"
    FROM karda_kb.binding b WHERE kb_id=$1 ORDER BY b.created_at DESC LIMIT 101`,[kbId])).rows;
   if(bindings.length>100)throw Error("source_binding_budget");for(const b of bindings)b.readiness=b.connector_code==='api'?'ready':'external_contract_required';
   if(q.bindingId&&!bindings.some(b=>b.id===q.bindingId))throw Error("source_not_found");
   const runs=q.bindingId?(await db.query(`SELECT r.id,r.mode,r.state,r.note,r.created_at,count(i.id)::integer AS total,
    count(i.id) FILTER(WHERE i.state='applied')::integer AS applied,count(i.id) FILTER(WHERE i.state='failed')::integer AS failed,
    count(i.id) FILTER(WHERE i.state IN ('queued','running'))::integer AS queued
    FROM karda_kb.source_sync_run r LEFT JOIN karda_kb.source_sync_item i ON i.run_id=r.id WHERE r.binding_id=$1 AND ($2::uuid IS NULL OR r.id<$2) GROUP BY r.id ORDER BY r.id DESC LIMIT 21`,[q.bindingId,q.before??null])).rows:[];
   const items=q.runId?(await db.query(`SELECT i.id,i.source_doc_id,i.source_version,i.event,i.title,i.state,i.attempt,i.error_code,i.document_id,i.lease_until,i.outcome,d.content_state AS processing_state,t.id AS task_id,t.state AS task_state
    FROM karda_kb.source_sync_item i JOIN karda_kb.source_sync_run r ON r.id=i.run_id LEFT JOIN karda_kb.document d ON d.id=i.document_id
    LEFT JOIN LATERAL(SELECT id,state FROM karda_kb.processing_task WHERE document_id=d.id ORDER BY queued_at DESC LIMIT 1)t ON true
    WHERE i.run_id=$1 AND r.binding_id=$2 ORDER BY i.id LIMIT 51`,[q.runId,q.bindingId])).rows:[];
   if(q.runId&&!items.length)throw Error("source_not_found");
   const history=q.bindingId?(await db.query("SELECT revision,action,note,result,created_by,created_at FROM karda_kb.source_control_event WHERE binding_id=$1 AND ($2::integer IS NULL OR revision<$2) ORDER BY revision DESC LIMIT 21",[q.bindingId,q.historyBefore??null])).rows:[];
   const documents=q.bindingId?(await db.query(`SELECT d.id,d.title,d.content_state,d.active_chunk_version,d.source_ref->>'source_doc_id' AS source_doc_id,COALESCE(h.source_version::text,d.source_ref->>'external_version') AS source_version,t.id AS task_id,t.state AS task_state
    FROM karda_kb.document d LEFT JOIN karda_kb.source_document_head h ON h.binding_id=$2::text::uuid AND h.document_id=d.id AND h.source_doc_id=d.source_ref->>'source_doc_id' LEFT JOIN LATERAL(SELECT id,state FROM karda_kb.processing_task WHERE document_id=d.id ORDER BY queued_at DESC LIMIT 1)t ON true
    WHERE d.kb_id=$1 AND d.source_ref->>'binding_id'=$2 AND ($3::uuid IS NULL OR d.id<$3) ORDER BY d.id DESC LIMIT 21`,[kbId,q.bindingId,q.documentBefore??null])).rows:[];
   return {format:"karda.source-management.v1",kbId,bindings,runs:runs.slice(0,20),nextBefore:runs.length>20?runs[19].id:null,items,history:history.slice(0,20),nextHistoryBefore:history.length>20?history[19].revision:null,documents:documents.slice(0,20),nextDocumentBefore:documents.length>20?documents[19].id:null};
  });
 }
}
