import { randomUUID } from "node:crypto";
import type { Pool, PoolClient } from "pg";
import { permits, type ProductPermission } from "../../authz/policy";
import { readProductAccess, type RoleSql } from "../../authz/store";
import type { ObjectStore } from "../storage/objectstore";
import { preparePublication, type PublicationCommand, type PublicationReceipt } from "./publication";
import { decodeSemanticRelease, decodePreparedSemanticRelease, semanticDefinitionKey, type SemanticReleasePayload } from "./release-format";
import type { PublishedRelationInput, SemanticReadIdentity } from "./read-postgres";
import { matchesSourceSpan, verifiedSourceText, MAX_SEMANTIC_SOURCE_BYTES, MAX_SEMANTIC_TEXT_CHARS } from "./source-text";
import { projectNeighborhood } from "./projection";
import type { KnowledgeSnapshot } from "./contracts";
import type { CompilerSnapshot, Compilation } from "./compiler";
import { freezeCompilerSnapshot } from "./compiler";
import { localCompileProfile } from "./compile-profile";
import {parsePathFor} from "../processing/ir";
import {readSourceSnapshot} from "../processing/source-snapshot";
import {SOURCE_FORMATS} from "../processing/source-formats";
import {inspectSources,type SourceCandidate} from "./source-readiness";
import {parseSourceInspectionQuery,type SourceInspectionQuery} from "./source-query";
import {compileSourceSelection} from "./compile-source-selection";
import {publicationImpact} from "./publication-impact";
import { maintenanceReport, type MaintenanceReport, type MaintenanceDocument, type MaintenanceAssertion, type MaintenanceGround } from "./maintenance";
import {verifyAuditWindow,type AuditHistory,type AuditRelease} from "./audit-history";
import {parseCompileTaskQuery,type CompileTaskQuery} from "./task-query";
import {retrySemanticTransaction} from "./transaction-retry";

export interface CompileTaskRow {
  sourceIds?:string[];
  created_at?:Date;updated_at?:Date;lease_until?:Date|null;canRetry?:boolean;sourceState?:"current"|"changed"|"not_loaded";
  id:string; state:string; attempt:number; run_id:string|null; error_code:string|null; result:Record<string,unknown>;
  resultHash?:string;
  context?:Pick<CompilerSnapshot,"entities"|"assertions">;
}
interface ClaimedCompileTask extends CompileTaskRow { snapshot:CompilerSnapshot; snapshot_hash:string; lease_id:string; }

const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const HASH = /^[a-f0-9]{64}$/;
const ZERO = "00000000-0000-0000-0000-000000000000";
/** Bounded canonical hash; the fixed envelope is only a hash domain separator. */
export function semanticValueHash(payload: unknown): string {
  return preparePublication({ kbId: ZERO, eventId: ZERO, expectedGeneration: 0,
    sourceRevision: "value-v1", reviewRevision: "value-v1", schemaRevision: "value-v1", payload }).fingerprint;
}
function decode(kbId: string, payload: unknown): PublishedRelationInput {
  return decodeSemanticRelease({ kbId, eventId: ZERO, expectedGeneration: 0,
    sourceRevision: "decode", reviewRevision: "decode", schemaRevision: "decode", payload });
}
function frozenPayload(kbId: string, payload: SemanticReleasePayload): SemanticReleasePayload {
  const input = decode(kbId, payload);
  return { format: payload.format, schema: input.schema, entityTypes: [...input.entityTypes].map(([kind, type]) => ({ kind, type })),
    relations: input.relations, sources: input.sources };
}
function subjectHash(input: PublishedRelationInput, relationId: string): string {
  return semanticValueHash({ definition: semanticDefinitionKey(input), sources: input.sources,
    relation: input.relations.find(row => row.id === relationId) });
}
interface CompileRow { id: string; kb_id: string; schema_version_id: string; candidates: SemanticReleasePayload; source_manifest: unknown;
  input_hash: string; config_hash: string; status: string }
interface ReviewRow { id: string; subject_key: string; subject_hash: string; revision: number; decision: string }
async function compiled(db: PoolClient, kbId: string, runId: string): Promise<{ row: CompileRow; input: PublishedRelationInput }> {
  const row = (await db.query<CompileRow>(`SELECT id,kb_id,schema_version_id,candidates,source_manifest,input_hash,config_hash,status
    FROM karda_kb.semantic_compile_run WHERE kb_id=$1 AND id=$2`, [kbId, runId])).rows[0];
  return checkedCompile(kbId,row);
}
function checkedCompile(kbId:string,row:CompileRow|undefined):{row:CompileRow;input:PublishedRelationInput}{
  if (!row || row.status !== "validated") throw new Error("semantic_compile_unavailable");
  const input = decode(kbId, row.candidates);
  if (semanticValueHash(input.sources) !== row.input_hash || semanticValueHash(row.source_manifest) !== row.input_hash)
    throw new Error("semantic_corrupt_compile");
  return { row, input };
}
async function latestReviews(db: PoolClient, kbId: string, input: PublishedRelationInput): Promise<ReviewRow[]> {
  return (await db.query<ReviewRow>(`SELECT DISTINCT ON (subject_key) id,subject_key,subject_hash,revision,decision
    FROM karda_kb.semantic_review WHERE kb_id=$1 AND subject_key=ANY($2::text[])
    ORDER BY subject_key,revision DESC`, [kbId, input.relations.map(row => `relation/${row.id}`)])).rows;
}
function acceptedReviews(input: PublishedRelationInput, reviews: ReviewRow[]): void {
  const bySubject = new Map(reviews.map(review=>[review.subject_key,review]));
  const definition=semanticDefinitionKey(input);
  if (reviews.length !== input.relations.length || input.relations.some(relation => {
    const review = bySubject.get(`relation/${relation.id}`);
    return !review || review.decision !== "accept" || review.subject_hash !== semanticValueHash({definition,sources:input.sources,relation});
  })) throw new Error("semantic_review_required");
}

/** Formal-table writer. Same-workspace user-owned libraries and verified source text.
 * Identity and platform admission MUST come from verified server context.
 * The HTTP adapter owns verified RP admission; no offline receipt import or auto-approval.
 */
export class PostgresSemanticStore {
  constructor(private readonly pool: Pool, private readonly objects: Pick<ObjectStore, "get">,
    private readonly admitPlatform: (identity: SemanticReadIdentity) => Promise<boolean>) {}

  /** Governance-only historical metadata. Never substitutes for current knowledge reads. */
  async auditHistory(identity:SemanticReadIdentity,kbId:string,before?:number):Promise<AuditHistory>{
    if(before!==undefined&&(!Number.isInteger(before)||before<1||before>2147483647))throw new Error("semantic_invalid_history");
    return this.write(identity,kbId,"service.publish",async db=>{
      const head=(await db.query<{generation:number;release_id:string}>("SELECT generation,release_id FROM karda_kb.semantic_release_head WHERE kb_id=$1",[kbId])).rows[0];
      const latest=(await db.query<{generation:number;id:string}>("SELECT generation,id FROM karda_kb.semantic_release WHERE kb_id=$1 ORDER BY generation DESC LIMIT 1",[kbId])).rows[0];
      const headMatches=(!head&&!latest)||Boolean(head&&latest&&head.generation===latest.generation&&head.release_id===latest.id);
      const rows=(await db.query<{id:string;generation:number;payload:PublicationCommand;fingerprint:string;compile_run_id:string;created_by:string;created_at:Date}>(`
        SELECT id,generation,payload,fingerprint,compile_run_id,created_by,created_at FROM karda_kb.semantic_release
        WHERE kb_id=$1 AND ($2::integer IS NULL OR generation<$2) ORDER BY generation DESC LIMIT 21`,[kbId,before??null])).rows;
      const hasOlder=rows.length>20;if(hasOlder)rows.pop();
      let bytes=0,relationCount=0,sourceCount=0;const releases:AuditRelease[]=[];
      for(const row of rows){
        bytes+=Buffer.byteLength(JSON.stringify(row.payload));if(bytes>2*1024*1024)throw new Error("semantic_history_budget");
        const entry:AuditRelease={id:row.id,generation:row.generation,createdAt:row.created_at.toISOString(),createdBy:row.created_by,
          compileRunId:row.compile_run_id,fingerprint:row.fingerprint,verified:false,issues:[],relations:[],sources:[],reviewCount:0};
        try{
          const {command,fingerprint}=preparePublication(row.payload),input=decodeSemanticRelease(command);
          if(command.kbId!==kbId||fingerprint!==row.fingerprint||command.expectedGeneration+1!==row.generation)
            throw new Error("semantic_corrupt_release");
          // Historical bindings must be valid as stored; a later rejection does
          // not rewrite the audit past, and historical facts are not current grants.
          const verified=await new PostgresFormalSemanticLoader({schema:input.schema,entityTypes:input.entityTypes}).loadHistorical(db,kbId,row.id);
          const receipts=(await db.query<{event_id:string;generation:number;fingerprint:string}>(`SELECT event_id,generation,fingerprint
            FROM karda_kb.semantic_event_receipt WHERE kb_id=$1 AND release_id=$2 LIMIT 2`,[kbId,row.id])).rows;
          const receipt=receipts[0];
          if(receipts.length!==1||receipt.event_id!==command.eventId||receipt.generation!==row.generation||receipt.fingerprint!==fingerprint)
            entry.issues.push("receipt_mismatch");
          entry.verified=entry.issues.length===0;
          if(entry.verified){entry.relations=verified.relations;entry.sources=verified.sources;entry.reviewCount=verified.relations.length;}
        }catch(error){
          const code=error instanceof Error?error.message:"";
          if(!/^(semantic_(corrupt|invalid|compile_unavailable|review_required|release_schema_mismatch)|publication_)/.test(code))throw error;
          entry.issues.push("immutable_record_mismatch");
        }
        relationCount+=entry.relations.length;sourceCount+=entry.sources.length;
        if(relationCount>5000||sourceCount>1000)throw new Error("semantic_history_budget");
        releases.push(entry);
      }
      const completeHistory=before===undefined&&!hasOlder;
      return {checkedAt:new Date().toISOString(),headGeneration:head?.generation??0,headReleaseId:head?.release_id??null,headMatches,
        releases,nextBefore:hasOlder?rows[rows.length-1].generation:null,completeHistory,replay:verifyAuditWindow(releases,headMatches,completeHistory)};
    },true);
  }

