import {Pool,type PoolClient} from 'pg';
import {permits,type ProductAccess} from '../../authz/policy';
import {readProductAccess,type RoleSql} from '../../authz/store';
import type {SemanticReadIdentity} from '../semantic/read-postgres';
import {profileHash} from '../semantic/profile-authority';
import {command,config,uuid,type ServiceCommand,type ServiceConfig,type Invoke} from './contract';
export interface ServiceRow {id:string;workspace_id:string;created_by:string;draft:ServiceConfig;revision:number;state:string;active_version:string|null;updated_at:Date}
export interface Snapshot {id:string;revision:number;versionId:string|null;config:ServiceConfig;configHash:string;draft:boolean}
export interface TraceEnd {status:number;errorCode:string|null;latencyMs:number;outputBytes:number;steps:{tool:string;status:number}[];usage:{metric:string;calls:number}[]}
export class PostgresKnowledgeServices{
 constructor(private pool:Pool,private admit:(who:SemanticReadIdentity)=>Promise<boolean>){}
 private async scope<T>(who:SemanticReadIdentity,work:(db:PoolClient,access:ProductAccess)=>Promise<T>){
  uuid(who.workspaceId);if(!/^usr_[a-f0-9-]{36}$/.test(who.sub)||!/^[a-z][a-z0-9_-]{0,31}$/.test(who.productCode))throw Error('service_invalid_scope');
  if(await this.admit(who)!==true)throw Error('service_denied');const db=await this.pool.connect();try{
   await db.query('BEGIN');await db.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',['karda:roles:'+who.workspaceId]);
   await db.query('SELECT id FROM local_authz.member WHERE workspace_id=$1 AND sub=$2 FOR SHARE',[who.workspaceId,who.sub]);
   const sql:RoleSql={$queryRawUnsafe:async<T>(s:string,...v:unknown[])=>(await db.query(s,v)).rows as T,$executeRawUnsafe:async()=>{throw Error('service_denied');}};
   const access=await readProductAccess(who,sql);if(!permits(access,'product.enter')||!permits(access,'data.read'))throw Error('service_denied');
   const value=await work(db,access);await db.query('COMMIT');return value;
  }catch(e){await db.query('ROLLBACK');throw e;}finally{db.release();}
 }
 private admin(access:ProductAccess){return access.roles.some(r=>r==='owner'||r==='administrator');}
 private manage(who:SemanticReadIdentity,access:ProductAccess,s?:ServiceRow){if(who.productCode!=='karda'||!permits(access,'data.write')||(s&&s.created_by!==who.sub&&!this.admin(access)))throw Error('service_denied');}
 private async service(db:PoolClient,who:SemanticReadIdentity,id:string){uuid(id);const s=(await db.query<ServiceRow>('SELECT * FROM karda_kb.knowledge_service WHERE id=$1 AND workspace_id=$2 FOR UPDATE',[id,who.workspaceId])).rows[0];if(!s)throw Error('service_not_found');return s;}
 private async libraries(db:PoolClient,who:SemanticReadIdentity,c:ServiceConfig){
  const rows=(await db.query("SELECT k.id,k.name,k.owner_sub,k.publish_state,k.updated_at FROM karda_kb.knowledge_base k WHERE k.id=ANY($1::uuid[]) AND k.workspace_id=$2 AND k.owner_type='user' AND k.deleted_at IS NULL AND (k.owner_sub=$3 OR k.publish_state IN ('ws_published','org_published')) AND EXISTS(SELECT 1 FROM karda_kb.kb_attachment a WHERE a.kb_id=k.id AND a.workspace_id=k.workspace_id AND a.user_sub=$3 AND a.product_code=$4) ORDER BY k.id FOR SHARE",[c.kbIds,who.workspaceId,who.sub,who.productCode])).rows;
  if(rows.length!==c.kbIds.length)throw Error('service_scope_denied');return rows.map(r=>({...r,updated_at:r.updated_at instanceof Date?r.updated_at.toISOString():r.updated_at}));
 }
 private async target(db:PoolClient,s:ServiceRow,target:string):Promise<ServiceConfig|null>{
  if(target==='stop')return null;if(target==='draft')return config(s.draft);
  const row=(await db.query('SELECT config,config_hash FROM karda_kb.knowledge_service_version WHERE service_id=$1 AND id=$2',[s.id,uuid(target)])).rows[0];if(!row)throw Error('service_not_found');const c=config(row.config);if(profileHash(c)!==row.config_hash)throw Error('service_corrupt');return c;
 }
 private async preview(db:PoolClient,who:SemanticReadIdentity,s:ServiceRow,target:string){
  const c=await this.target(db,s,target),libraries=c?await this.libraries(db,who,c):[];
  const current=s.active_version?await this.target(db,s,s.active_version):null;
  const changed=([...new Set([...Object.keys(current??{}),...Object.keys(c??{})])] as (keyof ServiceConfig)[]).filter(k=>JSON.stringify(current?.[k])!==JSON.stringify(c?.[k]));
  const calls=(await db.query("SELECT count(*)::integer AS running FROM karda_kb.knowledge_service_call WHERE service_id=$1 AND state='running'",[s.id])).rows[0].running;
  const impact={target,revision:s.revision,state:s.state,currentVersion:s.active_version,libraries:libraries.map(k=>({id:k.id,name:k.name})),changed,runningCalls:calls,config:c};
  return {...impact,previewHash:profileHash([who.workspaceId,who.sub,{...s,updated_at:s.updated_at.toISOString()},impact,libraries])};
 }
 private async event(db:PoolClient,who:SemanticReadIdentity,id:string,revision:number,eventId:string,c:ServiceCommand,result:unknown){await db.query('INSERT INTO karda_kb.knowledge_service_event(service_id,revision,event_id,fingerprint,action,note,result,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',[id,revision,eventId,profileHash(c),c.action,'note'in c?c.note:'',JSON.stringify(result),who.sub]);}
 async command(who:SemanticReadIdentity,value:unknown){const c=command(value);return this.scope(who,async(db,access)=>{
  this.manage(who,access);await db.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',['karda:knowledge-services:'+who.workspaceId]);
  if(c.action==='create'){
   const old=(await db.query('SELECT fingerprint FROM karda_kb.knowledge_service_event WHERE service_id=$1 AND event_id=$1',[c.id])).rows[0];if(old){const s=await this.service(db,who,c.id);this.manage(who,access,s);if(old.fingerprint!==profileHash(c))throw Error('service_conflict');return {id:c.id,duplicate:true};}
   if(Number((await db.query('SELECT count(*) AS n FROM karda_kb.knowledge_service WHERE workspace_id=$1',[who.workspaceId])).rows[0].n)>=100)throw Error('service_limit');await this.libraries(db,who,c.config);
   await db.query('INSERT INTO karda_kb.knowledge_service(id,workspace_id,created_by,draft) VALUES($1,$2,$3,$4)',[c.id,who.workspaceId,who.sub,JSON.stringify(c.config)]);const result={id:c.id,revision:1};await this.event(db,who,c.id,1,c.id,c,result);return result;
  }
  const s=await this.service(db,who,c.id);this.manage(who,access,s);
  if(c.action==='preview'){if(!permits(access,'service.publish'))throw Error('service_denied');return this.preview(db,who,s,c.target);}
  const old=(await db.query('SELECT fingerprint,result FROM karda_kb.knowledge_service_event WHERE service_id=$1 AND event_id=$2',[s.id,c.eventId])).rows[0];if(old){if(old.fingerprint!==profileHash(c))throw Error('service_conflict');return {...old.result,duplicate:true};}
  if(s.revision!==c.expectedRevision||s.revision>=2147483646)throw Error('service_changed');const revision=s.revision+1;
  if(c.action==='save'){
   await this.libraries(db,who,c.config);await db.query('UPDATE karda_kb.knowledge_service SET draft=$2,revision=$3,updated_at=now() WHERE id=$1',[s.id,JSON.stringify(c.config),revision]);const result={id:s.id,revision};await this.event(db,who,s.id,revision,c.eventId,c,result);return result;
  }
  if(!permits(access,'service.publish'))throw Error('service_denied');const preview=await this.preview(db,who,s,c.target);if(preview.previewHash!==c.previewHash)throw Error('service_preview_changed');
  let active=s.active_version;if(c.target!=='stop'){
   if(!preview.config)throw Error('service_invalid_request');active=c.versionId;await db.query('INSERT INTO karda_kb.knowledge_service_version(id,service_id,config,config_hash,created_by) VALUES($1,$2,$3,$4,$5)',[active,s.id,JSON.stringify(preview.config),profileHash(preview.config),who.sub]);
  }
  await db.query('UPDATE karda_kb.knowledge_service SET state=$2,active_version=$3,revision=$4,updated_at=now() WHERE id=$1',[s.id,c.target==='stop'?'stopped':'active',active,revision]);
  const result={id:s.id,revision,versionId:active,state:c.target==='stop'?'stopped':'active'};await this.event(db,who,s.id,revision,c.eventId,c,result);return result;
 });}
 async browse(who:SemanticReadIdentity,q:{id?:string;before?:string;versionBefore?:string;eventBefore?:number;callBefore?:string;callState?:string;requestId?:string}={}){
  for(const id of [q.id,q.before,q.versionBefore,q.callBefore,q.requestId])if(id!==undefined)uuid(id);if(q.eventBefore!==undefined&&(!q.id||!Number.isSafeInteger(q.eventBefore)||q.eventBefore<1||q.eventBefore>2147483647))throw Error('service_invalid_request');if(q.callState&&!['running','succeeded','failed'].includes(q.callState))throw Error('service_invalid_request');
  return this.scope(who,async(db,access)=>{
   this.manage(who,access);const services=(await db.query<ServiceRow>('SELECT * FROM karda_kb.knowledge_service WHERE workspace_id=$1 AND (created_by=$2 OR $3::boolean) AND ($4::uuid IS NULL OR id<$4) ORDER BY id DESC LIMIT 21',[who.workspaceId,who.sub,this.admin(access),q.before??null])).rows;
   const libraries=(await db.query("SELECT k.id,k.name FROM karda_kb.knowledge_base k WHERE workspace_id=$1 AND owner_type='user' AND deleted_at IS NULL AND (owner_sub=$2 OR publish_state IN ('ws_published','org_published')) AND EXISTS(SELECT 1 FROM karda_kb.kb_attachment a WHERE a.kb_id=k.id AND a.workspace_id=k.workspace_id AND a.user_sub=$2 AND a.product_code='karda') ORDER BY k.name,k.id LIMIT 201",[who.workspaceId,who.sub])).rows;
   if(libraries.length>200)throw Error('service_library_budget');
   const base={format:'karda.knowledge-services.v1',services:services.slice(0,20),nextBefore:services.length>20?services[19].id:null,libraries,canPublish:permits(access,'service.publish')};if(!q.id)return {...base,detail:null};
   const s=await this.service(db,who,q.id);this.manage(who,access,s);
   const versions=(await db.query('SELECT id,config,config_hash,created_by,created_at FROM karda_kb.knowledge_service_version WHERE service_id=$1 AND ($2::uuid IS NULL OR id<$2) ORDER BY id DESC LIMIT 21',[s.id,q.versionBefore??null])).rows;
   const history=(await db.query('SELECT revision,action,note,result,created_by,created_at FROM karda_kb.knowledge_service_event WHERE service_id=$1 AND ($2::integer IS NULL OR revision<$2) ORDER BY revision DESC LIMIT 21',[s.id,q.eventBefore??null])).rows;
   const calls=(await db.query('SELECT * FROM karda_kb.knowledge_service_call WHERE service_id=$1 AND ($2::uuid IS NULL OR request_id<$2) AND ($3::text IS NULL OR state=$3) AND ($4::uuid IS NULL OR request_id=$4) ORDER BY request_id DESC LIMIT 21',[s.id,q.callBefore??null,q.callState??null,q.requestId??null])).rows;
   const active=s.active_version?await this.target(db,s,s.active_version):null;
   return {...base,detail:{...s,active,versions:versions.slice(0,20),nextVersionBefore:versions.length>20?versions[19].id:null,history:history.slice(0,20),nextEventBefore:history.length>20?history[19].revision:null,calls:calls.slice(0,20),nextCallBefore:calls.length>20?calls[19].request_id:null}};
  });
 }
 async snapshot(who:SemanticReadIdentity,input:Invoke){return this.scope(who,async(db,access)=>{
  const s=await this.service(db,who,input.serviceId);if(input.draft)this.manage(who,access,s);else if(s.state!=='active'||!s.active_version)throw Error('service_inactive');
  const c=input.draft?config(s.draft):await this.target(db,s,s.active_version!);if(!c)throw Error('service_inactive');if(!c.capabilities.includes(input.capability))throw Error('service_capability_denied');await this.libraries(db,who,c);
  if((input.capability==='facts'||input.capability==='source')&&!permits(access,'ai.use'))throw Error('service_denied');
  return {id:s.id,revision:s.revision,versionId:input.draft?null:s.active_version,config:c,configHash:profileHash(c),draft:input.draft} satisfies Snapshot;
 });}
 async begin(who:SemanticReadIdentity,input:Invoke,s:Snapshot){
  const db=await this.pool.connect();try{const row=await db.query('INSERT INTO karda_kb.knowledge_service_call(request_id,service_id,version_id,config_hash,caller_sub,caller_product,capability,draft) VALUES($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT(request_id) DO NOTHING',[input.requestId,s.id,s.versionId,s.configHash,who.sub,who.productCode,input.capability,input.draft]);if(!row.rowCount)throw Error('service_request_replay');}finally{db.release();}
 }
 async finish(who:SemanticReadIdentity,input:Invoke,end:TraceEnd){const result=await this.pool.query("UPDATE karda_kb.knowledge_service_call SET state=$4,status=$5,error_code=$6,latency_ms=$7,output_bytes=$8,steps=$9,usage=$10,finished_at=now() WHERE request_id=$1 AND caller_sub=$2 AND caller_product=$3 AND state='running'",[input.requestId,who.sub,who.productCode,end.status<400?'succeeded':'failed',end.status,end.errorCode,Math.min(2147483647,Math.max(0,end.latencyMs)),end.outputBytes,JSON.stringify(end.steps),JSON.stringify(end.usage)]);if(!result.rowCount)throw Error('service_trace_unavailable');}
}
