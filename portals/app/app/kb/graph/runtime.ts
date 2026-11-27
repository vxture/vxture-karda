import {Pool} from 'pg';
import {randomUUID} from 'node:crypto';
import {PostgresSemanticReader,type SemanticReadIdentity} from '../semantic/read-postgres';
import {PostgresFormalSemanticLoader} from '../semantic/store-postgres';
import {getObjectStore} from '../storage/objectstore';
import {admitProductionOwner} from '../production/runtime';
import {GraphStore} from './store';
import {hash} from './contract';
import {graphManifest,jenaCommand,scopeKey,queryIndex} from './client';
import type {GraphProjection,OntologySchema} from '../semantic/contracts';
export function graphReader(pool:Pool,who:SemanticReadIdentity,admit:()=>Promise<boolean>,kbIds:string[]){
 const loader=new PostgresFormalSemanticLoader();return new PostgresSemanticReader(pool,getObjectStore(),admit,(db,ids)=>loader.load(db,ids),undefined,async(graph,schema,query,directory,db)=>{
  try{return await queryIndex(who,kbIds,graph,schema,query,directory,db);}catch(e){
   if(e instanceof Error&&e.message==='graph_index_not_ready')await pool.query("INSERT INTO karda_kb.graph_index(id,workspace_id,created_by,kb_ids,scope_key) VALUES($1,$2,$3,$4,$5) ON CONFLICT(workspace_id,created_by,scope_key) DO UPDATE SET state=CASE WHEN karda_kb.graph_index.state='ready' THEN 'queued' ELSE karda_kb.graph_index.state END",[randomUUID(),who.workspaceId,who.sub,JSON.stringify(kbIds),scopeKey(kbIds)]);
   if(e instanceof Error&&e.message==='graph_index_changed')await pool.query("UPDATE karda_kb.graph_index SET state='queued',revision=revision+1,updated_at=now() WHERE workspace_id=$1 AND created_by=$2 AND scope_key=$3 AND state='ready'",[who.workspaceId,who.sub,scopeKey(kbIds)]);
   throw e;
  }
 });
}
export async function completeIndex(pool:Pool,row:{id:string;workspace_id:string;created_by:string;revision:number},lease:string,state:string,values:{key?:string;nodes?:number;edges?:number;manifest?:unknown;error?:string}){
 const db=await pool.connect();try{await db.query('BEGIN');const updated=await db.query("UPDATE karda_kb.graph_index SET state=$3::varchar,revision=revision+1,active_hash=CASE WHEN $3::varchar='ready' THEN $4 ELSE active_hash END,target_hash=COALESCE($4,target_hash),node_count=COALESCE($5,node_count),edge_count=COALESCE($6,edge_count),manifest=COALESCE($7::jsonb,manifest),error_code=$8,attempt=CASE WHEN $3='ready' THEN 0 ELSE attempt END,lease_id=NULL,lease_until=NULL,updated_at=now() WHERE id=$1 AND lease_id=$2 AND revision=$9 RETURNING revision",[row.id,lease,state,values.key??null,values.nodes??null,values.edges??null,values.manifest?JSON.stringify(values.manifest):null,values.error??null,row.revision]);
 if(updated.rowCount){const result={state,...values};await db.query('INSERT INTO karda_kb.graph_control(id,workspace_id,target_id,revision,request_id,fingerprint,action,note,result,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)',[randomUUID(),row.workspace_id,row.id,updated.rows[0].revision,randomUUID(),hash(result),state,'Background index transition',JSON.stringify(result),row.created_by]);}await db.query('COMMIT');return Boolean(updated.rowCount);
 }catch(e){await db.query('ROLLBACK');throw e;}finally{db.release();}
}
let started=false,busy=false,libraryCursor:string|null=null,gcCursor="";
export async function graphPass(){if(busy||!process.env.DATABASE_URL||!process.env.KARDA_JENA_URL)return;busy=true;
 const pool=new Pool({connectionString:process.env.DATABASE_URL,max:3,connectionTimeoutMillis:5000,statement_timeout:15000,allowExitOnIdle:true});let mutex;
 try{
  mutex=await pool.connect();if(!(await mutex.query('SELECT pg_try_advisory_lock(1903240,43) AS locked')).rows[0].locked)return;
  // Bootstrap each actual owner library once; cancelled requests stay cancelled.
  const libraries=(await pool.query("SELECT k.id,k.workspace_id,k.owner_sub FROM karda_kb.knowledge_base k WHERE k.owner_type='user' AND k.deleted_at IS NULL AND ($1::uuid IS NULL OR k.id>$1) AND EXISTS(SELECT 1 FROM karda_kb.kb_attachment a WHERE a.kb_id=k.id AND a.user_sub=k.owner_sub AND a.product_code='karda') ORDER BY k.id LIMIT 100",[libraryCursor])).rows;libraryCursor=libraries.length?libraries.at(-1).id:null;
  for(const k of libraries)await pool.query('INSERT INTO karda_kb.graph_index(id,workspace_id,created_by,kb_ids,scope_key) VALUES($1,$2,$3,$4,$5) ON CONFLICT(workspace_id,created_by,scope_key) DO NOTHING',[randomUUID(),k.workspace_id,k.owner_sub,JSON.stringify([k.id]),scopeKey([k.id])]);
  const rows=(await pool.query("SELECT * FROM karda_kb.graph_index WHERE state='queued' OR (state='building' AND lease_until<now()) OR (state='ready' AND (updated_at<now()-interval '2 minutes' OR EXISTS(SELECT 1 FROM karda_kb.knowledge_change_event e WHERE e.workspace_id=graph_index.workspace_id AND e.created_at>graph_index.updated_at AND graph_index.kb_ids ? e.kb_id::text))) ORDER BY updated_at,id LIMIT 10")).rows;
  for(const row of rows){if(row.state==='building'&&row.attempt>=3){await pool.query("UPDATE karda_kb.graph_index SET state='failed',error_code='graph_retry_exhausted',lease_id=NULL,lease_until=NULL WHERE id=$1 AND revision=$2 AND lease_until<now()",[row.id,row.revision]);continue;}const lease=randomUUID();const claimed=await pool.query("UPDATE karda_kb.graph_index SET state='building',lease_id=$2,lease_until=now()+interval '3 minutes',attempt=attempt+1,updated_at=now() WHERE id=$1 AND revision=$3 AND state IN ('queued','building','ready') RETURNING id",[row.id,lease,row.revision]);if(!claimed.rowCount)continue;
   const who={workspaceId:row.workspace_id,sub:row.created_by,roles:[],productCode:'karda'},kbIds=row.kb_ids as string[];
   let manifest:Awaited<ReturnType<typeof graphManifest>>|undefined;let graph:GraphProjection|undefined;
   try{
    const loader=new PostgresFormalSemanticLoader(),store=new GraphStore(pool,admitProductionOwner);
    const reader=new PostgresSemanticReader(pool,getObjectStore(),admitProductionOwner,(db,ids)=>loader.load(db,ids),undefined,async(g,s,q,d,db)=>{await store.access(who,db,kbIds);manifest=await graphManifest(db,g,s,kbIds);graph=g;return{schema:g.schema,nodes:[],edges:[],assertions:[],evidence:[],truncated:false};});
    await reader.readPackage(who,kbIds,{seedIds:['directory'],maxHops:0,maxNodes:2,maxEdges:1},true);
    if(!manifest||!graph)throw Error('graph_unavailable');
    await pool.query('UPDATE karda_kb.graph_index SET target_hash=$3,node_count=$4,edge_count=$5,manifest=$6 WHERE id=$1 AND lease_id=$2',[row.id,lease,manifest.fingerprint,graph.nodes.length,graph.edges.length,JSON.stringify({phase:'validating_and_writing',releases:manifest.releases})]);
    await jenaCommand({operation:'build',key:manifest.fingerprint,data:manifest.rdf.data,shapes:manifest.rdf.shapes});
    // Re-read the same authority after external build. Do not activate if a source,
    // review, release or role changed while TDB was writing.
    const verify=new PostgresSemanticReader(pool,getObjectStore(),admitProductionOwner,(db,ids)=>loader.load(db,ids),undefined,async(g,s,q,d,db)=>{const now=await graphManifest(db,g,s,kbIds);if(now.fingerprint!==manifest!.fingerprint)throw Error('graph_index_changed');return{schema:g.schema,nodes:[],edges:[],assertions:[],evidence:[],truncated:false};});
    await verify.readPackage(who,kbIds,{seedIds:['directory'],maxHops:0,maxNodes:2,maxEdges:1},true);
    const receipt={releases:manifest.releases,engine:'apache-jena',version:'6.3.0',checkedAt:new Date().toISOString()};
    await completeIndex(pool,row,lease,'ready',{key:manifest.fingerprint,nodes:graph.nodes.length,edges:graph.edges.length,manifest:receipt});
    if(row.active_hash&&row.active_hash!==manifest.fingerprint){const references=await pool.query('SELECT id FROM karda_kb.graph_index WHERE id<>$2 AND (active_hash=$1 OR target_hash=$1) LIMIT 1',[row.active_hash,row.id]);if(!references.rowCount)await jenaCommand({operation:'delete',key:row.active_hash}).catch(()=>{});}
   }catch(e){const code=e instanceof Error&&['graph_denied','semantic_read_denied','graph_index_changed'].includes(e.message)?e.message:'graph_build_failed';await completeIndex(pool,row,lease,code==='graph_index_changed'?'queued':'failed',{error:code});}

  }
  const listed=await jenaCommand({operation:'list',after:gcCursor});
  if(Array.isArray(listed.keys)){for(const key of listed.keys){if(typeof key!=='string'||!/^[a-f0-9]{64}$/.test(key))throw Error('graph_unavailable');const refs=await pool.query('SELECT id FROM karda_kb.graph_index WHERE active_hash=$1 OR target_hash=$1 LIMIT 1',[key]);if(!refs.rowCount)await jenaCommand({operation:'delete',key});}gcCursor=listed.keys.length===100?String(listed.keys.at(-1)):'';}
 }finally{if(mutex){await mutex.query('SELECT pg_advisory_unlock(1903240,43)').catch(()=>{});mutex.release();}await pool.end();busy=false;}
}
export function startGraphDispatch(){if(started)return;started=true;setTimeout(()=>void graphPass().catch(()=>{}),8000).unref();setInterval(()=>void graphPass().catch(()=>{}),15000).unref();}