  async maintenance(identity: SemanticReadIdentity, kbId: string,exporting=false): Promise<MaintenanceReport> {
    return this.write(identity, kbId, "service.publish", async db => {
      if(exporting){const access=await readProductAccess(identity,{
        $queryRawUnsafe:async<R>(s:string,...v:unknown[])=>(await db.query(s,v)).rows as R,
        $executeRawUnsafe:async()=>{throw new Error("semantic_write_denied");},
      });if(!permits(access,"data.export"))throw new Error("semantic_write_denied");}
      const now = (await db.query<{now:Date}>("SELECT clock_timestamp() AS now")).rows[0].now;
      const head = (await db.query<{id:string;generation:number;payload:PublicationCommand}>(`SELECT r.id,h.generation,r.payload
        FROM karda_kb.semantic_release_head h JOIN karda_kb.semantic_release r
        ON r.kb_id=h.kb_id AND r.id=h.release_id AND r.generation=h.generation WHERE h.kb_id=$1`,[kbId])).rows[0];
      if (!head) return {generation:0,releaseId:null,checkedAt:now.toISOString(),sources:[],relations:[]};
      const input = decodeSemanticRelease(head.payload);
      // Validate the immutable release, its bound reviews and normalized rows.
      const loaded = await new PostgresFormalSemanticLoader({schema:input.schema,entityTypes:input.entityTypes}).load(db,[kbId]);
      if(input.sources.length>100)throw new Error("semantic_source_budget");
      const documents = (await db.query<MaintenanceDocument & {storage_ref:string|null;mime:string|null;size_bytes:string|null}>(`SELECT
        id,title,content_state,content_hash,active_chunk_version,storage_ref,mime,size_bytes FROM karda_kb.document
        WHERE kb_id=$1 AND id=ANY($2::uuid[])`,[kbId,input.sources.map(row=>row.documentId)])).rows;
      const texts = new Map<string,string|null>(); let budget = 32*1024*1024,textBudget=MAX_SEMANTIC_TEXT_CHARS;
      for (const doc of documents) {
        const expected = input.sources.find(row=>row.documentId===doc.id)!;
        const size = Number(doc.size_bytes); let text:string|null=null;
        if (doc.content_state==="indexed" && doc.content_hash===expected.contentHash && doc.active_chunk_version===expected.version &&
            doc.storage_ref && doc.size_bytes!==null && Number.isSafeInteger(size) && size>=0 && size<=MAX_SEMANTIC_SOURCE_BYTES) {
          if(size>budget)throw new Error("semantic_source_budget"); budget-=size;
          const bytes=await this.objects.get(doc.storage_ref);
          text=verifiedSourceText({contentState:doc.content_state,activeVersion:doc.active_chunk_version,
            contentHash:doc.content_hash,mime:doc.mime,normalized:parsePathFor(doc.mime??"")==="fast"?null:
              await readSourceSnapshot(async(sql,...values)=>(await db.query(sql,values)).rows,doc.id,expected.version)},bytes?.length===size?bytes:null);
        }
        texts.set(doc.id,text);
        if(text!==null){textBudget-=text.length;if(textBudget<0)throw new Error("semantic_source_budget");}
      }
      const ids=[...new Set(input.relations.flatMap(row=>row.assertionIds))];
      const assertions=(await db.query<MaintenanceAssertion>(`SELECT id,content_state,verification_state,expires_at,valid_until,superseded_by
        FROM karda_kb.assertion WHERE kb_id=$1 AND id=ANY($2::uuid[]) LIMIT 5001`,[kbId,ids])).rows;
      const grounds=(await db.query<MaintenanceGround>(`SELECT e.assertion_id,s.document_id,s.document_version,s.start_offset,s.end_offset,s.excerpt
        FROM karda_kb.evidence e JOIN karda_kb.assertion a ON a.id=e.assertion_id JOIN karda_kb.span s ON s.id=e.span_id
        JOIN karda_kb.document d ON d.id=s.document_id AND d.kb_id=a.kb_id
        WHERE a.kb_id=$1 AND a.id=ANY($2::uuid[]) AND e.stance='supports' AND e.supports_id IS NULL LIMIT 5001`,[kbId,ids])).rows;
      const entities=(await db.query<{id:string;kind:string}>(`SELECT id,kind FROM karda_kb.entity WHERE kb_id=$1 AND id=ANY($2::uuid[]) LIMIT 5001`,
        [kbId,[...new Set(input.relations.flatMap(row=>[row.sourceId,row.targetId]))]])).rows;
      if([assertions,grounds,entities].some(rows=>rows.length>5000))throw new Error("semantic_snapshot_limit");
      return maintenanceReport(input,{generation:head.generation,releaseId:head.id,now,documents,texts,assertions,grounds,
        entityTypes:new Map(entities.map(row=>[row.id,input.entityTypes.get(row.kind)??""])),
        reviewedIds:new Set(loaded.relations.map(row=>row.id))});
    }, true);
  }

  async sourceReadiness(identity:SemanticReadIdentity,kbId:string,query:SourceInspectionQuery={}){
    const params=new URLSearchParams({view:"sources",...Object.fromEntries(Object.entries(query).filter(([,value])=>value!==undefined))});
    query=parseSourceInspectionQuery(params);
    const before=query.before??null,documentId=query.documentId??null;
    return this.write(identity,kbId,"data.write",async db=>{
      const access=await readProductAccess(identity,{$queryRawUnsafe:async<R>(s:string,...v:unknown[])=>(await db.query(s,v)).rows as R,
        $executeRawUnsafe:async()=>{throw new Error("semantic_write_denied");}});
      if(!permits(access,"data.read")||!permits(access,"service.publish"))throw new Error("semantic_write_denied");
      const anchor=before??documentId;
      if(anchor&&(await db.query("SELECT id FROM karda_kb.document WHERE kb_id=$1 AND id=$2",[kbId,anchor])).rowCount!==1)throw new Error("semantic_source_conflict");
      const documents=(await db.query<SourceCandidate>(`SELECT id,title,mime,content_state,active_chunk_version,content_hash,storage_ref,size_bytes
        FROM karda_kb.document WHERE kb_id=$1 AND ($2::uuid IS NULL OR id>$2) AND ($3::uuid IS NULL OR id=$3)
        ORDER BY id LIMIT 21`,[kbId,before,documentId])).rows;
      const more=documents.length>20;if(more)documents.pop();
      const report=await inspectSources(documents,async doc=>{
        const native=doc.mime==="text/plain"||doc.mime==="text/markdown";
        const normalized=native?null:await readSourceSnapshot(async(sql,...values)=>(await db.query(sql,values)).rows,doc.id,doc.active_chunk_version!);
        const bytes=await this.objects.get(doc.storage_ref!);
        const text=verifiedSourceText({activeVersion:doc.active_chunk_version,contentState:doc.content_state,contentHash:doc.content_hash,mime:doc.mime,normalized},bytes?.length===Number(doc.size_bytes)?bytes:null);
        return {text,parserVersion:text===null?null:native?"native_text":normalized?.parserVersion??null};
      },async()=>(await db.query<{now:Date}>("SELECT statement_timestamp() AS now")).rows[0].now.toISOString());
      return {...report,page:{scope:"current_authorized_source_window" as const,limit:20,before,documentId,next:more?documents.at(-1)!.id:null}};
    },true);
  }

