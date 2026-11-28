import type {PoolClient} from 'pg';
type Query=(sql:string,values:unknown[])=>Promise<Record<string,any>[]>;
/** A visual derivative never outlives its accepted revision and parent source. */
export async function visualDocumentCurrentQuery(query:Query,documentId:string):Promise<boolean>{
 const d=(await query('SELECT source_ref FROM karda_kb.document WHERE id=$1',[documentId]))[0];const v=d?.source_ref?.visualVersionId;if(!v)return true;
 const r=await query("SELECT a.id FROM karda_kb.visual_revision v JOIN karda_kb.visual_asset a ON a.id=v.asset_id AND a.active_version=v.id AND a.state='accepted' JOIN karda_kb.visual_run r ON r.id=a.run_id AND r.state<>'cancelled' JOIN karda_kb.document p ON p.id=r.document_id AND p.kb_id=r.kb_id WHERE v.id=$1 AND v.derived_document=$2 AND p.content_hash=r.source_hash AND COALESCE(p.active_chunk_version,0)=r.source_version AND p.content_state NOT IN ('deleted','archived')",[v,documentId]);return r.length===1;
}
export async function visualDocumentCurrent(db:PoolClient,documentId:string){return visualDocumentCurrentQuery(async(sql,values)=>(await db.query(sql,values)).rows,documentId);}
