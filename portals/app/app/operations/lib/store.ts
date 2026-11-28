/**
 * Transactional public knowledge editing, review and immutable releases.
 * @package @karda/app
 * @layer Application
 * @category ProductOperations
 * @author AI-Generated
 * @date 2026-11-28
 */
import {randomUUID} from 'node:crypto';
import type {PoolClient} from 'pg';
import {transaction} from './access';
import {artifact,hash,projection,record,roles,text,uuid,validateSnapshot,type Artifact} from './contract';
import type {OpsPermission} from './identity';
import {operationsConfig} from './config';
import {sealDelegation} from './delegation';
import {parseFastPath} from '../../kb/processing/ir';
export async function audit(db:PoolClient,sub:string,action:string,target:string,note:string,payload:unknown){await db.query('INSERT INTO karda_kb.ops_audit(id,actor_sub,action,target,note,payload) VALUES($1,$2,$3,$4,$5,$6)',[randomUUID(),sub,action,target,note,JSON.stringify(payload)]);}
export async function snapshot(db:PoolClient,id:string){return (await db.query<Artifact>("SELECT id,kind,payload,revision,created_by FROM karda_kb.public_artifact WHERE library_id=$1 AND payload->>'archived' IS DISTINCT FROM 'true' ORDER BY id",[id])).rows;}
export async function overview(sub:string){return transaction(sub,'operations.enter',async db=>{
 const own=(await db.query('SELECT sub,roles,status,revision FROM karda_kb.ops_member WHERE sub=$1',[sub])).rows[0];
 const permissions=new Set<string>();const {OPS_ROLES}=await import('./identity');for(const r of own.roles as (keyof typeof OPS_ROLES)[])for(const p of OPS_ROLES[r]??[])permissions.add(p);
 const libraries=permissions.has('content.read')?(await db.query('SELECT * FROM karda_kb.public_library ORDER BY updated_at DESC LIMIT 100')).rows:[];
 const members=permissions.has('members.manage')?(await db.query('SELECT * FROM karda_kb.ops_member ORDER BY sub LIMIT 200')).rows:[];
 return{subject:sub,permissions:[...permissions],libraries,members};
 });}
export async function detail(sub:string,id:string){return transaction(sub,'content.read',async db=>{
 const library=(await db.query('SELECT * FROM karda_kb.public_library WHERE id=$1',[uuid(id)])).rows[0];if(!library)throw Error('operations_not_found');const artifacts=await snapshot(db,id);
 const releases=(await db.query('SELECT id,content_hash,reviewed_by,created_by,restored_from,created_at FROM karda_kb.public_release WHERE library_id=$1 ORDER BY created_at DESC LIMIT 100',[id])).rows;
 const jobs=(await db.query('SELECT id,library_id,source_id,source_revision,state,result,error_code,attempt,created_by,updated_at,mode,next_attempt_at,revision,dispatch_attempt FROM karda_kb.public_job WHERE library_id=$1 ORDER BY updated_at DESC LIMIT 100',[id])).rows;
 const archived=(await db.query("SELECT id,kind,payload,revision FROM karda_kb.public_artifact WHERE library_id=$1 AND payload->>'archived'='true' ORDER BY updated_at DESC LIMIT 100",[id])).rows;
 const history=(await db.query('SELECT * FROM karda_kb.ops_audit WHERE target=$1 ORDER BY created_at DESC LIMIT 200',[id])).rows;
 let published:Artifact[]=[];if(library.active_release){const r=(await db.query('SELECT snapshot FROM karda_kb.public_release WHERE id=$1 AND library_id=$2',[library.active_release,id])).rows[0];published=r?.snapshot??[];}
 const old=new Map(published.map(a=>[a.id,a]));const changes=artifacts.filter(a=>hash(a)!==hash(old.get(a.id))).map(a=>({id:a.id,title:a.payload.title,change:old.has(a.id)?'changed':'added'}));
 return{library,artifacts,archived,releases,jobs,history,graph:projection(artifacts),publishedGraph:projection(published),changes,impact:{changed:changes.length,releasedVersion:library.active_release,customerDistribution:'not_enabled'}};
 });}
