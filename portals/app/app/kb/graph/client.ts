import {encodeDirectoryCursor,decodeDirectoryCursor} from "../semantic/directory-cursor";
import {createHash} from 'node:crypto';
import type {GraphProjection,OntologySchema,NeighborhoodQuery} from '../semantic/contracts';
import {projectRdf,resource} from '../semantic/rdf-projection';
import {selectGraph} from './eligible';
import {hash} from './contract';
import type {PoolClient} from 'pg';
import type {SemanticReadIdentity} from '../semantic/read-postgres';
export const scopeKey=(ids:string[],product="karda")=>hash([product,[...new Set(ids)].sort()]);
export async function jenaCommand(body:unknown):Promise<Record<string,unknown>>{
 const url=process.env.KARDA_JENA_URL,secret=process.env.OIDC_CLIENT_SECRET;
 if(!url||!secret||secret.length<16)throw Error('graph_unavailable');
 const response=await fetch(url,{method:'POST',headers:{Authorization:'Bearer '+secret,'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(25000),redirect:'error',cache:'no-store'});
 const bytes=Buffer.from(await response.arrayBuffer());if(bytes.length>2*1024*1024)throw Error('graph_budget');
 if(!response.ok)throw Error('graph_index_not_ready');const result=JSON.parse(bytes.toString('utf8'));
 if(result.engine!=='apache-jena'||result.version!=='6.3.0')throw Error('graph_unavailable');return result;
}
export async function graphManifest(db:PoolClient,graph:GraphProjection,schema:OntologySchema,kbIds:string[]){
 const releases=(await db.query('SELECT kb_id,generation,release_id FROM karda_kb.semantic_release_head WHERE kb_id=ANY($1::uuid[]) ORDER BY kb_id',[kbIds])).rows;
 const rdf=projectRdf(graph,schema,true),fingerprint=createHash('sha256').update(rdf.fingerprint+JSON.stringify(releases)).digest('hex');
 return{rdf,fingerprint,releases};
}
export async function queryIndex(who:SemanticReadIdentity,kbIds:string[],graph:GraphProjection,schema:OntologySchema,query:NeighborhoodQuery,directory:boolean,db:PoolClient,selection?:{nodeIds:string[];edgeIds:string[]}){
 const manifest=await graphManifest(db,graph,schema,kbIds);
 const row=(await db.query('SELECT * FROM karda_kb.graph_index WHERE workspace_id=$1 AND created_by=$2 AND scope_key=$3',[who.workspaceId,who.sub,scopeKey(kbIds,who.productCode)])).rows[0];
 if(!row||row.state!=='ready')throw Error('graph_index_not_ready');
 if(row.active_hash!==manifest.fingerprint)throw Error('graph_index_changed');
 const eligible=graph.edges.filter(e=>(!query.relationTypes||query.relationTypes.includes(e.type))&&(!selection||selection.edgeIds.includes(e.id)||selection.nodeIds.includes(e.sourceId)||selection.nodeIds.includes(e.targetId)));
 const cursorHash=hash([manifest.fingerprint,query.relationTypes??[],query.maxNodes,query.maxEdges]);let after='';if(query.pageCursor){const cursor=decodeDirectoryCursor(query.pageCursor);if(cursor.hash!==cursorHash)throw Error('semantic_directory_changed');after=cursor.last;}
 const result=await jenaCommand({operation:'query',key:manifest.fingerprint,allowed:eligible.map(e=>resource('relation',e.kbId,e.id)),seeds:directory?[]:query.seedIds.map(id=>{const n=graph.nodes.find(n=>n.id===id);return n?resource('entity',n.kbId,n.id):resource('entity',kbIds[0],id);}),hops:query.maxHops,direction:query.direction??'both',limit:query.maxEdges,after});
 if(!Array.isArray(result.edgeIds)||result.edgeIds.length>1000||!result.edgeIds.every(id=>typeof id==='string'))throw Error('graph_unavailable');
 const projected=selectGraph(graph,result.edgeIds.map(x=>String(x).split(':').at(-1)!),query.maxNodes,query.maxEdges);
 const last=projected.edges.at(-1);const more=Boolean(result.truncated)||projected.truncated;
 return{...projected,truncated:more,...(directory&&query.pageCursor!==undefined?{directoryPage:{nextCursor:more&&last?encodeDirectoryCursor(cursorHash,resource('relation',last.kbId,last.id)):null}}:{})};
}
