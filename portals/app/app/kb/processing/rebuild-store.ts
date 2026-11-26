import {randomUUID} from "node:crypto";
import {Pool,type PoolClient} from "pg";
import {permits} from "../../authz/policy";
import {readProductAccess,type RoleSql} from "../../authz/store";
import type {SemanticReadIdentity} from "../semantic/read-postgres";
import {profileHash} from "../semantic/profile-authority";
import type {ObjectStore} from "../storage/objectstore";
import {verifiedSourceText} from "../semantic/source-text";
import {readSourceSnapshot,snapshotIR,sourceHash} from "./source-snapshot";
import {parseFastPath} from "./ir";
import {parseRebuild,REBUILD_UUID,type RebuildCommand,type RebuildParams} from "./rebuild-contract";
import type {Chunk} from "./chunk";
import type {EmbedResult} from "./orchestrator";
export interface IndexRow {id:string;ordinal:number;text:string;token_count:number|null;start_offset:number|null;end_offset:number|null;
  vector_ref:string|null;embedding:{model_code:string;dim:number;vector:number[]}|null}
interface Run {id:string;kb_id:string;state:string;revision:number;params:RebuildParams;embedding_model:string|null;request_hash:string}
interface Item {document_id:string;title:string;source_version:number;content_hash:string;text_hash:string;baseline:IndexRow[];candidate:IndexRow[]|null;
  state:string;attempt:number;lease_id:string|null;lease_until:Date|null;candidate_hash:string|null;baseline_hash:string}