  async createCompileTask(identity:SemanticReadIdentity,kbId:string,taskId:string,documentIds?:string[]) {
    if(!UUID.test(taskId))throw new Error("semantic_invalid_task");
    const selected=documentIds===undefined?undefined:compileSourceSelection(documentIds);
    const existing=await this.write(identity,kbId,"data.write",async db=>{
      const row=(await db.query<{id:string;snapshot:CompilerSnapshot}>("SELECT id,snapshot FROM karda_kb.semantic_compile_task WHERE kb_id=$1 AND id=$2 AND created_by=$3",[kbId,taskId,identity.sub])).rows[0];
      if(row){
        if(selected&&semanticValueHash(row.snapshot.sources.map(s=>s.documentId).sort())!==semanticValueHash(selected))throw new Error("semantic_task_conflict");
        return {existing:row.id,sources:[]};
      }
      const sources=(await db.query<{id:string;active_chunk_version:number;content_hash:string}>(`SELECT id,active_chunk_version,content_hash
        FROM karda_kb.document WHERE kb_id=$1 AND content_state='indexed' AND mime=ANY($2::text[])
        AND ($3::uuid[] IS NULL OR id=ANY($3::uuid[])) ORDER BY id LIMIT 101`,[kbId,["text/plain","text/markdown",...SOURCE_FORMATS.map(f=>f.mime)],selected??null])).rows;
      if(selected&&sources.length!==selected.length)throw new Error("semantic_source_selection_changed");
      if(!sources.length)throw new Error("semantic_compile_inputs_required");
      if(sources.length>100)throw new Error("semantic_source_budget");
      return {existing:null,sources:sources.map(s=>({kbId,documentId:s.id,version:s.active_chunk_version,contentHash:s.content_hash}))};
    });
    if(existing.existing)return {taskId:existing.existing,duplicate:true};
    const snapshot=await this.loadCompilerSnapshot(identity,kbId,{...localCompileProfile(),sources:existing.sources});
    if(!snapshot.assertions.length||snapshot.entities.length<2)throw new Error("semantic_compile_inputs_required");
    if(snapshot.entities.some(e=>!snapshot.entityTypes.some(t=>t.kind===e.kind)))throw new Error("semantic_entity_kind_unmapped");
    const snapshotHash=semanticValueHash(snapshot);
    return this.write(identity,kbId,"data.write",async db=>{
      await this.sources(db,decode(kbId,{format:"karda.semantic.release.v1",...snapshot,relations:[]}));
      const inserted=await db.query(`INSERT INTO karda_kb.semantic_compile_task(id,kb_id,created_by,snapshot,snapshot_hash)
        VALUES($1,$2,$3,$4,$5) ON CONFLICT(id) DO NOTHING RETURNING id`,[taskId,kbId,identity.sub,snapshot,snapshotHash]);
      if(!inserted.rowCount){
        const previous=(await db.query<{snapshot_hash:string}>("SELECT snapshot_hash FROM karda_kb.semantic_compile_task WHERE kb_id=$1 AND id=$2 AND created_by=$3",[kbId,taskId,identity.sub])).rows[0];
        if(!previous||previous.snapshot_hash!==snapshotHash)throw new Error("semantic_task_conflict");
      }
      return {taskId,duplicate:!inserted.rowCount};
    });
  }

  async listCompileTasks(identity:SemanticReadIdentity,kbId:string):Promise<CompileTaskRow[]> {
    return this.write(identity,kbId,"data.write",async db=>{
      await db.query(`UPDATE karda_kb.semantic_compile_task SET state='failed',lease_id=NULL,lease_until=NULL,
        error_code='semantic_attempts_exhausted',updated_at=now() WHERE kb_id=$1 AND created_by=$2
        AND state='running' AND attempt=3 AND lease_until<clock_timestamp()`,[kbId,identity.sub]);
      return (await db.query<CompileTaskRow>(`SELECT id,state,attempt,run_id,error_code,result,
        CASE WHEN state='needs_review' THEN jsonb_build_object('entities',snapshot->'entities','assertions',snapshot->'assertions') ELSE NULL END AS context
        FROM karda_kb.semantic_compile_task WHERE kb_id=$1 AND created_by=$2 ORDER BY created_at DESC,id DESC LIMIT 50`,[kbId,identity.sub])).rows.map(row=>({...row,resultHash:semanticValueHash(row.result)}));
    });
  }

  /** Lists carry metadata only; candidate/source text is loaded for one task. */
  async browseCompileTasks(identity:SemanticReadIdentity,kbId:string,request:CompileTaskQuery={}) {
    const query=parseCompileTaskQuery(new URLSearchParams(Object.entries(request).filter((entry):entry is [string,string]=>entry[1]!==undefined)));
    return this.write(identity,kbId,"data.write",async db=>{
      await db.query(`UPDATE karda_kb.semantic_compile_task SET state='failed',lease_id=NULL,lease_until=NULL,
        error_code='semantic_attempts_exhausted',updated_at=now() WHERE kb_id=$1 AND created_by=$2
        AND state='running' AND attempt=3 AND lease_until<clock_timestamp()`,[kbId,identity.sub]);
      if(query.before&&(await db.query("SELECT id FROM karda_kb.semantic_compile_task WHERE kb_id=$1 AND created_by=$2 AND id=$3",[kbId,identity.sub,query.before])).rowCount!==1)
        throw new Error("semantic_task_unavailable");
      const rows=(await db.query<ClaimedCompileTask>(`SELECT id,state,attempt,run_id,error_code,created_at,updated_at,lease_until,
        (attempt<3 AND (state IN ('queued','failed','suspended') OR (state='running' AND lease_until<clock_timestamp()))) AS "canRetry",
        CASE WHEN $3::uuid IS NOT NULL THEN result ELSE '{}'::jsonb END AS result,
        CASE WHEN $3::uuid IS NOT NULL THEN snapshot ELSE NULL END AS snapshot,snapshot_hash
        FROM karda_kb.semantic_compile_task WHERE kb_id=$1 AND created_by=$2
          AND ($3::uuid IS NULL OR id=$3) AND ($4::text IS NULL OR state=$4)
          AND ($5::uuid IS NULL OR (created_at,id)<(SELECT created_at,id FROM karda_kb.semantic_compile_task WHERE kb_id=$1 AND created_by=$2 AND id=$5))
        ORDER BY created_at DESC,id DESC LIMIT 21`,[kbId,identity.sub,query.taskId??null,query.state??null,query.before??null])).rows;
      if(query.taskId&&!rows.length)throw new Error("semantic_task_unavailable");
      const more=rows.length>20;if(more)rows.pop();
      const tasks:CompileTaskRow[]=[];
      for(const row of rows){
        const {snapshot,snapshot_hash,...metadata}=row;
        let current:CompilerSnapshot|null=null;
        if(query.taskId){
          if(semanticValueHash(snapshot)!==snapshot_hash)throw new Error("semantic_corrupt_compile");
          try{const loaded=await this.compilerSnapshot(db,kbId,snapshot);if(semanticValueHash(loaded)===snapshot_hash)current=loaded;}
          catch(error){if(!(error instanceof Error)||error.message!=="semantic_source_changed")throw error;}
        }
        const result=current?row.result:{};
        if(Buffer.byteLength(JSON.stringify([result,current?.entities,current?.assertions]))>2*1024*1024)throw new Error("semantic_snapshot_limit");
        tasks.push({...metadata,result,sourceState:query.taskId?(current?"current":"changed"):"not_loaded",
          ...(current?{sourceIds:current.sources.map(s=>s.documentId).sort()}:{}),
          ...(current?{resultHash:semanticValueHash(result),context:{entities:current.entities,assertions:current.assertions}}:{})});
      }
      return {tasks,next:more?rows.at(-1)!.id:null};
    },true);
  }

  async claimCompileTask(identity:SemanticReadIdentity,kbId:string,taskId:string):Promise<ClaimedCompileTask|null> {
    if(!UUID.test(taskId))throw new Error("semantic_invalid_task");
    return this.write(identity,kbId,"data.write",async db=>{
      const row=(await db.query<ClaimedCompileTask>(`UPDATE karda_kb.semantic_compile_task
        SET state='running',attempt=attempt+1,lease_id=$4,lease_until=clock_timestamp()+interval '5 minutes',error_code=NULL,updated_at=now()
        WHERE kb_id=$1 AND id=$2 AND created_by=$3 AND attempt<3
          AND (state IN ('queued','failed','suspended') OR (state='running' AND lease_until<clock_timestamp()))
        RETURNING id,state,attempt,run_id,error_code,result,snapshot,snapshot_hash,lease_id`,[kbId,taskId,identity.sub,randomUUID()])).rows[0];
      if(row)return row;
      const found=(await db.query<{id:string}>("SELECT id FROM karda_kb.semantic_compile_task WHERE kb_id=$1 AND id=$2 AND created_by=$3",[kbId,taskId,identity.sub])).rows[0];
      if(!found)throw new Error("semantic_task_unavailable");
      return null;
    });
  }

