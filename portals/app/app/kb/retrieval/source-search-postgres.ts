import {Pool,type PoolClient} from "pg";
import {randomUUID} from "node:crypto";
import {permits} from "../../authz/policy";
import {readProductAccess,type RoleSql} from "../../authz/store";
import {getObjectStore,type ObjectStore} from "../storage/objectstore";
import {parsePathFor} from "../processing/ir";
import {readSourceSnapshot} from "../processing/source-snapshot";
import {verifiedSourceText,MAX_SEMANTIC_SOURCE_BYTES} from "../semantic/source-text";
import type {SemanticReadIdentity} from "../semantic/read-postgres";
import {passesVerificationFilter,type VerificationState} from "../lib/state";
import {recordDeliveredUsage} from "../../usage/lib/buffer";
import {parseSourceSearch,sourcePassages,rankSourcePassages,SOURCE_SEARCH_TEXT_LIMIT,SOURCE_SEARCH_PASSAGE_LIMIT,
  type SourceSearchRequest,type SourceSearchResult,type SourcePassage} from "./source-search";

interface SourceRow {
  id:string;kb_id:string;title:string;active_chunk_version:number;content_hash:string|null;storage_ref:string|null;
  mime:string|null;size_bytes:string|null;verification_state:VerificationState;expires_at:Date|null;
}

export class PostgresSourceSearch {
  constructor(private pool:Pool,private objects:Pick<ObjectStore,"get">,
    private admit:(identity:SemanticReadIdentity)=>Promise<boolean>){}
  async read(identity:SemanticReadIdentity,input:SourceSearchRequest,transaction?:PoolClient):Promise<SourceSearchResult>{
    identity={...identity,roles:[...identity.roles]};
    input=parseSourceSearch({kb_ids:[...input.kbIds],query:input.query,top_k:input.topK,verification_filter:input.verificationFilter});
    if(!/^[a-z][a-z0-9_-]{0,31}$/.test(identity.productCode))throw new Error("source_search_invalid_request");
    if(await this.admit(identity)!==true)throw new Error("source_search_denied");
    const db=transaction??await this.pool.connect();
    try{
      if(!transaction)await db.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
      const sql:RoleSql={$queryRawUnsafe:async<T>(statement:string,...values:unknown[])=>(await db.query(statement,values)).rows as T,
        $executeRawUnsafe:async()=>{throw new Error("source_search_read_only");}};
      const access=await readProductAccess(identity,sql);
      if(!permits(access,"product.enter")||!permits(access,"data.read")||!permits(access,"ai.use"))throw new Error("source_search_denied");
      const visible=(await db.query<{id:string}>(`SELECT DISTINCT k.id FROM karda_kb.knowledge_base k
        JOIN karda_kb.kb_attachment a ON a.kb_id=k.id AND a.workspace_id=k.workspace_id
        WHERE k.id=ANY($1::uuid[]) AND k.workspace_id=$2::uuid AND k.deleted_at IS NULL
          AND k.owner_type='user' AND (k.owner_sub=$3 OR k.publish_state IN ('ws_published','org_published'))
          AND a.user_sub=$3 AND a.product_code=$4 ORDER BY k.id`,
        [input.kbIds,identity.workspaceId,identity.sub,identity.productCode])).rows.map(r=>r.id);
      const rows=(await db.query<SourceRow>(`SELECT id,kb_id,title,active_chunk_version,content_hash,storage_ref,mime,size_bytes,
        CASE WHEN verification_state='verified' AND expires_at<=statement_timestamp() THEN 'stale' ELSE verification_state END AS verification_state,expires_at
        FROM karda_kb.document WHERE kb_id=ANY($1::uuid[]) AND content_state='indexed' AND active_chunk_version>0
          AND ($2='all' OR (CASE WHEN verification_state='verified' AND expires_at<=statement_timestamp() THEN 'stale' ELSE verification_state END)
            =ANY(CASE WHEN $2='verified_only' THEN ARRAY['verified'] ELSE ARRAY['verified','unverified'] END))
        ORDER BY id LIMIT 101`,[visible,input.verificationFilter])).rows;
      if(rows.length>100)throw new Error("source_search_budget");
      let bytesBudget=32*1024*1024,textBudget=SOURCE_SEARCH_TEXT_LIMIT,partial=false,searchedDocuments=0;
      const passages:SourcePassage[]=[];
      for(const row of rows){
        if(!passesVerificationFilter(input.verificationFilter,row.verification_state))continue;
        const size=row.size_bytes===null?NaN:Number(row.size_bytes);
        if(!row.storage_ref||!Number.isSafeInteger(size)||size<0||size>MAX_SEMANTIC_SOURCE_BYTES){partial=true;continue;}
        bytesBudget-=size;if(bytesBudget<0)throw new Error("source_search_budget");
        const bytes=await this.objects.get(row.storage_ref);
        const normalized=parsePathFor(row.mime??"")==="fast"?null:await readSourceSnapshot(async(statement,...values)=>(await db.query(statement,values)).rows,row.id,row.active_chunk_version);
        const text=verifiedSourceText({contentState:"indexed",activeVersion:row.active_chunk_version,mime:row.mime,contentHash:row.content_hash,normalized},bytes?.length===size?bytes:null);
        if(text===null){partial=true;continue;}
        textBudget-=text.length;if(textBudget<0)throw new Error("source_search_budget");
        passages.push(...sourcePassages({kbId:row.kb_id,documentId:row.id,documentVersion:row.active_chunk_version,title:row.title,
          contentHash:row.content_hash!,verificationState:row.verification_state},text,normalized?.locators));
        if(passages.length>SOURCE_SEARCH_PASSAGE_LIMIT)throw new Error("source_search_budget");
        searchedDocuments++;
      }
      const ranked=rankSourcePassages(passages,input.query,input.topK);
      if(!transaction)await db.query("COMMIT");
      return {mode:"source_only",...ranked,partial,gaps:[...(partial?["source_unavailable"]:[]),...(ranked.items.length?[]:["no_source_matches"])],
        searchedDocuments,searchedPassages:passages.length};
    }catch(error){if(!transaction)await db.query("ROLLBACK");throw error;}finally{if(!transaction)db.release();}
  }
}

export async function readSourceSearch(identity:SemanticReadIdentity,input:SourceSearchRequest,admit:()=>Promise<boolean>){
  if(!process.env.DATABASE_URL)throw new Error("source_search_unavailable");
  const pool=new Pool({connectionString:process.env.DATABASE_URL,max:1,connectionTimeoutMillis:5000,statement_timeout:15000,allowExitOnIdle:true});
  try{return await new PostgresSourceSearch(pool,getObjectStore(),admit).read(identity,input);}finally{await pool.end();}
}
export async function meterSourceSearch(workspaceId:string){
  await recordDeliveredUsage({workspaceId,metric:"karda.search",amount:1,idempotencyKey:`karda.search:${randomUUID()}`});
}