interface Doc {id:string;mime:string;content_hash:string;active_chunk_version:number;content_state:string;storage_ref:string;size_bytes:string}
const budget=(value:unknown,max=16*1024*1024)=>{if(Buffer.byteLength(JSON.stringify(value))>max)throw Error("rebuild_payload_budget");};
export function candidateIndex(chunks:Chunk[],embedded:EmbedResult):IndexRow[]{
  if(!chunks.length||chunks.length>1000||typeof embedded.modelCode!=="string"||!embedded.modelCode.trim()||embedded.modelCode.length>128||
    embedded.vectors.length!==chunks.length||chunks.some((c,i)=>c.ordinal!==i||!c.text.trim()||!Number.isSafeInteger(c.tokenCount)||c.tokenCount<1||
      !Number.isSafeInteger(c.sourceRange.start)||!Number.isSafeInteger(c.sourceRange.end)||c.sourceRange.start<0||c.sourceRange.end<=c.sourceRange.start))throw Error("rebuild_embedding_invalid");
  const dim=embedded.vectors[0]?.length;
  if(!dim||dim>16384||embedded.vectors.some(v=>!Array.isArray(v)||v.length!==dim||v.some(n=>!Number.isFinite(n))))throw Error("rebuild_embedding_invalid");
  const rows=chunks.map((c,i)=>({id:randomUUID(),ordinal:c.ordinal,text:c.text,token_count:c.tokenCount,start_offset:c.sourceRange.start,end_offset:c.sourceRange.end,
    vector_ref:`db:${embedded.modelCode}`.slice(0,128),embedding:{model_code:embedded.modelCode,dim,vector:embedded.vectors[i]}}));budget(rows);return rows;
}
export class PostgresRebuild{
  constructor(private pool:Pool,private objects:Pick<ObjectStore,"get">,private admit:(who:SemanticReadIdentity)=>Promise<boolean>){}
  private async scope<T>(who:SemanticReadIdentity,kbId:string,work:(db:PoolClient,kb:{embedding_model:string|null})=>Promise<T>,ai=false):Promise<T>{
    if(!REBUILD_UUID.test(kbId)||!REBUILD_UUID.test(who.workspaceId)||who.productCode!=="karda"||!/^usr_[a-f0-9-]{36}$/i.test(who.sub))throw Error("rebuild_invalid_scope");
    if(await this.admit(who)!==true)throw Error("rebuild_denied");
    const db=await this.pool.connect();try{
      await db.query("BEGIN");
      await db.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))",[`karda:roles:${who.workspaceId}`]);
      await db.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))",[`karda:semantic:${kbId}`]);
      await db.query("SELECT id FROM local_authz.member WHERE workspace_id=$1 AND sub=$2 FOR SHARE",[who.workspaceId,who.sub]);
      const sql:RoleSql={$queryRawUnsafe:async<T>(s:string,...v:unknown[])=>(await db.query(s,v)).rows as T,$executeRawUnsafe:async()=>{throw Error("rebuild_denied");}};
      const access=await readProductAccess(who,sql);
      if(!permits(access,"product.enter")||!permits(access,"data.read")||!permits(access,"data.write")||(ai&&!permits(access,"ai.use")))throw Error("rebuild_denied");
      const kb=(await db.query<{embedding_model:string|null}>(`SELECT embedding_model FROM karda_kb.knowledge_base WHERE id=$1 AND workspace_id=$2
        AND owner_type='user' AND owner_sub=$3 AND deleted_at IS NULL FOR SHARE`,[kbId,who.workspaceId,who.sub])).rows[0];
      if(!kb)throw Error("rebuild_denied");const value=await work(db,kb);await db.query("COMMIT");return value;
    }catch(error){await db.query("ROLLBACK");throw error;}finally{db.release();}
  }
  private async index(db:PoolClient,docId:string,version:number):Promise<IndexRow[]>{
    const rows=(await db.query<IndexRow>(`SELECT c.id,c.ordinal,c.text,c.token_count,c.start_offset,c.end_offset,c.vector_ref,
      CASE WHEN e.chunk_id IS NULL THEN NULL ELSE jsonb_build_object('model_code',e.model_code,'dim',e.dim,'vector',e.vector) END AS embedding
      FROM karda_kb.chunk c LEFT JOIN karda_kb.chunk_embedding e ON e.chunk_id=c.id WHERE c.document_id=$1 AND c.version=$2 ORDER BY c.ordinal LIMIT 1001`,[docId,version])).rows;
    if(!rows.length||rows.length>1000)throw Error("rebuild_index_budget");budget(rows);return rows;
  }
  private async source(db:PoolClient,kbId:string,docId:string){
    const doc=(await db.query<Doc>(`SELECT id,mime,content_hash,active_chunk_version,content_state,storage_ref,size_bytes FROM karda_kb.document
      WHERE kb_id=$1 AND id=$2 FOR UPDATE`,[kbId,docId])).rows[0];
    if(!doc||doc.content_state!=="indexed"||!doc.active_chunk_version||!Number.isSafeInteger(Number(doc.size_bytes))||Number(doc.size_bytes)<0||Number(doc.size_bytes)>8*1024*1024||
      (await db.query("SELECT id FROM karda_kb.processing_task WHERE document_id=$1 AND state IN ('queued','running') LIMIT 1",[docId])).rowCount)throw Error("rebuild_source_changed");
    const bytes=doc.storage_ref?await this.objects.get(doc.storage_ref):null;
    const normalized=await readSourceSnapshot(async(s,...v)=>(await db.query(s,v)).rows,docId,doc.active_chunk_version);
    const text=verifiedSourceText({activeVersion:doc.active_chunk_version,contentState:doc.content_state,mime:doc.mime,contentHash:doc.content_hash,normalized},bytes?.length===Number(doc.size_bytes)?bytes:null);
    if(text===null)throw Error("rebuild_source_changed");
    return {doc,text,normalized};
  }
  async create(who:SemanticReadIdentity,input:RebuildCommand&{action:"create"}){
    const c=parseRebuild(input) as typeof input;
    return this.scope(who,c.kbId,async(db,kb)=>{
      const hash=profileHash(c),existing=(await db.query<Run>("SELECT * FROM karda_kb.index_rebuild WHERE id=$1 AND kb_id=$2 AND created_by=$3",[c.id,c.kbId,who.sub])).rows[0];
      if(existing){if(existing.request_hash!==hash)throw Error("rebuild_conflict");return {id:c.id,duplicate:true};}
      await db.query(`INSERT INTO karda_kb.index_rebuild(id,kb_id,created_by,request_hash,params,embedding_model,note)
        VALUES($1,$2,$3,$4,$5,$6,$7)`,[c.id,c.kbId,who.sub,hash,JSON.stringify(c.params),kb.embedding_model,c.note]);
      let total=0;
      for(const docId of [...c.documentIds].sort()){
        const {doc,text}=await this.source(db,c.kbId,docId),baseline=await this.index(db,docId,doc.active_chunk_version);
        total+=Buffer.byteLength(JSON.stringify(baseline));if(total>32*1024*1024)throw Error("rebuild_payload_budget");
        await db.query(`INSERT INTO karda_kb.index_rebuild_item(run_id,document_id,source_version,content_hash,text_hash,baseline_hash,baseline)
          VALUES($1,$2,$3,$4,$5,$6,$7)`,[c.id,docId,doc.active_chunk_version,doc.content_hash,sourceHash(text),profileHash(baseline),JSON.stringify(baseline)]);
      }
      return {id:c.id,duplicate:false};
    });
  }
  private async resolve(who:SemanticReadIdentity,id:string):Promise<string>{
    if(!REBUILD_UUID.test(id)||await this.admit(who)!==true)throw Error("rebuild_denied");
    const row=(await this.pool.query<{kb_id:string}>(`SELECT r.kb_id FROM karda_kb.index_rebuild r JOIN karda_kb.knowledge_base k ON k.id=r.kb_id
      WHERE r.id=$1 AND r.created_by=$2 AND k.workspace_id=$3 AND k.owner_type='user' AND k.owner_sub=$2 AND k.deleted_at IS NULL`,[id,who.sub,who.workspaceId])).rows[0];
    if(!row)throw Error("rebuild_not_found");return row.kb_id;
  }
  private async run(db:PoolClient,id:string,who:SemanticReadIdentity):Promise<Run>{
    const row=(await db.query<Run>("SELECT * FROM karda_kb.index_rebuild WHERE id=$1 AND created_by=$2 FOR UPDATE",[id,who.sub])).rows[0];
    if(!row)throw Error("rebuild_not_found");return row;
  }
  private async check(db:PoolClient,run:Run,item:Item,model:string|null,expected:IndexRow[]){
    if(model!==run.embedding_model)throw Error("rebuild_config_changed");
    const source=await this.source(db,run.kb_id,item.document_id);
    if(source.doc.active_chunk_version!==item.source_version||source.doc.content_hash!==item.content_hash||sourceHash(source.text)!==item.text_hash||
      profileHash(await this.index(db,item.document_id,item.source_version))!==profileHash(expected))throw Error("rebuild_index_changed");
    return source;
  }
  async claim(who:SemanticReadIdentity,id:string,docId:string){
    const kbId=await this.resolve(who,id);
    return this.scope(who,kbId,async(db,kb)=>{
      const run=await this.run(db,id,who);if(run.state!=="planned")throw Error("rebuild_conflict");
      const item=(await db.query<Item>("SELECT * FROM karda_kb.index_rebuild_item WHERE run_id=$1 AND document_id=$2 FOR UPDATE",[id,docId])).rows[0];
      if(!item)throw Error("rebuild_not_found");
      if(item.state==="ready"||(item.state==="running"&&item.lease_until&&item.lease_until.getTime()>Date.now()))return null;
      if(item.attempt>=3)throw Error("rebuild_attempt_limit");
      const source=await this.check(db,run,item,kb.embedding_model,item.baseline),lease=randomUUID();
      await db.query(`UPDATE karda_kb.index_rebuild_item SET state='running',attempt=attempt+1,lease_id=$3,lease_until=now()+interval '3 minutes',
        error_code=NULL,updated_at=now() WHERE run_id=$1 AND document_id=$2`,[id,docId,lease]);
      return {lease,params:run.params,model:run.embedding_model,ir:source.normalized?snapshotIR(source.normalized):parseFastPath(source.text)};
    },true);
  }
  async settle(who:SemanticReadIdentity,id:string,docId:string,lease:string,candidate:IndexRow[]|null,errorCode:string|null){
    const kbId=await this.resolve(who,id);
    return this.scope(who,kbId,async(db,kb)=>{
      const run=await this.run(db,id,who),item=(await db.query<Item>("SELECT * FROM karda_kb.index_rebuild_item WHERE run_id=$1 AND document_id=$2 FOR UPDATE",[id,docId])).rows[0];
      if(run.state!=="planned"||!item||item.state!=="running"||item.lease_id!==lease||!item.lease_until||item.lease_until.getTime()<=Date.now())throw Error("rebuild_lease_changed");
      await this.check(db,run,item,kb.embedding_model,item.baseline);
      if(candidate){
        budget(candidate);
        const used=(await db.query<{bytes:string}>("SELECT COALESCE(sum(octet_length(candidate::text)),0)::text AS bytes FROM karda_kb.index_rebuild_item WHERE run_id=$1 AND document_id<>$2",[id,docId])).rows[0];
        if(Number(used.bytes)+Buffer.byteLength(JSON.stringify(candidate))>32*1024*1024)throw Error("rebuild_payload_budget");
      }
      await db.query(`UPDATE karda_kb.index_rebuild_item SET state=$3,candidate=$4,candidate_hash=$5,error_code=$6,lease_id=NULL,lease_until=NULL,updated_at=now()
        WHERE run_id=$1 AND document_id=$2`,[id,docId,candidate?"ready":"failed",candidate?JSON.stringify(candidate):null,candidate?profileHash(candidate):null,errorCode]);
    },true);
  }
  private async replace(db:PoolClient,item:Item,rows:IndexRow[]){
    await db.query("DELETE FROM karda_kb.chunk WHERE document_id=$1 AND version=$2",[item.document_id,item.source_version]);
    for(const r of rows){
      await db.query(`INSERT INTO karda_kb.chunk(id,document_id,version,ordinal,text,token_count,start_offset,end_offset,vector_ref)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)`,[r.id,item.document_id,item.source_version,r.ordinal,r.text,r.token_count,r.start_offset,r.end_offset,r.vector_ref]);
      if(r.embedding)await db.query("INSERT INTO karda_kb.chunk_embedding(chunk_id,model_code,dim,vector) VALUES($1,$2,$3,$4)",[r.id,r.embedding.model_code,r.embedding.dim,JSON.stringify(r.embedding.vector)]);
    }
  }
  async transition(who:SemanticReadIdentity,input:RebuildCommand&{action:"activate"|"revert"|"cancel"}){
    const c=parseRebuild(input) as typeof input,kbId=await this.resolve(who,c.id);
    return this.scope(who,kbId,async(db,kb)=>{
      const run=await this.run(db,c.id,who),fingerprint=profileHash(c),old=(await db.query<{fingerprint:string;revision:number}>("SELECT fingerprint,revision FROM karda_kb.index_rebuild_event WHERE run_id=$1 AND event_id=$2",[c.id,c.eventId])).rows[0];
      if(old){if(old.fingerprint!==fingerprint)throw Error("rebuild_conflict");return {id:c.id,revision:old.revision,duplicate:true};}
      if(run.revision!==c.expectedRevision||(c.action==="revert"?run.state!=="active":run.state!=="planned"))throw Error("rebuild_conflict");
      if(c.action!=="cancel"){
        const items=(await db.query<Item>("SELECT * FROM karda_kb.index_rebuild_item WHERE run_id=$1 ORDER BY document_id FOR UPDATE",[c.id])).rows;
        if(!items.length||items.some(i=>i.state!=="ready"||!i.candidate||profileHash(i.candidate)!==i.candidate_hash||profileHash(i.baseline)!==i.baseline_hash))throw Error("rebuild_not_ready");
        for(const item of items)await this.check(db,run,item,kb.embedding_model,c.action==="activate"?item.baseline:item.candidate!);
        for(const item of items)await this.replace(db,item,c.action==="activate"?item.candidate!:item.baseline);
      }
      const revision=run.revision+1,state=c.action==="activate"?"active":c.action==="revert"?"reverted":"cancelled";
      await db.query("UPDATE karda_kb.index_rebuild SET state=$2,revision=$3,updated_at=now() WHERE id=$1",[c.id,state,revision]);
      await db.query("INSERT INTO karda_kb.index_rebuild_event(run_id,revision,event_id,fingerprint,action,note,created_by) VALUES($1,$2,$3,$4,$5,$6,$7)",[c.id,revision,c.eventId,fingerprint,c.action,c.note,who.sub]);
      return {id:c.id,revision,duplicate:false};
    });
  }
  async browse(who:SemanticReadIdentity,kbId:string,id?:string,before?:string){
    if((id!==undefined&&!REBUILD_UUID.test(id))||(before!==undefined&&!REBUILD_UUID.test(before))||(id&&before))throw Error("rebuild_invalid_request");
    return this.scope(who,kbId,async db=>{
      const runs=(await db.query(`SELECT r.id,r.kb_id,k.name,r.state,r.revision,r.params,r.note,r.created_at,r.updated_at FROM karda_kb.index_rebuild r
        JOIN karda_kb.knowledge_base k ON k.id=r.kb_id WHERE r.kb_id=$1 AND r.created_by=$2 AND ($3::uuid IS NULL OR r.id=$3)
        AND ($4::uuid IS NULL OR r.id<$4) ORDER BY r.id DESC LIMIT 21`,[kbId,who.sub,id??null,before??null])).rows;
      if(id&&!runs.length)throw Error("rebuild_not_found");
      for(const run of runs.slice(0,20)){
        run.items=(await db.query(`SELECT i.document_id,d.title,i.source_version,i.state,i.attempt,i.lease_until,i.error_code,
          jsonb_array_length(i.baseline) AS "oldCount",COALESCE(jsonb_array_length(i.candidate),0) AS "newCount",i.candidate->0->'embedding'->>'model_code' AS model
          FROM karda_kb.index_rebuild_item i LEFT JOIN karda_kb.document d ON d.id=i.document_id AND d.kb_id=$2 WHERE i.run_id=$1 ORDER BY i.document_id`,[run.id,kbId])).rows;
        run.events=id?(await db.query("SELECT revision,action,note,created_at FROM karda_kb.index_rebuild_event WHERE run_id=$1 ORDER BY revision DESC",[run.id])).rows:[];
      }
      return {format:"karda.index-rebuild.v1",runs:runs.slice(0,20),nextBefore:runs.length>20?runs[19].id:null};
    });
  }
}