  async settleCompileTask(identity:SemanticReadIdentity,kbId:string,taskId:string,leaseId:string,
    state:"needs_review"|"failed"|"suspended",result:Record<string,unknown>,errorCode:string|null) {
    if(!UUID.test(taskId)||!UUID.test(leaseId)||!["needs_review","failed","suspended"].includes(state)||
      (errorCode!==null&&!/^[a-z0-9_]{1,128}$/.test(errorCode)))throw new Error("semantic_invalid_task");
    semanticValueHash(result);
    return this.write(identity,kbId,"data.write",async db=>{
      const updated=await db.query(`UPDATE karda_kb.semantic_compile_task SET state=$5,result=$6,error_code=$7,
        lease_id=NULL,lease_until=NULL,updated_at=now() WHERE kb_id=$1 AND id=$2 AND created_by=$3 AND lease_id=$4
        AND state='running' AND lease_until>clock_timestamp() RETURNING id`,[kbId,taskId,identity.sub,leaseId,state,result,errorCode]);
      if(!updated.rowCount)throw new Error("semantic_task_stale_lease");
    });
  }

  /** Select only admitted relations. The immutable task result retains excluded alternatives and diagnostics. */
  async resolveCompileTask(identity:SemanticReadIdentity,kbId:string,request:{taskId:string;resultHash:string;relationIds:string[];note:string}) {
    const input=structuredClone(request);
    if(!UUID.test(input.taskId)||!HASH.test(input.resultHash)||!Array.isArray(input.relationIds)||
      !input.relationIds.length||input.relationIds.length>200||input.relationIds.some(id=>!UUID.test(id))||
      new Set(input.relationIds).size!==input.relationIds.length||typeof input.note!=="string"||!input.note.trim()||input.note.length>10000)
      throw new Error("semantic_invalid_selection");
    input.relationIds.sort();input.note=input.note.trim();
    const selection={resultHash:input.resultHash,relationIds:input.relationIds,note:input.note,reviewer:identity.sub};
    const selectionHash=semanticValueHash(selection);
    const task=await this.write(identity,kbId,"service.publish",async db=>{
      const row=(await db.query<ClaimedCompileTask>(`SELECT id,state,run_id,result,snapshot,snapshot_hash
        FROM karda_kb.semantic_compile_task WHERE kb_id=$1 AND id=$2 AND created_by=$3`,[kbId,input.taskId,identity.sub])).rows[0];
      if(!row)throw new Error("semantic_task_unavailable");
      return row;
    });
    if(task.state==="completed") {
      if(task.result.selectionHash!==selectionHash)throw new Error("semantic_selection_conflict");
      return {runId:task.run_id!,duplicate:true};
    }
    if(task.state!=="needs_review"||semanticValueHash(task.result)!==input.resultHash)throw new Error("semantic_selection_conflict");
    const current=await this.loadCompilerSnapshot(identity,kbId,task.snapshot);
    if(semanticValueHash(current)!==task.snapshot_hash)throw new Error("semantic_task_source_changed");
    const compilation=task.result.compilation as Compilation;
    if(!compilation||compilation.snapshotHash!==task.snapshot_hash)throw new Error("semantic_corrupt_compile");
    const relations=compilation.payload.relations.filter(r=>input.relationIds.includes(r.id));
    if(relations.length!==input.relationIds.length)throw new Error("semantic_invalid_selection");
    if(compilation.conflicts.some(group=>group.relationIds.filter(id=>input.relationIds.includes(id)).length>1))
      throw new Error("semantic_selection_conflict");
    const configHash=semanticValueHash({version:"human-selection-v1",selectionHash});
    return this.recordCompile(identity,kbId,{taskKey:semanticValueHash({taskId:task.id,selectionHash}),configHash,
      payload:{...compilation.payload,relations},resolution:{taskId:task.id,resultHash:input.resultHash,selectionHash,selection}});
  }

  /** Reviewer-only keyset pagination; UUID order is stable, not chronological. */
  async listCompiles(identity: SemanticReadIdentity, kbId: string, limit = 20, before?: string) {
    if (!Number.isInteger(limit) || limit < 1 || limit > 50 || (before !== undefined && !UUID.test(before)))
      throw new Error("semantic_invalid_query");
    return this.write(identity, kbId, "service.publish", async db => {
      const rows = (await db.query<{id: string; status: string; created_at: Date; created_by: string; relation_count: number}>(`
        SELECT id,status,created_at,created_by,jsonb_array_length(candidates->'relations') AS relation_count
        FROM karda_kb.semantic_compile_run WHERE kb_id=$1 AND ($2::uuid IS NULL OR id<$2::uuid)
        ORDER BY id DESC LIMIT $3`, [kbId, before ?? null, limit + 1])).rows;
      return { items: rows.slice(0, limit), next: rows.length > limit ? rows[limit - 1].id : null };
    });
  }

  /** Current review revisions include stale decisions so the next CAS is usable. */
  async inspectCompile(identity: SemanticReadIdentity, kbId: string, runId: string) {
    if (!UUID.test(runId)) throw new Error("semantic_invalid_compile");
    return this.write(identity, kbId, "service.publish", async db => {
      const { row, input } = await compiled(db, kbId, runId);
      const reviews = await latestReviews(db, kbId, input);
      const notes = (await db.query<{id: string; reviewer_sub: string; note: string; created_at: Date}>(`
        SELECT id,reviewer_sub,note,created_at FROM karda_kb.semantic_review WHERE kb_id=$1 AND id=ANY($2::uuid[])`,
        [kbId, reviews.map(r => r.id)])).rows;
      const ids = [...new Set(input.relations.flatMap(r => [r.sourceId, r.targetId]))];
      const entities = (await db.query<{id: string; kind: string; name: string}>(`
        SELECT id,kind,name FROM karda_kb.entity WHERE kb_id=$1 AND id=ANY($2::uuid[]) ORDER BY id`, [kbId, ids])).rows;
      const supports = [...new Set(input.relations.flatMap(r => r.assertionIds))];
      const evidence = (await db.query<{assertion_id: string; statement: string; document_id: string; document_version: number;
        start_offset: number; end_offset: number; excerpt: string}>(`
        SELECT a.id AS assertion_id,a.statement,s.document_id,s.document_version,s.start_offset,s.end_offset,s.excerpt
        FROM karda_kb.assertion a JOIN karda_kb.evidence e ON e.assertion_id=a.id
        JOIN karda_kb.span s ON s.id=e.span_id JOIN karda_kb.document d ON d.id=s.document_id AND d.kb_id=a.kb_id
        WHERE a.kb_id=$1 AND a.id=ANY($2::uuid[]) AND e.stance='supports' AND e.supports_id IS NULL
        ORDER BY a.id,e.id LIMIT 5001`, [kbId, supports])).rows;
      if (evidence.length > 5000) throw new Error("semantic_snapshot_limit");
      return { runId: row.id, payload: row.candidates, entities, evidence, evidenceStatus: "historical_unvalidated" as const,
        relations: input.relations.map(relation => {
        const review = reviews.find(r => r.subject_key === `relation/${relation.id}`);
        const matches = review?.subject_hash === subjectHash(input, relation.id);
        return { relationId: relation.id, revision: review?.revision ?? 0,
          state: review ? matches ? review.decision : "stale" : "pending",
          review: review ? { ...review, ...notes.find(note => note.id === review.id) } : null };
      }) };
    });
  }

  /** No writes: check real grounds and show the full replacement's removals. */
  async preview(identity: SemanticReadIdentity, kbId: string, runId: string, eventId: string) {
    if (!UUID.test(runId) || !UUID.test(eventId)) throw new Error("semantic_invalid_compile");
    return this.write(identity, kbId, "service.publish", async db => {
      const { row, input } = await compiled(db, kbId, runId);
      const reviews = await latestReviews(db, kbId, input); acceptedReviews(input, reviews);
      await validateGrounds(db, input, await this.sources(db, input));
      const head = (await db.query<{generation: number; payload: PublicationCommand}>(`
        SELECT h.generation,r.payload FROM karda_kb.semantic_release_head h JOIN karda_kb.semantic_release r
        ON r.kb_id=h.kb_id AND r.id=h.release_id AND r.generation=h.generation WHERE h.kb_id=$1`, [kbId])).rows[0];
      const previousInput=head?decodeSemanticRelease(head.payload):{relations:[],sources:[]};
      const previous = previousInput.relations;
      const impact=publicationImpact(previousInput,input);
      const prepared = preparePublication({ kbId, eventId, expectedGeneration: head?.generation ?? 0,
        sourceRevision: row.input_hash, schemaRevision: semanticValueHash({ schema: input.schema, entityTypes: row.candidates.entityTypes }),
        reviewRevision: semanticValueHash(reviews), payload: { ...row.candidates, compileRunId: runId } });
      return { runId, eventId, expectedGeneration: prepared.command.expectedGeneration, fingerprint: prepared.fingerprint,
        relationCount: input.relations.length, impact,changes: {
          added: input.relations.filter(r => !previous.some(p => p.id === r.id)).map(r => r.id),
          removed: previous.filter(p => !input.relations.some(r => r.id === p.id)).map(p => p.id),
          changed: input.relations.filter(r => previous.some(p => p.id === r.id && semanticValueHash(p) !== semanticValueHash(r))).map(r => r.id),
        } };
    });
  }

