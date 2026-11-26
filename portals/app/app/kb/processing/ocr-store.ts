import {Pool,type PoolClient} from "pg";
import {permits} from "../../authz/policy";
import {readProductAccess,type RoleSql} from "../../authz/store";
import type {SemanticReadIdentity} from "../semantic/read-postgres";
import type {ObjectStore} from "../storage/objectstore";
import {PDF_MIME,SOURCE_BYTE_LIMIT,sourceHash,snapshotValid,snapshotIR} from "./source-snapshot";
import {chunkGeneral} from "./chunk";
import type {OcrPayload} from "./pdf-ocr";
import {semanticValueHash} from "../semantic/store-postgres";

const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
export type OcrCommand={action:"create";id:string;documentId:string;modelCode:string}|
  {action:"confirm"|"reject";id:string;documentId:string};
export function parseOcrCommand(text:string):OcrCommand{
  if(text.length>2048)throw Error("ocr_invalid_request");
  const v=JSON.parse(text);
  if(!v||typeof v!=="object"||!UUID.test(v.id)||!UUID.test(v.documentId)||
    !["create","confirm","reject"].includes(v.action)||Object.keys(v).some(k=>!["action","id","documentId",...(v.action==="create"?["modelCode"]:[])].includes(k))||
    (v.action==="create"&&(typeof v.modelCode!=="string"||!/^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$/.test(v.modelCode))))throw Error("ocr_invalid_request");
  return v as OcrCommand;
}
interface Doc {id:string;content_hash:string;mime:string;content_state:string;active_chunk_version:number|null;storage_ref:string;size_bytes:string}
interface Draft {id:string;document_id:string;content_hash:string;base_version:number;model_code:string;created_by:string;
  state:string;payload:OcrPayload|null;payload_hash:string|null;committed_version:number|null;error_code:string|null;created_at:Date}
