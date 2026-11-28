/**
 * Authorized product public graph indexing through existing Apache Jena service.
 * @package @karda/app
 * @layer Application
 * @category ProductOperations
 * @author AI-Generated
 * @date 2026-11-28
 */
import {jenaCommand} from '../../kb/graph/client';
import {transaction} from './access';
import {snapshot,audit} from './store';
import {hash,uuid,validateSnapshot,type Artifact} from './contract';
export function publicRdf(libraryId:string,artifacts:Artifact[]){
 const id=uuid(libraryId),entity=(value:string)=>'<urn:karda:entity:'+id+':'+uuid(value)+'>',relation=(value:string)=>'<urn:karda:relation:'+id+':'+uuid(value)+'>';
 const literal=(value:unknown)=>JSON.stringify(String(value)),k='urn:karda:vocab:',rdf='http://www.w3.org/1999/02/22-rdf-syntax-ns#type';const lines:string[]=[];
 for(const a of artifacts){const p=a.payload;if(a.kind!=='relation')lines.push(entity(a.id)+' <'+rdf+'> <'+k+'Entity> .',entity(a.id)+' <http://www.w3.org/2000/01/rdf-schema#label> '+literal(p.title)+' .');
 if(a.kind==='relation'||a.kind==='item'){const subject=relation(a.id),source=a.kind==='item'?a.id:String(p.sourceId),target=a.kind==='item'?String(p.sourceId):String(p.targetId);lines.push(subject+' <'+rdf+'> <'+k+'Relation> .',subject+' <'+k+'source> '+entity(source)+' .',subject+' <'+k+'target> '+entity(target)+' .');}
 }
 const shapes='@prefix sh: <http://www.w3.org/ns/shacl#> . @prefix k: <urn:karda:vocab:> . [] a sh:NodeShape; sh:targetClass k:Relation; sh:property [ sh:path k:source; sh:minCount 1; sh:maxCount 1; sh:class k:Entity ]; sh:property [ sh:path k:target; sh:minCount 1; sh:maxCount 1; sh:class k:Entity ] .';
 return {data:lines.join('\n')+'\n',shapes,key:hash(['karda-public-rdf-v1',id,artifacts])};
}
export async function buildPublicIndex(sub:string,id:string){
 const prepared=await transaction(sub,'content.publish',async db=>{const library=(await db.query('SELECT * FROM karda_kb.public_library WHERE id=$1',[uuid(id)])).rows[0];if(!library?.active_release)throw Error('operations_release_required');const r=(await db.query('SELECT snapshot FROM karda_kb.public_release WHERE id=$1 AND library_id=$2',[library.active_release,id])).rows[0];validateSnapshot(r.snapshot);const rdf=publicRdf(id,r.snapshot);await audit(db,sub,'index_pending',id,'Reserve authorized public graph build',{release:library.active_release,key:rdf.key});return{release:library.active_release,rdf};});
 await jenaCommand({operation:'build',...prepared.rdf});
 return transaction(sub,'content.publish',async db=>{const current=(await db.query('SELECT active_release FROM karda_kb.public_library WHERE id=$1 FOR SHARE',[id])).rows[0];if(current?.active_release!==prepared.release)throw Error('operations_conflict');await audit(db,sub,'index',id,'Published public graph index verified',{release:prepared.release,key:prepared.rdf.key,engine:'apache-jena'});return{key:prepared.rdf.key,release:prepared.release,engine:'apache-jena'};});
}

export async function queryPublicIndex(sub:string,id:string){
 const prepared=await transaction(sub,'content.read',async db=>{const l=(await db.query('SELECT active_release FROM karda_kb.public_library WHERE id=$1',[uuid(id)])).rows[0];if(!l?.active_release)throw Error('operations_release_required');const r=(await db.query('SELECT snapshot FROM karda_kb.public_release WHERE library_id=$1 AND id=$2',[id,l.active_release])).rows[0];validateSnapshot(r.snapshot);return{release:l.active_release,rdf:publicRdf(id,r.snapshot),artifacts:r.snapshot as Artifact[]};});
 const result=await jenaCommand({operation:'query',key:prepared.rdf.key,allowed:prepared.artifacts.filter(a=>a.kind==='relation'||a.kind==='item').map(a=>'urn:karda:relation:'+id+':'+a.id),seeds:[],hops:0,direction:'both',limit:1000,after:''});
 return transaction(sub,'content.read',async db=>{if((await db.query('SELECT active_release FROM karda_kb.public_library WHERE id=$1 FOR SHARE',[id])).rows[0]?.active_release!==prepared.release)throw Error('operations_conflict');return{release:prepared.release,engine:result.engine,edgeIds:result.edgeIds,truncated:result.truncated};});
}