  /** Reconstruct server-owned payload; a browser supplies only a preview token. */
  async submitPreview(identity: SemanticReadIdentity, kbId: string, token: {
    runId: string; eventId: string; expectedGeneration: number; fingerprint: string;
  }): Promise<PublicationReceipt> {
    token = { ...token };
    if (!HASH.test(token.fingerprint)) throw new Error("semantic_invalid_preview");
    const command = await this.plan(identity, kbId, token.runId, token.eventId, token.expectedGeneration);
    if (preparePublication(command).fingerprint !== token.fingerprint) throw new Error("semantic_preview_changed");
    return this.publish(identity, command);
  }

  /** Load before model egress, requiring both source write and AI permission.
   * The model runs after transaction release, never while holding source locks.
   */
  async loadCompilerSnapshot(identity: SemanticReadIdentity, kbId: string, specification: {
    schema: CompilerSnapshot["schema"]; entityTypes: CompilerSnapshot["entityTypes"]; sources: CompilerSnapshot["sources"];
  }): Promise<CompilerSnapshot> {
    identity={...identity,roles:[...identity.roles]};
    const spec=structuredClone(specification);
    const input=decode(kbId,{format:"karda.semantic.release.v1",...spec,relations:[]});
    return this.write(identity,kbId,"data.write",async db=>{
      const access=await readProductAccess(identity,{
        $queryRawUnsafe:async <R>(statement:string,...values:unknown[])=>(await db.query(statement,values)).rows as R,
        $executeRawUnsafe:async()=>{throw new Error("semantic_role_read_only");},
      });
      if(!permits(access,"ai.use"))throw new Error("semantic_write_denied");
      return this.compilerSnapshot(db,kbId,spec);
    });
  }

  private async compilerSnapshot(db:PoolClient,kbId:string,specification:{schema:CompilerSnapshot["schema"];entityTypes:CompilerSnapshot["entityTypes"];sources:CompilerSnapshot["sources"]}):Promise<CompilerSnapshot>{
      const spec=structuredClone(specification);
      const input=decode(kbId,{format:"karda.semantic.release.v1",...spec,relations:[]});
      const texts=await this.sources(db,input);
      const entities=(await db.query<{id:string;kb_id:string;kind:string;name:string;aliases:string[]}>(`SELECT id,kb_id,kind,name,aliases
        FROM karda_kb.entity WHERE kb_id=$1 ORDER BY id LIMIT 1001`,[kbId])).rows;
      const grounds=(await db.query<{id:string;statement:string;document_id:string;document_version:number;start_offset:number;end_offset:number;excerpt:string}>(`
        SELECT a.id,a.statement,s.document_id,s.document_version,s.start_offset,s.end_offset,s.excerpt
        FROM karda_kb.assertion a JOIN karda_kb.evidence e ON e.assertion_id=a.id
        JOIN karda_kb.span s ON s.id=e.span_id JOIN karda_kb.document d ON d.id=s.document_id AND d.kb_id=a.kb_id
        WHERE a.kb_id=$1 AND a.content_state='indexed' AND a.verification_state='verified' AND a.superseded_by IS NULL
          AND (a.expires_at IS NULL OR a.expires_at>clock_timestamp()) AND (a.valid_until IS NULL OR a.valid_until>clock_timestamp())
          AND e.stance='supports' AND e.supports_id IS NULL AND d.id=ANY($2::uuid[]) AND d.content_state='indexed'
        ORDER BY a.id,e.id LIMIT 3201`,[kbId,spec.sources.map(s=>s.documentId)])).rows;
      if(entities.length>1000||grounds.length>3200)throw new Error("semantic_snapshot_limit");
      const assertions=new Map<string,CompilerSnapshot["assertions"][number]>();
      for(const row of grounds){
        const source=input.sources.find(s=>s.documentId===row.document_id&&s.version===row.document_version),text=texts.get(row.document_id);
        if(!source||text===undefined||!matchesSourceSpan(text,row.start_offset,row.end_offset,row.excerpt))continue;
        const assertion=assertions.get(row.id)??{id:row.id,kbId,statement:row.statement,evidence:[]};
        assertion.evidence.push({documentId:row.document_id,version:row.document_version,start:row.start_offset,end:row.end_offset,excerpt:row.excerpt});
        assertions.set(row.id,assertion);
      }
      return freezeCompilerSnapshot({kbId,schema:input.schema,entityTypes:spec.entityTypes,sources:input.sources,
        entities:entities.map(e=>({id:e.id,kbId:e.kb_id,kind:e.kind,name:e.name,aliases:e.aliases})),assertions:[...assertions.values()]});
  }

  private async write<T>(identity: SemanticReadIdentity, kbId: string, permission: ProductPermission,
    work: (db: PoolClient) => Promise<T>, snapshot = false): Promise<T> {
    const actor={...identity,roles:[...identity.roles]};
    return retrySemanticTransaction(()=>this.writeAttempt(actor,kbId,permission,work,snapshot));
  }

