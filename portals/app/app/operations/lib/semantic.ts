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
 const id=uuid(libraryId),node=(value:string)=>'<urn:karda:public:'+id+':'+uuid(value)+'>';
 const literal=(value:unknown)=>JSON.stringify(String(value));const lines:string[]=[];
 for(const a of artifacts){const subject=node(a.id);lines.push(subject+' <http://www.w3.org/2000/01/rdf-schema#label> '+literal(a.payload.title)+' .');
 if(a.kind==='relation'){lines.push(subject+' <urn:karda:vocab:source> '+node(String(a.payload.sourceId))+' .',subject+' <urn:karda:vocab:target> '+node(String(a.payload.targetId))+' .');}
 if(a.kind==='item')lines.push(subject+' <urn:karda:vocab:source> '+node(String(a.payload.sourceId))+' .');
 }return {data:lines.join('\n')+'\n',shapes:'',key:hash(['karda-public',id,artifacts])};
}
export async function buildPublicIndex(sub:string,id:string){
 const prepared=await transaction(sub,'content.publish',async db=>{const library=(await db.query('SELECT * FROM karda_kb.public_library WHERE id=$1',[uuid(id)])).rows[0];if(!library?.active_release)throw Error('operations_release_required');const r=(await db.query('SELECT snapshot FROM karda_kb.public_release WHERE id=$1 AND library_id=$2',[library.active_release,id])).rows[0];validateSnapshot(r.snapshot);return{release:library.active_release,rdf:publicRdf(id,r.snapshot)};});
 await jenaCommand({operation:'build',...prepared.rdf});
 return transaction(sub,'content.publish',async db=>{const current=(await db.query('SELECT active_release FROM karda_kb.public_library WHERE id=$1 FOR SHARE',[id])).rows[0];if(current?.active_release!==prepared.release)throw Error('operations_conflict');await audit(db,sub,'index',id,'Published public graph index verified',{release:prepared.release,key:prepared.rdf.key,engine:'apache-jena'});return{key:prepared.rdf.key,release:prepared.release,engine:'apache-jena'};});
}