export class PostgresOcrStore{
  constructor(private pool:Pool,private objects:Pick<ObjectStore,"get">,private admit:(identity:SemanticReadIdentity)=>Promise<boolean>){}
  private async transaction<T>(identity:SemanticReadIdentity,kbId:string,work:(db:PoolClient)=>Promise<T>):Promise<T>{
    if(!UUID.test(kbId)||!UUID.test(identity.workspaceId)||identity.productCode!=="karda"||!/^usr_[a-f0-9-]{36}$/i.test(identity.sub))throw Error("ocr_invalid_scope");
    if(await this.admit(identity)!==true)throw Error("ocr_denied");
    const db=await this.pool.connect();
    try{
      await db.query("BEGIN");
      await db.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))",[`karda:roles:${identity.workspaceId}`]);
      await db.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))",[`karda:semantic:${kbId}`]);
      await db.query("SELECT id FROM local_authz.member WHERE workspace_id=$1 AND sub=$2 FOR SHARE",[identity.workspaceId,identity.sub]);
      const sql:RoleSql={$queryRawUnsafe:async<T>(s:string,...v:unknown[])=>(await db.query(s,v)).rows as T,
        $executeRawUnsafe:async()=>{throw Error("ocr_denied");}};
      const access=await readProductAccess(identity,sql);
      if(!permits(access,"product.enter")||!permits(access,"data.read")||!permits(access,"data.write")||!permits(access,"ai.use"))throw Error("ocr_denied");
      const owner=await db.query(`SELECT id FROM karda_kb.knowledge_base WHERE id=$1 AND workspace_id=$2 AND owner_type='user'
        AND owner_sub=$3 AND deleted_at IS NULL FOR SHARE`,[kbId,identity.workspaceId,identity.sub]);
      if(owner.rowCount!==1)throw Error("ocr_denied");
      const result=await work(db);await db.query("COMMIT");return result;
    }catch(error){await db.query("ROLLBACK");throw error;}finally{db.release();}
  }
  private async document(db:PoolClient,kbId:string,id:string):Promise<Doc>{
    if(!UUID.test(id))throw Error("ocr_invalid_request");
    const row=(await db.query<Doc>(`SELECT id,content_hash,mime,content_state,active_chunk_version,storage_ref,size_bytes
      FROM karda_kb.document WHERE kb_id=$1 AND id=$2 FOR UPDATE`,[kbId,id])).rows[0];
    if(!row||row.mime!==PDF_MIME||!["failed","indexed"].includes(row.content_state))throw Error("ocr_source_not_ready");
    return row;
  }
  private async bytes(row:Doc){
    const size=Number(row.size_bytes);
    if(!row.storage_ref||!Number.isSafeInteger(size)||size<1||size>SOURCE_BYTE_LIMIT)throw Error("ocr_source_changed");
    const bytes=await this.objects.get(row.storage_ref);
    if(!bytes||bytes.length!==size||sourceHash(bytes)!==row.content_hash)throw Error("ocr_source_changed");return bytes;
  }
  async browse(identity:SemanticReadIdentity,kbId:string,documentId:string,id?:string,before?:string){
    if((id&&!UUID.test(id))||(before&&!UUID.test(before))||(id&&before))throw Error("ocr_invalid_request");
    return this.transaction(identity,kbId,async db=>{
      const doc=await this.document(db,kbId,documentId);
      await this.bytes(doc);
      const rows=(await db.query<Draft>(`SELECT id,document_id,content_hash,base_version,model_code,created_by,state,
        ${id?"payload,payload_hash":"NULL AS payload,NULL AS payload_hash"},committed_version,error_code,created_at FROM karda_kb.document_ocr_draft
        WHERE kb_id=$1 AND document_id=$2 AND created_by=$3 AND ($4::uuid IS NULL OR id=$4)
        AND ($5::uuid IS NULL OR id<$5) ORDER BY id DESC LIMIT 21`,[kbId,documentId,identity.sub,id??null,before??null])).rows;
      return {format:"karda.ocr-drafts.v1",documentId,drafts:rows.slice(0,20).map(row=>{
        const stale=row.content_hash!==doc.content_hash||(row.state==="committed"?row.committed_version!==doc.active_chunk_version:
          row.base_version!==(doc.active_chunk_version??0));
        return {...row,stale,payload:!stale&&row.payload&&semanticValueHash(row.payload)===row.payload_hash?row.payload:null};
      }),nextBefore:rows.length>20?rows[19].id:null};
    });
  }
  /** A durable claim precedes billing: reusing an id never invokes Atlas again. */
  async claim(identity:SemanticReadIdentity,kbId:string,command:OcrCommand&{action:"create"}){
    command=parseOcrCommand(JSON.stringify(command)) as typeof command;
    return this.transaction(identity,kbId,async db=>{
      const doc=await this.document(db,kbId,command.documentId);
      const prior=(await db.query<Draft>("SELECT * FROM karda_kb.document_ocr_draft WHERE id=$1",[command.id])).rows[0];
      if(prior){
        if(prior.document_id!==doc.id||prior.created_by!==identity.sub||prior.model_code!==command.modelCode)throw Error("ocr_conflict");
        return {claimed:false,bytes:null};
      }
      const bytes=await this.bytes(doc);
      await db.query(`INSERT INTO karda_kb.document_ocr_draft(id,kb_id,document_id,content_hash,base_version,model_code,created_by,state)
        VALUES($1,$2,$3,$4,$5,$6,$7,'running')`,[command.id,kbId,doc.id,doc.content_hash,doc.active_chunk_version??0,command.modelCode,identity.sub]);
      return {claimed:true,bytes};
    });
  }
  async settle(identity:SemanticReadIdentity,kbId:string,command:OcrCommand,payload:OcrPayload|null,errorCode:string|null){
    return this.transaction(identity,kbId,async db=>{
      const doc=await this.document(db,kbId,command.documentId);
      const draft=(await db.query<Draft>("SELECT * FROM karda_kb.document_ocr_draft WHERE kb_id=$1 AND id=$2 AND created_by=$3 FOR UPDATE",[kbId,command.id,identity.sub])).rows[0];
      if(!draft||draft.state!=="running"||draft.document_id!==doc.id)throw Error("ocr_conflict");
      if(payload&&(!snapshotValid(payload.snapshot)||payload.snapshot.contentHash!==draft.content_hash||payload.modelCode!==draft.model_code))throw Error("ocr_response_invalid");
      if(doc.content_hash!==draft.content_hash||(doc.active_chunk_version??0)!==draft.base_version)throw Error("ocr_source_changed");
      await this.bytes(doc);
      const encoded=payload?JSON.stringify(payload):null;
      await db.query(`UPDATE karda_kb.document_ocr_draft SET state=$2,payload=$3,payload_hash=$4,error_code=$5 WHERE id=$1`,
        [command.id,payload?"ready":"failed",encoded,payload?semanticValueHash(payload):null,payload?null:errorCode]);
    });
  }
  async decide(identity:SemanticReadIdentity,kbId:string,command:OcrCommand){
    command=parseOcrCommand(JSON.stringify(command));
    return this.transaction(identity,kbId,async db=>{
      const doc=await this.document(db,kbId,command.documentId);
      const draft=(await db.query<Draft>("SELECT * FROM karda_kb.document_ocr_draft WHERE kb_id=$1 AND id=$2 AND created_by=$3 FOR UPDATE",[kbId,command.id,identity.sub])).rows[0];
      if(!draft||draft.document_id!==doc.id)throw Error("ocr_conflict");
      if(command.action==="reject"){
        if(draft.state==="rejected")return {version:null,duplicate:true};
        if(draft.state!=="ready"&&draft.state!=="running")throw Error("ocr_conflict");
        await db.query("UPDATE karda_kb.document_ocr_draft SET state='rejected' WHERE id=$1",[draft.id]);return {version:null,duplicate:false};
      }
      if(command.action!=="confirm")throw Error("ocr_invalid_request");
      await this.bytes(doc);
      if(draft.state==="committed")return {version:draft.committed_version,duplicate:true};
      if(draft.state!=="ready"||!draft.payload||semanticValueHash(draft.payload)!==draft.payload_hash||!snapshotValid(draft.payload.snapshot))throw Error("ocr_conflict");
      if(doc.content_hash!==draft.content_hash||(doc.active_chunk_version??0)!==draft.base_version)throw Error("ocr_source_changed");
      const snap=draft.payload.snapshot;
      if(snap.contentHash!==doc.content_hash||snap.parserVersion!=="atlas-ocr-v1"||snap.mime!==doc.mime)throw Error("ocr_conflict");
      const version=draft.base_version+1,chunks=chunkGeneral(snapshotIR(snap));
      await db.query(`INSERT INTO karda_kb.document_text_snapshot(document_id,document_version,content_hash,mime,parser_version,canonical_text,text_hash,locators)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8)`,[doc.id,version,snap.contentHash,snap.mime,snap.parserVersion,snap.text,snap.textHash,JSON.stringify(snap.locators)]);
      for(const chunk of chunks)await db.query(`INSERT INTO karda_kb.chunk(document_id,version,ordinal,text,token_count,start_offset,end_offset)
        VALUES($1,$2,$3,$4,$5,$6,$7)`,[doc.id,version,chunk.ordinal,chunk.text,chunk.tokenCount,chunk.sourceRange.start,chunk.sourceRange.end]);
      await db.query("UPDATE karda_kb.document SET active_chunk_version=$2,content_state='indexed',updated_at=now() WHERE id=$1",[doc.id,version]);
      await db.query("DELETE FROM karda_kb.chunk WHERE document_id=$1 AND version<$2",[doc.id,version]);
      await db.query("UPDATE karda_kb.document_ocr_draft SET state='committed',committed_version=$2 WHERE id=$1",[draft.id,version]);
      return {version,duplicate:false};
    });
  }
}