  private async writeAttempt<T>(identity:SemanticReadIdentity,kbId:string,permission:ProductPermission,
    work:(db:PoolClient)=>Promise<T>,snapshot:boolean):Promise<T>{
    identity = { ...identity, roles: [...identity.roles] };
    if (!UUID.test(kbId) || !UUID.test(identity.workspaceId) ||
      !/^usr_[a-f0-9-]{36}$/i.test(identity.sub) || !/^[a-z][a-z0-9_-]{0,31}$/.test(identity.productCode))
      throw new Error("semantic_invalid_scope");
    if (await this.admitPlatform(identity) !== true) throw new Error("semantic_write_denied");
    const db = await this.pool.connect();
    try {
      await db.query(snapshot ? "BEGIN ISOLATION LEVEL REPEATABLE READ" : "BEGIN");
      // Same lock as the product role editor, then one lock for all semantic
      // writes in this library (including review inserts and first publication).
      await db.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [`karda:roles:${identity.workspaceId}`]);
      await db.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [`karda:semantic:${kbId}`]);
      await db.query("SELECT id FROM local_authz.member WHERE workspace_id=$1 AND sub=$2 FOR SHARE", [identity.workspaceId, identity.sub]);
      const sql: RoleSql = {
        $queryRawUnsafe: async <R>(statement: string, ...values: unknown[]) => (await db.query(statement, values)).rows as R,
        $executeRawUnsafe: async () => { throw new Error("semantic_role_read_only"); },
      };
      const access = await readProductAccess(identity, sql);
      if (!permits(access, "product.enter") || !permits(access, permission)) throw new Error("semantic_write_denied");
      const library = await db.query(`SELECT id FROM karda_kb.knowledge_base WHERE id=$1 AND workspace_id=$2
        AND owner_type='user' AND owner_sub=$3 AND deleted_at IS NULL FOR SHARE`, [kbId, identity.workspaceId, identity.sub]);
      if (library.rowCount !== 1) throw new Error("semantic_write_denied");
      const result = await work(db);
      await db.query("COMMIT"); return result;
    } catch (error) { await db.query("ROLLBACK"); throw error; }
    finally { db.release(); }
  }

  /** Validates current physical inputs; hashes and offsets use the same bytes. */
  private async sources(db: PoolClient, input: PublishedRelationInput): Promise<Map<string, string>> {
    if (input.sources.length > 100) throw new Error("semantic_source_budget");
    const texts = new Map<string, string>(); let budget = 32 * 1024 * 1024,textBudget=MAX_SEMANTIC_TEXT_CHARS;
    for (const source of [...input.sources].sort((a, b) => a.documentId.localeCompare(b.documentId))) {
      const row = (await db.query<{active_chunk_version: number; content_state: string; content_hash: string;
        mime: string; storage_ref: string; size_bytes: string}>(`SELECT active_chunk_version,content_state,content_hash,mime,storage_ref,size_bytes
        FROM karda_kb.document WHERE kb_id=$1 AND id=$2 FOR SHARE`, [source.kbId, source.documentId])).rows[0];
      const size = Number(row?.size_bytes);
      if (!row || row.active_chunk_version !== source.version || row.content_hash !== source.contentHash ||
        row.content_state !== "indexed" || !row.storage_ref || !Number.isSafeInteger(size) || size < 0 || size > MAX_SEMANTIC_SOURCE_BYTES)
        throw new Error("semantic_source_changed");
      if (size > budget) throw new Error("semantic_source_budget"); budget -= size;
      const bytes = await this.objects.get(row.storage_ref);
      const text = verifiedSourceText({ activeVersion: row.active_chunk_version, contentState: row.content_state,
        mime: row.mime, contentHash: row.content_hash, normalized:parsePathFor(row.mime??"")==="fast"?null:
          await readSourceSnapshot(async(sql,...values)=>(await db.query(sql,values)).rows,source.documentId,source.version) }, bytes?.length === size ? bytes : null);
      if (text === null) throw new Error("semantic_source_changed");
      textBudget-=text.length;if(textBudget<0)throw new Error("semantic_source_budget");
      texts.set(source.documentId, text);
    }
    return texts;
  }

  /** A validated compile is still a candidate snapshot, never a publication. */
  async recordCompile(identity: SemanticReadIdentity, kbId: string, input: {
    taskKey: string; configHash: string; payload: SemanticReleasePayload;
    task?:{id:string;leaseId:string};
    resolution?:{taskId:string;resultHash:string;selectionHash:string;selection:Record<string,unknown>};
  }): Promise<{ runId: string; duplicate: boolean }> {
    if (!HASH.test(input.taskKey) || !HASH.test(input.configHash)) throw new Error("semantic_invalid_compile");
    const actor = identity.sub;
    const taskKey = input.taskKey, configHash = input.configHash, payload = frozenPayload(kbId, input.payload), decoded = decode(kbId, payload);
    const definition = { schema: payload.schema, entityTypes: payload.entityTypes };
    const definitionHash = semanticValueHash(definition), inputHash = semanticValueHash(decoded.sources);
    const task=input.task?{...input.task}:null;
    const resolution=input.resolution?structuredClone(input.resolution):null;
    if(resolution&&(!UUID.test(resolution.taskId)||!HASH.test(resolution.resultHash)||!HASH.test(resolution.selectionHash)||task))throw new Error("semantic_invalid_selection");
    if(task&&(!UUID.test(task.id)||!UUID.test(task.leaseId)))throw new Error("semantic_invalid_task");
    return this.write(identity, kbId, resolution?"service.publish":"data.write", async db => {
      if(resolution){
        const row=(await db.query<CompileTaskRow>(`SELECT state,result,run_id FROM karda_kb.semantic_compile_task
          WHERE kb_id=$1 AND id=$2 AND created_by=$3 FOR UPDATE`,[kbId,resolution.taskId,actor])).rows[0];
        if(row?.state==="completed"&&row.result.selectionHash===resolution.selectionHash)return {runId:row.run_id!,duplicate:true};
        if(!row||row.state!=="needs_review"||semanticValueHash(row.result)!==resolution.resultHash)throw new Error("semantic_selection_conflict");
      }
      if(task){
        const fence=await db.query(`SELECT id FROM karda_kb.semantic_compile_task WHERE kb_id=$1 AND id=$2 AND created_by=$3
          AND state='running' AND lease_id=$4 AND lease_until>clock_timestamp() FOR UPDATE`,[kbId,task.id,actor,task.leaseId]);
        if(!fence.rowCount)throw new Error("semantic_task_stale_lease");
      }
      const complete=async(runId:string)=>{
        if(resolution)await db.query(`UPDATE karda_kb.semantic_compile_task SET state='completed',run_id=$3,
          result=result || $4::jsonb,error_code=NULL,updated_at=now() WHERE kb_id=$1 AND id=$2`,
          [kbId,resolution.taskId,runId,JSON.stringify({selectionHash:resolution.selectionHash,selection:resolution.selection})]);
        if(task){const settled=await db.query(`UPDATE karda_kb.semantic_compile_task SET state='completed',run_id=$3,lease_id=NULL,
          lease_until=NULL,error_code=NULL,result='{}',updated_at=now() WHERE kb_id=$1 AND id=$2 AND lease_id=$4
          AND lease_until>clock_timestamp() RETURNING id`,[kbId,task.id,runId,task.leaseId]);
          if(!settled.rowCount)throw new Error("semantic_task_stale_lease");}
      };
      await this.sources(db, decoded);
      await db.query(`INSERT INTO karda_kb.semantic_schema_version(kb_id,namespace,schema_id,version,definition_hash,definition)
        VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(kb_id,namespace,schema_id,version) DO NOTHING`,
        [kbId, decoded.schema.namespace, decoded.schema.schemaId, decoded.schema.version, definitionHash, definition]);
      const schema = (await db.query<{id: string; definition_hash: string; definition: unknown}>(`SELECT id,definition_hash,definition
        FROM karda_kb.semantic_schema_version WHERE kb_id=$1 AND namespace=$2 AND schema_id=$3 AND version=$4`,
        [kbId, decoded.schema.namespace, decoded.schema.schemaId, decoded.schema.version])).rows[0];
      if (schema.definition_hash !== definitionHash || semanticValueHash(schema.definition) !== definitionHash)
        throw new Error("semantic_schema_version_conflict");
      const previous = (await db.query<{id: string; candidates: unknown; config_hash: string}>(`SELECT id,candidates,config_hash
        FROM karda_kb.semantic_compile_run WHERE kb_id=$1 AND task_key=$2`, [kbId, taskKey])).rows[0];
      if (previous) {
        if (semanticValueHash(previous.candidates) !== semanticValueHash(payload) || previous.config_hash !== configHash)
          throw new Error("semantic_compile_task_conflict");
        await complete(previous.id);return { runId: previous.id, duplicate: true };
      }
      const runId = randomUUID();
      await db.query(`INSERT INTO karda_kb.semantic_compile_run(id,kb_id,schema_version_id,task_key,input_hash,config_hash,
        source_manifest,candidates,status,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,'validated',$9)`,
        [runId, kbId, schema.id, taskKey, inputHash, configHash, JSON.stringify(decoded.sources), payload, actor]);
      await complete(runId);return { runId, duplicate: false };
    });
  }

  async reviewRelation(identity: SemanticReadIdentity, kbId: string, request: {
    runId: string; relationId: string; expectedRevision: number; decision: "accept" | "revise" | "reject"; note: string;
  }): Promise<{ reviewId: string; revision: number }> {
    const input = { ...request }, actor = identity.sub;
    if (!UUID.test(input.runId) || !UUID.test(input.relationId) || !Number.isSafeInteger(input.expectedRevision) ||
      input.expectedRevision < 0 || input.expectedRevision >= 2147483647 || !["accept", "revise", "reject"].includes(input.decision) ||
      typeof input.note !== "string" || !input.note.trim() || [...input.note].length > 10000) throw new Error("semantic_invalid_review");
    return this.write(identity, kbId, "service.publish", async db => {
      const compiledInput = (await compiled(db, kbId, input.runId)).input;
      if (!compiledInput.relations.some(row => row.id === input.relationId)) throw new Error("semantic_relation_missing");
      const subjectKey = `relation/${input.relationId}`;
      const previous = (await latestReviews(db, kbId, compiledInput)).find(row => row.subject_key === subjectKey);
      if ((previous?.revision ?? 0) !== input.expectedRevision) throw new Error("semantic_review_stale_revision");
      const reviewId = randomUUID(), revision = input.expectedRevision + 1;
      await db.query(`INSERT INTO karda_kb.semantic_review(id,kb_id,subject_key,revision,decision,subject_hash,reviewer_sub,note)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8)`, [reviewId, kbId, subjectKey, revision, input.decision,
        subjectHash(compiledInput, input.relationId), actor, input.note.trim()]);
      return { reviewId, revision };
    });
  }

  /** Captures a publish plan. Later writes cannot silently change this command. */
  async plan(identity: SemanticReadIdentity, kbId: string, runId: string, eventId: string, expectedGeneration: number): Promise<PublicationCommand> {
    if (!UUID.test(runId)) throw new Error("semantic_invalid_compile");
    return this.write(identity, kbId, "service.publish", async db => {
      const { row, input } = await compiled(db, kbId, runId);
      const reviews = await latestReviews(db, kbId, input); acceptedReviews(input, reviews);
      return preparePublication({ kbId, eventId, expectedGeneration, sourceRevision: row.input_hash,
        schemaRevision: semanticValueHash({ schema: input.schema, entityTypes: row.candidates.entityTypes }),
        reviewRevision: semanticValueHash(reviews), payload: { ...row.candidates, compileRunId: runId } }).command;
    });
  }

  async publish(identity: SemanticReadIdentity, request: PublicationCommand): Promise<PublicationReceipt> {
    const { command, fingerprint } = preparePublication(request), input = decodeSemanticRelease(command), actor = identity.sub;
    const runId = (command.payload as {compileRunId?: string}).compileRunId;
    if (typeof runId !== "string" || !UUID.test(runId)) throw new Error("semantic_invalid_compile");
    return this.write(identity, command.kbId, "service.publish", async db => {
      const previous = (await db.query<{fingerprint: string; release_id: string; generation: number}>(`SELECT fingerprint,release_id,generation
        FROM karda_kb.semantic_event_receipt WHERE kb_id=$1 AND event_id=$2`, [command.kbId, command.eventId])).rows[0];
      if (previous) {
        if (previous.fingerprint !== fingerprint) throw new Error("publication_event_conflict");
        return { releaseId: previous.release_id, generation: previous.generation, duplicate: true };
      }
      const head = (await db.query<{generation: number}>("SELECT generation FROM karda_kb.semantic_release_head WHERE kb_id=$1 FOR UPDATE", [command.kbId])).rows[0];
      if ((head?.generation ?? 0) !== command.expectedGeneration) throw new Error("publication_stale_generation");
      const { row } = await compiled(db, command.kbId, runId);
      if (semanticValueHash(command.payload) !== semanticValueHash({ ...row.candidates, compileRunId: runId }))
        throw new Error("semantic_compile_payload_mismatch");
      const reviews = await latestReviews(db, command.kbId, input); acceptedReviews(input, reviews);
      if (row.input_hash !== command.sourceRevision || semanticValueHash(reviews) !== command.reviewRevision ||
        semanticValueHash({ schema: input.schema, entityTypes: row.candidates.entityTypes }) !== command.schemaRevision)
        throw new Error("publication_authority_changed");
      const texts = await this.sources(db, input);
      await validateGrounds(db, input, texts);
      const releaseId = randomUUID(), generation = command.expectedGeneration + 1;
      await db.query(`INSERT INTO karda_kb.semantic_release(id,kb_id,generation,schema_version_id,compile_run_id,fingerprint,payload,created_by)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8)`, [releaseId, command.kbId, generation, row.schema_version_id, runId, fingerprint, command, actor]);
      for (const relation of input.relations) {
        await db.query(`INSERT INTO karda_kb.semantic_relation(kb_id,release_id,relation_id,type,source_id,target_id)
          VALUES($1,$2,$3,$4,$5,$6)`, [command.kbId, releaseId, relation.id, relation.type, relation.sourceId, relation.targetId]);
        for (const assertionId of relation.assertionIds) await db.query(`INSERT INTO karda_kb.semantic_relation_assertion(kb_id,release_id,relation_id,assertion_id)
          VALUES($1,$2,$3,$4)`, [command.kbId, releaseId, relation.id, assertionId]);
      }
      for (const source of input.sources) await db.query(`INSERT INTO karda_kb.semantic_release_source(kb_id,release_id,document_id,document_version,content_hash)
        VALUES($1,$2,$3,$4,$5)`, [command.kbId, releaseId, source.documentId, source.version, source.contentHash]);
      for (const review of reviews) await db.query("INSERT INTO karda_kb.semantic_release_review(kb_id,release_id,review_id) VALUES($1,$2,$3)", [command.kbId, releaseId, review.id]);
      const switched = await db.query(`INSERT INTO karda_kb.semantic_release_head(kb_id,generation,release_id) VALUES($1,$2,$3)
        ON CONFLICT(kb_id) DO UPDATE SET generation=EXCLUDED.generation,release_id=EXCLUDED.release_id,updated_at=now()
        WHERE semantic_release_head.generation=$4 RETURNING generation`, [command.kbId, generation, releaseId, command.expectedGeneration]);
      if (switched.rowCount !== 1) throw new Error("publication_stale_generation");
      await db.query(`INSERT INTO karda_kb.semantic_event_receipt(kb_id,event_id,fingerprint,release_id,generation) VALUES($1,$2,$3,$4,$5)`,
        [command.kbId, command.eventId, fingerprint, releaseId, generation]);
      return { releaseId, generation, duplicate: false };
    });
  }
}

