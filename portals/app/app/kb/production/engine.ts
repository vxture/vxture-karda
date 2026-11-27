import {permits} from "../../authz/policy";
import {profileHash} from "../semantic/profile-authority";
import {randomUUID} from 'node:crypto';
import type {PoolClient} from 'pg';
import {ProductionStore,type Unit,type Step,type Doc} from './store';
import type {SemanticReadIdentity} from '../semantic/read-postgres';
import {PostgresSemanticStore,semanticValueHash} from '../semantic/store-postgres';
import {executeCompileTask} from '../semantic/compile-task';
import {AtlasSemanticCandidateClient} from '../semantic/compiler';
import {getGenerationClient} from '../retrieval/generation';
import {tenantForWorkspace} from '../processing/atlas-embedder';
import {getExtractionClient} from '../atlas/extract';
import {runExtraction} from '../assertions/extract-run';
import type {PreparedAssertion} from '../assertions/extract';
import {failure} from './contract';
export interface Work {p:{id:string;extract_missing:boolean};u:Unit;s:Step}
export class ProductionEngine{
 constructor(public store:ProductionStore,public semantic:PostgresSemanticStore){}
 async process(who:SemanticReadIdentity,w:Work){const {u,s}=w;return this.store.tx(who,async(db,a)=>{if(!permits(a,'ai.use'))throw Error('production_denied');const {docs}=await this.store.validate(db,who,u),d=docs.find(d=>d.id===s.document_id)!;
  if(d.content_state==='indexed')return {state:'done',receipt:{documentId:d.id,version:d.active_chunk_version,modelTaskId:'karda:ingest:'+d.id,taskId:(await db.query("SELECT id FROM karda_kb.processing_task WHERE document_id=$1 AND kind='processing' ORDER BY queued_at DESC LIMIT 1",[d.id])).rows[0]?.id??null}};
  const prior=(await db.query("SELECT id,state,failure_reason FROM karda_kb.processing_task WHERE document_id=$1 AND kind='processing' ORDER BY queued_at DESC LIMIT 1",[d.id])).rows[0];
  if(prior&&['failed','suspended'].includes(prior.state)&&s.receipt.taskId===prior.id)throw Error('production_processing_blocked');
  let taskId=prior?.id;if(!prior||['failed','done','suspended'].includes(prior.state)){
   taskId=s.id;const exists=(await db.query('SELECT state FROM karda_kb.processing_task WHERE id=$1',[taskId])).rows[0];if(exists&&exists.state==='failed')throw Error('production_processing_blocked');
   await db.query("UPDATE karda_kb.document SET content_state='processing',failure_reason=NULL,failed_at=NULL,updated_at=now() WHERE id=$1",[d.id]);
   await db.query("INSERT INTO karda_kb.processing_task(id,document_id,kb_id,tier,state,created_in_product,created_by) VALUES($1,$2,$3,'bulk','queued','karda',$4) ON CONFLICT(id) DO NOTHING",[taskId,d.id,u.kb_id,who.sub]);
  }return {state:'waiting',receipt:{documentId:d.id,taskId,modelTaskId:'karda:ingest:'+d.id}};
 });}
 async extract(who:SemanticReadIdentity,w:Work){const {u,s,p}=w;
  const loaded=await this.store.tx(who,async(db,a)=>{if(!permits(a,'ai.use'))throw Error('production_denied');const {docs}=await this.store.validate(db,who,u),d=docs.find(d=>d.id===s.document_id)!;if(d.content_state!=='indexed')throw Error('production_source_changed');const existing=(await db.query("SELECT DISTINCT a.id FROM karda_kb.assertion a JOIN karda_kb.evidence e ON e.assertion_id=a.id JOIN karda_kb.span sp ON sp.id=e.span_id WHERE a.kb_id=$1 AND sp.document_id=$2 AND sp.document_version=$3 AND a.content_state NOT IN ('deleted','archived') ORDER BY a.id LIMIT 201",[u.kb_id,d.id,d.active_chunk_version])).rows;
   if(existing.length>200)throw Error('production_assertion_budget');if(existing.length)return {d,existing:existing.map(a=>a.id),raw:null};if(!p.extract_missing)throw Error('production_extraction_required');const raw=await this.store.sourceText(db,d);
   await db.query("INSERT INTO karda_kb.processing_task(id,document_id,kb_id,kind,tier,state,current_stage,created_in_product,created_by) VALUES($1,$2,$3,'extraction','bulk','running','extract','karda',$4) ON CONFLICT(id) DO UPDATE SET state='running',attempt=processing_task.attempt+1,updated_at=now()",[s.id,d.id,u.kb_id,who.sub]);return {d,existing:null,raw};
  });
  if(loaded.existing)return {state:'done',receipt:{documentId:loaded.d.id,version:loaded.d.active_chunk_version,assertionIds:loaded.existing,reused:true}};
  const tenant=await tenantForWorkspace(who.workspaceId);if(!tenant)throw Error('production_tenant_required');
  await this.store.guard(who,u.plan_id,u.id,true);const result=await runExtraction(getExtractionClient(),{documentId:loaded.d.id,documentVersion:loaded.d.active_chunk_version,kbId:u.kb_id,mime:loaded.d.mime,bytes:loaded.raw!.bytes,normalized:loaded.raw!.normalized,tenantId:tenant,workspaceId:who.workspaceId,taskId:s.id,extractedBy:'karda.production',extractionRun:s.id},async(_ctx,prepared)=>this.commitExtraction(who,w,loaded.d,prepared));
  if(result.status!=='ok'){await this.store.pool.query("UPDATE karda_kb.processing_task SET state='failed',failure_class='unavailable',failure_reason=$2,updated_at=now() WHERE id=$1",[s.id,result.reason]);throw Error('production_extraction_blocked');}
  return {state:'committed',receipt:{taskId:s.id,assertions:result.stored?.assertionIds.length??0}};
 }
 async commitExtraction(who:SemanticReadIdentity,w:Work,doc:Doc,prepared:PreparedAssertion[]){if(prepared.length>200)throw Error('production_assertion_budget');return this.store.tx(who,async(db,access)=>{if(!permits(access,'ai.use'))throw Error('production_denied');
  const p=await this.store.plan(db,who,w.u.plan_id);if(p.state==='cancelled')throw Error('production_inactive');const fence=(await db.query("SELECT id FROM karda_kb.production_step WHERE id=$1 AND state='running' AND lease_id=$2 AND lease_until>now() FOR UPDATE",[w.s.id,w.s.lease_id])).rowCount;if(!fence)throw Error('production_stale_lease');
  const {docs}=await this.store.validate(db,who,w.u),d=docs.find(d=>d.id===doc.id)!;if(d.active_chunk_version!==doc.active_chunk_version)throw Error('production_source_changed');const raw=await this.store.sourceText(db,d);const assertionIds:string[]=[];let mentions=0,entities=0;
  for(const a of prepared){if(a.span.documentId!==d.id||a.span.documentVersion!==d.active_chunk_version||raw.text.slice(a.span.startOffset,a.span.endOffset)!==a.span.excerpt)throw Error('production_source_changed');const assertionId=randomUUID(),spanId=randomUUID();
   await db.query("INSERT INTO karda_kb.assertion(id,kb_id,kind,subject,statement,asserted_by,as_of,valid_until,extracted_by,extraction_run,confidence) VALUES($1,$2,$3,$4,$5,$6,$7,$8,'karda.production',$9,$10)",[assertionId,w.u.kb_id,a.kind,a.subject,a.statement,a.assertedBy,a.asOf,a.validUntil,w.s.id,a.confidence]);
   await db.query('INSERT INTO karda_kb.span(id,document_id,document_version,start_offset,end_offset,excerpt) VALUES($1,$2,$3,$4,$5,$6)',[spanId,d.id,d.active_chunk_version,a.span.startOffset,a.span.endOffset,a.span.excerpt]);await db.query("INSERT INTO karda_kb.evidence(assertion_id,span_id,stance) VALUES($1,$2,'supports')",[assertionId,spanId]);
   for(const name of [...new Set(a.mentions)]){const previous=(await db.query("SELECT id FROM karda_kb.entity WHERE kb_id=$1 AND kind='thing' AND name=$2",[w.u.kb_id,name])).rows[0];let entityId=previous?.id;if(!entityId){entityId=randomUUID();await db.query("INSERT INTO karda_kb.entity(id,kb_id,kind,name) VALUES($1,$2,'thing',$3)",[entityId,w.u.kb_id,name]);entities++;}await db.query("INSERT INTO karda_kb.assertion_mention(assertion_id,entity_id,role) VALUES($1,$2,'mentions')",[assertionId,entityId]);mentions++;}assertionIds.push(assertionId);
  }
  const receipt={documentId:d.id,version:d.active_chunk_version,taskId:w.s.id,modelTaskId:w.s.id,assertionIds};await db.query("UPDATE karda_kb.production_step SET state='done',receipt=$3,lease_id=NULL,lease_until=NULL,error_code=NULL,updated_at=now() WHERE id=$1 AND lease_id=$2",[w.s.id,w.s.lease_id,JSON.stringify(receipt)]);await db.query("UPDATE karda_kb.processing_task SET state='done',failure_class=NULL,failure_reason=NULL,finished_at=now(),updated_at=now() WHERE id=$1",[w.s.id]);return {assertionIds,spansWritten:prepared.length,evidenceWritten:prepared.length,entitiesCreated:entities,mentionsWritten:mentions};
 });}
 async compile(who:SemanticReadIdentity,w:Work){const {u}=w;try{await this.semantic.createCompileTask(who,u.kb_id,u.compile_task_id,u.manifest.documents.map(d=>d.id));}catch(e){if(e instanceof Error&&e.message==='semantic_compile_inputs_required')return {state:'review',receipt:{taskId:null,plannedTaskId:u.compile_task_id,reason:'production_assertion_review_required'}};throw e;}
  let task=(await this.semantic.browseCompileTasks(who,u.kb_id,{taskId:u.compile_task_id})).tasks[0];if(task.sourceState==='changed')throw Error('production_source_changed');
  if(task.state==='running')throw Error('production_outcome_unknown');
  if(task.state==='queued'){await this.store.guard(who,u.plan_id,u.id,true);await executeCompileTask(who,u.kb_id,u.compile_task_id,{store:this.semantic,tenantForWorkspace,candidates:()=>{const g=getGenerationClient();return g?new AtlasSemanticCandidateClient(g):null;}});task=(await this.semantic.browseCompileTasks(who,u.kb_id,{taskId:u.compile_task_id})).tasks[0];}
  if(['failed','suspended'].includes(task.state))throw Error('production_compile_blocked');
  return {state:task.state==='completed'?'done':'review',receipt:{taskId:u.compile_task_id,modelTaskId:u.compile_task_id,runId:task.run_id,reason:task.error_code??null}};
 }
 async run(who:SemanticReadIdentity,w:Work){try{let outcome;if(w.s.kind==='process')outcome=await this.process(who,w);else if(w.s.kind==='extract')outcome=await this.extract(who,w);else if(w.s.kind==='compile')outcome=await this.compile(who,w);else outcome=await this.publish(who,w);
   if(outcome.state!=='committed')await this.store.settle(who,w.u,w.s,outcome.state,outcome.receipt);
  }catch(e){await this.store.settle(who,w.u,w.s,'failed',w.s.receipt,failure(e).code);}}
 async publish(who:SemanticReadIdentity,w:Work){const token=w.s.payload.token;const previous=(await this.store.pool.query('SELECT release_id,generation,fingerprint FROM karda_kb.semantic_event_receipt WHERE kb_id=$1 AND event_id=$2',[w.u.kb_id,token.eventId])).rows[0];if(previous){if(previous.fingerprint!==token.fingerprint)throw Error('production_conflict');return {state:'done',receipt:{releaseId:previous.release_id,generation:previous.generation,reconciled:true}};}
  await this.store.guard(who,w.u.plan_id,w.u.id);const services=await this.store.tx(who,async(db,a)=>(await db.query("SELECT s.id,s.state,s.active_version,v.config_hash,v.config->>'name' AS name FROM karda_kb.knowledge_service s JOIN karda_kb.knowledge_service_version v ON v.id=s.active_version AND v.service_id=s.id WHERE s.workspace_id=$1 AND (s.created_by=$2 OR $3::boolean) AND v.config->'kbIds' ? $4 ORDER BY s.id LIMIT 101",[who.workspaceId,who.sub,a.roles.some(r=>r==='owner'||r==='administrator'),w.u.kb_id])).rows);if(profileHash(services)!==profileHash(w.s.payload.services))throw Error('production_preview_changed');const receipt=await this.semantic.submitPreview(who,w.u.kb_id,token);return {state:'done',receipt};}
}