export async function execute(sub:string,input:unknown,retained?:{key:string;hash:string;bytes:number;mime:string},actorSession?:{sub:string;rpsid:string}){const c=record(input),action=text(c.action,32),note=text(c.note,2000);
 const permission:OpsPermission=action==='member'?'members.manage':action==='approve'||action==='reject'?'content.review':['publish','withdraw','restore'].includes(action)?'content.publish':'content.edit';
 return transaction(sub,permission,async db=>{
 if(action==='member'){
 const target=text(c.sub,128);if(!/^opr_[a-f0-9-]{36}$/i.test(target))throw Error('operations_invalid_subject');const grants=roles(c.roles),status=c.status==='disabled'?'disabled':'active';
 const previous=(await db.query('SELECT * FROM karda_kb.ops_member WHERE sub=$1 FOR UPDATE',[target])).rows[0];if((previous?.revision??0)!==c.expectedRevision)throw Error('operations_conflict');
 if(previous?.roles.includes('authorization')&&(status==='disabled'||!grants.includes('authorization'))){const admins=await db.query("SELECT sub FROM karda_kb.ops_member WHERE status='active' AND roles ? 'authorization'");if(admins.rowCount===1)throw Error('operations_last_authorizer');}
 await db.query("INSERT INTO karda_kb.ops_member(sub,roles,status) VALUES($1,$2,$3) ON CONFLICT(sub) DO UPDATE SET roles=EXCLUDED.roles,status=EXCLUDED.status,revision=ops_member.revision+1,updated_at=now()",[target,JSON.stringify(grants),status]);await audit(db,sub,action,target,note,{before:previous??null,roles:grants,status});return{target};
 }
 if(action==='create'){
 const id=uuid(c.id);await db.query('INSERT INTO karda_kb.public_library(id,title,domain,description,created_by) VALUES($1,$2,$3,$4,$5)',[id,text(c.title,255),text(c.domain,64),typeof c.description==='string'?c.description.slice(0,4000):'',sub]);await audit(db,sub,action,id,note,{});return{id};
 }
 const id=uuid(c.id),library=(await db.query('SELECT * FROM karda_kb.public_library WHERE id=$1 FOR UPDATE',[id])).rows[0];if(!library)throw Error('operations_not_found');if(library.revision!==c.expectedRevision)throw Error('operations_conflict');
 if(action==='archive'||action==='restoreArtifact'){
 const artifactId=uuid(c.artifactId);const changed=await db.query("UPDATE karda_kb.public_artifact SET payload=jsonb_set(payload,'{archived}',$3::jsonb),revision=revision+1,updated_at=now() WHERE id=$1 AND library_id=$2 RETURNING kind",[artifactId,id,JSON.stringify(action==='archive')]);if(!changed.rowCount)throw Error('operations_not_found');
 await db.query("UPDATE karda_kb.public_library SET state='draft',revision=revision+1,reviewed_hash=NULL,reviewed_by=NULL,active_release=CASE WHEN $2 THEN NULL ELSE active_release END,updated_at=now() WHERE id=$1",[id,action==='archive'&&changed.rows[0].kind==='source']);await audit(db,sub,action,id,note,{artifactId});return{id};
 }
 if(action==='settings'){await db.query("UPDATE karda_kb.public_library SET title=$2,domain=$3,description=$4,state='draft',reviewed_hash=NULL,reviewed_by=NULL,revision=revision+1,updated_at=now() WHERE id=$1",[id,text(c.title,255),text(c.domain,64),text(c.description,4000)]);await audit(db,sub,action,id,note,{});return{id};}
 if(action==='save'){
 const artifactId=uuid(c.artifactId),payload=artifact(c.kind,c.payload);if(retained&&c.kind==='source')payload.original=retained;const previous=(await db.query('SELECT * FROM karda_kb.public_artifact WHERE id=$1 FOR UPDATE',[artifactId])).rows[0];if(!retained&&previous?.payload.original&&previous.payload.contentHash===payload.contentHash)payload.original=previous.payload.original;if(previous&&(previous.library_id!==id||previous.kind!==c.kind))throw Error('operations_forbidden');
 if(c.kind==='item'){const s=(await db.query("SELECT payload FROM karda_kb.public_artifact WHERE id=$1 AND library_id=$2 AND kind='source'",[payload.sourceId,id])).rows[0];if(!s||s.payload.contentHash!==payload.sourceHash||Number(payload.end)>s.payload.text.length)throw Error('operations_stale_evidence');}
 await db.query('INSERT INTO karda_kb.public_artifact(id,library_id,kind,payload,created_by) VALUES($1,$2,$3,$4,$5) ON CONFLICT(id) DO UPDATE SET payload=EXCLUDED.payload,revision=public_artifact.revision+1,updated_at=now()',[artifactId,id,c.kind,JSON.stringify(payload),sub]);
 await db.query("UPDATE karda_kb.public_library SET revision=revision+1,state='draft',reviewed_hash=NULL,reviewed_by=NULL,active_release=CASE WHEN $2 THEN NULL ELSE active_release END,updated_at=now() WHERE id=$1",[id,c.kind==='source'&&['unknown','withdrawn'].includes(String(payload.validity))]);await audit(db,sub,action,id,note,{artifactId,kind:c.kind,beforeHash:previous?hash(previous.payload):null,afterHash:hash(payload)});return{id,artifactId};
 }
 const artifacts=await snapshot(db,id),contentHash=hash(artifacts);
 if(action==='submit'){validateSnapshot(artifacts);await db.query("UPDATE karda_kb.public_library SET state='review',reviewed_hash=NULL,reviewed_by=NULL WHERE id=$1",[id]);}
 else if(action==='approve'){if(library.state!=='review')throw Error('operations_invalid_state');validateSnapshot(artifacts);const lastEditor=(await db.query("SELECT actor_sub FROM karda_kb.ops_audit WHERE target=$1 AND actor_sub=$2 AND action IN ('save','create','process','archive','restoreArtifact','settings') LIMIT 1",[id,sub])).rows[0];if(lastEditor?.actor_sub===sub)throw Error('operations_independent_review_required');await db.query("UPDATE karda_kb.public_library SET state='approved',reviewed_hash=$2,reviewed_by=$3 WHERE id=$1",[id,contentHash,sub]);}
 else if(action==='reject'){if(library.state!=='review')throw Error('operations_invalid_state');await db.query("UPDATE karda_kb.public_library SET state='draft',reviewed_hash=NULL,reviewed_by=NULL WHERE id=$1",[id]);}
 else if(action==='publish'){
 if(library.state!=='approved'||library.reviewed_hash!==contentHash)throw Error('operations_review_required');validateSnapshot(artifacts);const release=randomUUID();await db.query('INSERT INTO karda_kb.public_release(id,library_id,content_hash,snapshot,reviewed_by,created_by) VALUES($1,$2,$3,$4,$5,$6)',[release,id,contentHash,JSON.stringify(artifacts),library.reviewed_by,sub]);await db.query("UPDATE karda_kb.public_library SET state='published',active_release=$2 WHERE id=$1",[id,release]);
 }
 else if(action==='withdraw'){if(!library.active_release)throw Error('operations_invalid_state');await db.query("UPDATE karda_kb.public_library SET state='withdrawn',active_release=NULL WHERE id=$1",[id]);}
 else if(action==='restore'){
 const release=(await db.query('SELECT * FROM karda_kb.public_release WHERE id=$1 AND library_id=$2',[uuid(c.releaseId),id])).rows[0];if(!release)throw Error('operations_not_found');validateSnapshot(release.snapshot);
 const current=new Map(artifacts.map(a=>[a.id,a]));for(const a of release.snapshot as Artifact[])if(a.kind==='source'&&(current.get(a.id)?.payload.contentHash!==a.payload.contentHash||!['current','historical'].includes(String(current.get(a.id)?.payload.validity))))throw Error('operations_stale_evidence');
 const releaseId=randomUUID();await db.query('INSERT INTO karda_kb.public_release(id,library_id,content_hash,snapshot,reviewed_by,created_by,restored_from) VALUES($1,$2,$3,$4,$5,$6,$7)',[releaseId,id,release.content_hash,JSON.stringify(release.snapshot),release.reviewed_by,sub,release.id]);await db.query("UPDATE karda_kb.public_library SET active_release=$2,state='published' WHERE id=$1",[id,releaseId]);
 }
 else if(action==='process'){
 const sourceId=uuid(c.sourceId),source=artifacts.find(a=>a.id===sourceId&&a.kind==='source');if(!source)throw Error('operations_not_found');
 if((await db.query("SELECT id FROM karda_kb.public_job WHERE library_id=$1 AND source_id=$2 AND source_revision=$3 AND state IN ('queued','done') LIMIT 1",[id,sourceId,source.revision])).rowCount)throw Error('operations_job_exists');
 const jobId=randomUUID(),mode=c.mode==='automatic'?'automatic':'manual';let cipher:string|null=null;
 if(mode==='automatic'){const cfg=operationsConfig();if(!cfg.enabled||!actorSession||actorSession.sub!==sub)throw Error('operations_delegation_required');cipher=sealDelegation(cfg.clientSecret,{jobId,libraryId:id,sub,rpsid:actorSession.rpsid,expiresAt:Math.floor(Date.now()/1000)+Math.min(86400,cfg.sessionTtlSeconds)});}
 await db.query('INSERT INTO karda_kb.public_job(id,library_id,source_id,source_revision,created_by,mode,delegation_cipher) VALUES($1,$2,$3,$4,$5,$6,$7)',[jobId,id,sourceId,source.revision,sub,mode,cipher]);
 }else throw Error('operations_invalid_action');
 await db.query('UPDATE karda_kb.public_library SET revision=revision+1,updated_at=now() WHERE id=$1',[id]);await audit(db,sub,action,id,note,{contentHash,releaseId:c.releaseId??null,sourceId:c.sourceId??null});return{id};
 });
}
/** Deterministic native-text production; no workforce impersonation of tenant AI. */
export async function processJob(sub:string,jobId:string,fence?:{delegationCipher:string}){return transaction(sub,'content.edit',async db=>{
 const job=(await db.query('SELECT * FROM karda_kb.public_job WHERE id=$1 FOR UPDATE',[uuid(jobId)])).rows[0];if(!job)throw Error('operations_not_found');if(job.state==='done')return{duplicate:true};if(fence&&(job.mode!=='automatic'||job.delegation_cipher!==fence.delegationCipher))throw Error('operations_job_changed');if(!['queued','failed'].includes(job.state)||job.attempt>=3)throw Error('operations_invalid_state');
 await db.query('SELECT id FROM karda_kb.public_library WHERE id=$1 FOR UPDATE',[job.library_id]);
 const source=(await db.query("SELECT * FROM karda_kb.public_artifact WHERE id=$1 AND library_id=$2 AND kind='source' FOR SHARE",[job.source_id,job.library_id])).rows[0];
 await db.query('SAVEPOINT production');
 try{
 if(!source||source.revision!==job.source_revision||source.payload.archived===true)throw Error('operations_source_changed');const ir=parseFastPath(String(source.payload.text));if(ir.elements.length>500)throw Error('operations_processing_budget');
 for(const el of ir.elements){if(el.type==='heading')continue;const payload=artifact('item',{title:el.text.slice(0,80),statement:el.text,sourceId:source.id,sourceHash:source.payload.contentHash,start:el.range.start,end:el.range.end,category:'pending',nature:'fact',conditions:'待人工确认适用条件',exceptions:'待人工确认例外'});await db.query("INSERT INTO karda_kb.public_artifact(id,library_id,kind,payload,created_by) VALUES($1,$2,'item',$3,$4)",[randomUUID(),job.library_id,JSON.stringify(payload),sub]);}
 await db.query("UPDATE karda_kb.public_job SET state='done',result=$2,attempt=attempt+1,error_code=NULL,revision=revision+1,delegation_cipher=NULL,updated_at=now() WHERE id=$1",[job.id,JSON.stringify({parser:ir.parserVersion,elements:ir.elements.length})]);await db.query("UPDATE karda_kb.public_library SET state='draft',revision=revision+1,reviewed_hash=NULL,reviewed_by=NULL,updated_at=now() WHERE id=$1",[job.library_id]);await audit(db,sub,'process',job.library_id,'Native text candidate production',{jobId:job.id,source:source.id});return{done:true};
 }catch(e){await db.query('ROLLBACK TO SAVEPOINT production');const code=e instanceof Error?e.message:'operations_processing_failed';await db.query("UPDATE karda_kb.public_job SET state='failed',attempt=attempt+1,error_code=$2,revision=revision+1,delegation_cipher=NULL,updated_at=now() WHERE id=$1",[job.id,code]);return{done:false,error:code};}
 });}