/** Check every asserted edge against live same-library entities and support. */
async function validateGrounds(db: PoolClient, input: PublishedRelationInput, texts: Map<string, string>): Promise<void> {
  if (!input.relations.length) return;
  const kb = input.relations[0].kbId;
  const ids = [...new Set(input.relations.flatMap(row => [row.sourceId, row.targetId]))];
  const supports = [...new Set(input.relations.flatMap(row => row.assertionIds))];
  if (ids.length > 5000 || supports.length > 5000 || input.relations.reduce((n,r) => n + r.assertionIds.length, 0) > 5000)
    throw new Error("semantic_snapshot_limit");
  // Evidence/span have no UPDATE grant, so tuple locks would require weakening
  // their immutable-column policy. Their existing DELETE grant permits SHARE
  // table locks instead. This conservative publication lock blocks concurrent
  // support removal/insertion until commit; readers remain nonblocking.
  await db.query("LOCK TABLE karda_kb.evidence,karda_kb.span IN SHARE MODE");
  const entities = (await db.query<{id: string; kind: string; name: string}>(`SELECT id,kind,name FROM karda_kb.entity
    WHERE kb_id=$1 AND id=ANY($2::uuid[]) ORDER BY id FOR SHARE`, [kb, ids])).rows;
  const assertions = (await db.query<{id: string; content_state: string; verification_state: string;
    expires_at: Date | null; valid_until: Date | null; superseded_by: string | null}>(`SELECT id,content_state,verification_state,expires_at,valid_until,superseded_by
    FROM karda_kb.assertion WHERE kb_id=$1 AND id=ANY($2::uuid[]) ORDER BY id FOR SHARE`, [kb, supports])).rows;
  const grounds = (await db.query<{id: string; assertion_id: string; document_id: string; document_version: number;
    start_offset: number; end_offset: number; excerpt: string}>(`SELECT e.id,e.assertion_id,s.document_id,s.document_version,s.start_offset,s.end_offset,s.excerpt
    FROM karda_kb.evidence e JOIN karda_kb.span s ON s.id=e.span_id
    WHERE e.assertion_id=ANY($1::uuid[]) AND e.stance='supports' AND e.supports_id IS NULL
    ORDER BY e.id LIMIT 5001`, [supports])).rows;
  if (grounds.length > 5000) throw new Error("semantic_snapshot_limit");
  const now = (await db.query<{now: Date}>("SELECT clock_timestamp() AS now")).rows[0].now.toISOString();
  const snapshot: KnowledgeSnapshot = { entities: entities.flatMap(row => {
    const type = input.entityTypes.get(row.kind); return type ? [{id: row.id, kbId: kb, type, label: row.name}] : [];
  }), relations: input.relations, sources: input.sources.map(row => ({ ...row, current: true, withdrawn: false,
    textLength: texts.get(row.documentId)!.length })), evidence: [], assertions: [] };
  for (const evidence of grounds) {
    const source = input.sources.find(row => row.documentId === evidence.document_id && row.version === evidence.document_version);
    if (source && matchesSourceSpan(texts.get(source.documentId)!, evidence.start_offset, evidence.end_offset, evidence.excerpt))
      snapshot.evidence.push({ id: evidence.id, kbId: kb, documentId: source.documentId, documentVersion: source.version,
        stance: "supports", start: evidence.start_offset, end: evidence.end_offset });
  }
  snapshot.assertions = assertions.map(row => ({ id: row.id, kbId: kb, contentState: row.content_state,
    verificationState: row.verification_state, verificationExpiresAt: row.expires_at?.toISOString() ?? null,
    validFrom: null, validUntil: row.valid_until?.toISOString() ?? null, supersededById: row.superseded_by,
    evidenceIds: grounds.filter(e => e.assertion_id === row.id && snapshot.evidence.some(s => s.id === e.id)).map(e => e.id) }));
  // One seed at a time avoids mistaking a truncated multi-seed neighborhood for
  // invalid input while still applying the exact same read-side eligibility.
  for (const relation of input.relations) {
    const one = { ...snapshot, relations: [relation] };
    const projected = projectNeighborhood(one, input.schema, {visibleKbIds: new Set([kb]), now},
      {seedIds: [relation.sourceId], maxHops: 1, maxNodes: 2, maxEdges: 1});
    if (projected.edges.length !== 1) throw new Error("semantic_unsupported_relation");
  }
}

