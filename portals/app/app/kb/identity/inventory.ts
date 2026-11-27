import type {PoolClient} from 'pg';
import type {PublishedRelationInput} from '../semantic/read-postgres';
import {hash,type Inventory,type FactRecord} from './contract';
export async function inventory(db:PoolClient,kbIds:string[],published:PublishedRelationInput):Promise<Inventory>{
 const entities=(await db.query('SELECT id,kb_id,name,kind,aliases FROM karda_kb.entity WHERE kb_id=ANY($1::uuid[]) ORDER BY id LIMIT 5001',[kbIds])).rows;if(entities.length>5000)throw Error('identity_budget');
 const ids=[...new Set(published.relations.flatMap(r=>r.assertionIds))];
 const assertions=(await db.query('SELECT id,kb_id,statement,as_of,valid_until,content_state,verification_state,expires_at,superseded_by FROM karda_kb.assertion WHERE kb_id=ANY($1::uuid[]) AND id=ANY($2::uuid[]) ORDER BY id LIMIT 5001',[kbIds,ids])).rows;
 const evidence=(await db.query("SELECT e.id,e.assertion_id,s.document_id,s.document_version,s.start_offset,s.end_offset,s.excerpt,d.content_hash,d.active_chunk_version,d.content_state FROM karda_kb.evidence e JOIN karda_kb.assertion a ON a.id=e.assertion_id JOIN karda_kb.span s ON s.id=e.span_id JOIN karda_kb.document d ON d.id=s.document_id AND d.kb_id=a.kb_id WHERE a.kb_id=ANY($1::uuid[]) AND a.id=ANY($2::uuid[]) AND e.stance='supports' AND e.supports_id IS NULL ORDER BY e.id LIMIT 5001",[kbIds,ids])).rows;
 if(assertions.length>5000||evidence.length>5000||published.relations.length>5000)throw Error('identity_budget');
 const byId=new Map(assertions.map(a=>[a.id,a]));const facts:FactRecord[]=published.relations.map(r=>({id:r.id,kbId:r.kbId,type:r.type,sourceId:r.sourceId,targetId:r.targetId,assertionIds:r.assertionIds,statements:r.assertionIds.flatMap(id=>{const a=byId.get(id);return a?[{id,statement:a.statement,asOf:a.as_of?.toISOString()??null,from:null,until:a.valid_until?.toISOString()??null,fingerprint:hash(JSON.parse(JSON.stringify(a)))}]:[];}),evidence:evidence.filter(e=>r.assertionIds.includes(e.assertion_id)).map(e=>({id:e.id,documentId:e.document_id,version:e.document_version,start:e.start_offset,end:e.end_offset,excerpt:e.excerpt,fingerprint:hash(e)}))}));
 const generation=Number((await db.query('SELECT COALESCE(max(generation),0) AS n FROM karda_kb.semantic_release_head WHERE kb_id=ANY($1::uuid[])',[kbIds])).rows[0]?.n??0);
 return{entities:entities.map(e=>({id:e.id,kbId:e.kb_id,name:e.name,kind:e.kind,aliases:Array.isArray(e.aliases)?e.aliases:[]})),facts,relationTypes:published.schema.relationTypes.map(r=>r.id),entityKinds:[...published.entityTypes.keys()],generation};
}