/** Formal release loader; invoked inside the already-authorized read snapshot. */
export class PostgresFormalSemanticLoader {
  private readonly empty: PublishedRelationInput;
  private readonly definition: string;
  constructor(pinned: Pick<PublishedRelationInput, "schema" | "entityTypes">) {
    this.empty = structuredClone({ ...pinned, relations: [], sources: [] });
    this.definition = semanticDefinitionKey(this.empty);
  }
  async load(db: PoolClient, kbIds: string[]): Promise<PublishedRelationInput> {
    return this.loadVersion(db,kbIds);
  }
  /** Immutable audit metadata only: does not establish source eligibility today. */
  async loadHistorical(db:PoolClient,kbId:string,releaseId:string):Promise<PublishedRelationInput>{
    if(!UUID.test(releaseId))throw new Error("semantic_invalid_scope");
    return this.loadVersion(db,[kbId],releaseId);
  }
  private async loadVersion(db:PoolClient,kbIds:string[],releaseId?:string):Promise<PublishedRelationInput>{
    if (kbIds.length > 50 || new Set(kbIds).size !== kbIds.length || kbIds.some(id => !UUID.test(id))) throw new Error("semantic_invalid_scope");
    const output = structuredClone(this.empty);
    if (!kbIds.length) return output;
    const rows = (await db.query<{kb_id: string; id: string; generation: number; fingerprint: string; payload: PublicationCommand;
      compile_run_id: string; schema_version_id: string}>(releaseId?`SELECT r.kb_id,r.id,r.generation,r.fingerprint,r.payload,r.compile_run_id,r.schema_version_id
      FROM karda_kb.semantic_release r WHERE r.kb_id=ANY($1::uuid[]) AND r.id=$2`:`SELECT h.kb_id,r.id,h.generation,r.fingerprint,r.payload,r.compile_run_id,r.schema_version_id
      FROM karda_kb.semantic_release_head h JOIN karda_kb.semantic_release r
      ON r.kb_id=h.kb_id AND r.id=h.release_id AND r.generation=h.generation WHERE h.kb_id=ANY($1::uuid[]) ORDER BY h.kb_id`, releaseId?[kbIds,releaseId]:[kbIds])).rows;
    if(releaseId&&rows.length!==1)throw new Error("semantic_corrupt_release");
    // Fetch each release's bounded authority tables together in the same snapshot.
    // This removes per-library network round trips without caching any authority.
    type Tables={kb_id:string;id:string;compile:CompileRow|null;definition:{definition_hash:string;definition:unknown}|null;
      relations:{relation_id:string;type:string;source_id:string;target_id:string;origin:string}[];
      supports:{relation_id:string;assertion_id:string}[];sources:{document_id:string;document_version:number;content_hash:string}[];
      bound:ReviewRow[];latest:ReviewRow[]};
    const tables=(await db.query<Tables>(`SELECT requested.kb_id,requested.id,
      (SELECT to_jsonb(c) FROM karda_kb.semantic_compile_run c WHERE c.kb_id=requested.kb_id AND c.id=requested.compile_run_id) AS compile,
      (SELECT jsonb_build_object('definition_hash',s.definition_hash,'definition',s.definition) FROM karda_kb.semantic_schema_version s
        WHERE s.kb_id=requested.kb_id AND s.id=requested.schema_version_id) AS definition,
      COALESCE((SELECT jsonb_agg(t ORDER BY relation_id) FROM (SELECT relation_id,type,source_id,target_id,origin
        FROM karda_kb.semantic_relation WHERE kb_id=requested.kb_id AND release_id=requested.id ORDER BY relation_id LIMIT 5001) t),'[]'::jsonb) AS relations,
      COALESCE((SELECT jsonb_agg(t ORDER BY relation_id,assertion_id) FROM (SELECT relation_id,assertion_id
        FROM karda_kb.semantic_relation_assertion WHERE kb_id=requested.kb_id AND release_id=requested.id ORDER BY relation_id,assertion_id LIMIT 5001) t),'[]'::jsonb) AS supports,
      COALESCE((SELECT jsonb_agg(t ORDER BY document_id) FROM (SELECT document_id,document_version,content_hash
        FROM karda_kb.semantic_release_source WHERE kb_id=requested.kb_id AND release_id=requested.id ORDER BY document_id LIMIT 5001) t),'[]'::jsonb) AS sources,
      COALESCE((SELECT jsonb_agg(t ORDER BY subject_key) FROM (SELECT v.id,v.subject_key,v.subject_hash,v.revision,v.decision
        FROM karda_kb.semantic_release_review b JOIN karda_kb.semantic_review v ON v.kb_id=b.kb_id AND v.id=b.review_id
        WHERE b.kb_id=requested.kb_id AND b.release_id=requested.id ORDER BY v.subject_key LIMIT 5001) t),'[]'::jsonb) AS bound,
      COALESCE((SELECT jsonb_agg(t ORDER BY subject_key) FROM (SELECT DISTINCT ON (subject_key) id,subject_key,subject_hash,revision,decision
        FROM karda_kb.semantic_review WHERE kb_id=requested.kb_id AND subject_key=ANY(
          SELECT 'relation/'||relation_id FROM karda_kb.semantic_relation WHERE kb_id=requested.kb_id AND release_id=requested.id)
        ORDER BY subject_key,revision DESC LIMIT 5001) t),'[]'::jsonb) AS latest
      FROM jsonb_to_recordset($1::jsonb) AS requested(kb_id uuid,id uuid,compile_run_id uuid,schema_version_id uuid)`,
      [JSON.stringify(rows.map(r=>({kb_id:r.kb_id,id:r.id,compile_run_id:r.compile_run_id,schema_version_id:r.schema_version_id})))])).rows;
    const byRelease=new Map(tables.map(t=>[t.id,t]));
    for (const row of rows) {
      const prepared=preparePublication(row.payload),{command,fingerprint}=prepared,input=decodePreparedSemanticRelease(prepared);
      if (fingerprint !== row.fingerprint || command.kbId !== row.kb_id || command.expectedGeneration + 1 !== row.generation ||
        (command.payload as {compileRunId: string}).compileRunId !== row.compile_run_id) throw new Error("semantic_corrupt_release");
      const table=byRelease.get(row.id);if(!table||table.kb_id!==row.kb_id)throw new Error("semantic_corrupt_release");
      const compile=checkedCompile(row.kb_id,table.compile??undefined),definition=table.definition;
      if (compile.row.schema_version_id !== row.schema_version_id || !definition ||
        semanticValueHash(definition.definition) !== definition.definition_hash || definition.definition_hash !== command.schemaRevision ||
        preparePublication({...command,payload:{...compile.row.candidates,compileRunId:row.compile_run_id}}).fingerprint!==fingerprint ||
        command.sourceRevision !== compile.row.input_hash) throw new Error("semantic_corrupt_release");
      if (semanticDefinitionKey(input) !== this.definition) throw new Error("semantic_release_schema_mismatch");
      const {relations,supports,sources}=table;
      const supportsByRelation=new Map<string,string[]>();
      for(const support of supports){const ids=supportsByRelation.get(support.relation_id)??[];ids.push(support.assertion_id);supportsByRelation.set(support.relation_id,ids);}
      const normalized = relations.map(r => ({id: r.relation_id, type: r.type, sourceId: r.source_id, targetId: r.target_id,
        origin: r.origin, assertionIds: supportsByRelation.get(r.relation_id)??[]}));
      const expected = [...input.relations].sort((a,b) => a.id.localeCompare(b.id)).map(r => ({id: r.id, type: r.type,
        sourceId: r.sourceId, targetId: r.targetId, origin: r.origin, assertionIds: [...r.assertionIds].sort()}));
      if (supports.length > 5000 || semanticValueHash(normalized) !== semanticValueHash(expected) ||
        semanticValueHash(sources.map(s => ({ kbId: row.kb_id, documentId: s.document_id, version: s.document_version, contentHash: s.content_hash }))) !==
        semanticValueHash([...input.sources].sort((a,b) => a.documentId.localeCompare(b.documentId)))) throw new Error("semantic_corrupt_release");
      const bound=table.bound;
      acceptedReviews(input, bound);
      if (semanticValueHash(bound) !== command.reviewRevision) throw new Error("semantic_corrupt_release");
      const latest = releaseId?bound:table.latest;
      const boundBySubject=new Map(bound.map(review=>[review.subject_key,review]));
      const latestBySubject=new Map(latest.map(review=>[review.subject_key,review]));
      // acceptedReviews already verified every bound subject hash in this same snapshot.
      output.relations.push(...input.relations.filter(relation => {
        const key=`relation/${relation.id}`,review=latestBySubject.get(key),accepted=boundBySubject.get(key);
        return !!review&&!!accepted&&review.id===accepted.id&&review.decision==="accept"&&review.subject_hash===accepted.subject_hash;
      }));
      output.sources.push(...input.sources);
      if (output.relations.length > 5000 || output.sources.length > 5000) throw new Error("semantic_snapshot_limit");
    }
    return output;
  }
}
