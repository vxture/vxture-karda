import {semanticValueHash,PostgresFormalSemanticLoader} from "../semantic/store-postgres";
import {randomUUID} from 'node:crypto';
import type {Pool,PoolClient} from 'pg';
import {readProductAccess} from '../../authz/store';
import {permits} from '../../authz/policy';
import type {SemanticReadIdentity} from '../semantic/read-postgres';
import {id,text,obj,hash,viewConfig,type RuleConfig} from './contract';
import {scopeKey} from './client';
import {validateOntology} from '../semantic/projection';
export class GraphStore {
 constructor(readonly pool:Pool,readonly admit:(who:SemanticReadIdentity)=>Promise<boolean>){ }
 async access(who:SemanticReadIdentity,db:PoolClient,kbIds:string[],write=false,exporting=false){
  if(!await this.admit(who))throw Error('graph_denied');
  const access=await readProductAccess(who,{$queryRawUnsafe:async<T>(s:string,...v:unknown[])=>(await db.query(s,v)).rows as T,$executeRawUnsafe:async()=>{throw Error('graph_denied');}});
  if(!permits(access,'product.enter')||!permits(access,'data.read')||(write&&!permits(access,'data.write'))||(exporting&&!permits(access,'data.export')))throw Error('graph_denied');
  const rows=(await db.query("SELECT k.id,k.owner_sub FROM karda_kb.knowledge_base k WHERE k.workspace_id=$1 AND k.id=ANY($2::uuid[]) AND k.deleted_at IS NULL AND k.owner_type='user' AND ((k.owner_sub=$3 AND $4='karda') OR ((k.owner_sub=$3 OR k.publish_state IN ('ws_published','org_published')) AND EXISTS(SELECT 1 FROM karda_kb.kb_attachment a WHERE a.kb_id=k.id AND a.workspace_id=k.workspace_id AND a.user_sub=$3 AND a.product_code=$4)))",[who.workspaceId,kbIds,who.sub,who.productCode])).rows;
  if(rows.length!==new Set(kbIds).size||write&&rows.some(r=>r.owner_sub!==who.sub))throw Error('graph_denied');return access;
 }
 async transaction<T>(who:SemanticReadIdentity,kbIds:string[],write:boolean,work:(db:PoolClient)=>Promise<T>){
  const db=await this.pool.connect();try{await db.query('BEGIN');if(write){await db.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',['karda:roles:'+who.workspaceId]);await db.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',['karda:graph:'+who.workspaceId]);}await this.access(who,db,kbIds,write);const r=await work(db);await db.query('COMMIT');return r;}catch(e){await db.query('ROLLBACK');throw e;}finally{db.release();}
 }
 async browse(who:SemanticReadIdentity,kbId:string,assetId?:string){id(kbId);if(assetId)id(assetId);return this.transaction(who,[kbId],false,async db=>{
  const assets=(await db.query("SELECT * FROM karda_kb.graph_asset WHERE workspace_id=$1 AND kb_id=$2 AND state<>'deleted' AND (created_by=$3 OR visibility='workspace') AND ($4::uuid IS NULL OR id=$4) ORDER BY updated_at DESC,id LIMIT 100",[who.workspaceId,kbId,who.sub,assetId??null])).rows;
  const index=(await db.query('SELECT id,state,revision,attempt,active_hash,target_hash,node_count,edge_count,manifest,error_code,updated_at FROM karda_kb.graph_index WHERE workspace_id=$1 AND created_by=$2 AND scope_key=$3',[who.workspaceId,who.sub,scopeKey([kbId],who.productCode)])).rows[0]??null;
  const versions=assetId?(await db.query("SELECT v.* FROM karda_kb.graph_asset_version v JOIN karda_kb.graph_asset a ON a.id=v.asset_id WHERE a.id=$1 AND a.workspace_id=$2 AND a.kb_id=$3 AND a.state<>'deleted' AND (a.created_by=$4 OR a.visibility='workspace') ORDER BY v.created_at DESC,v.id LIMIT 50",[assetId,who.workspaceId,kbId,who.sub])).rows:[];
  const history=(await db.query('SELECT action,note,revision,created_by,created_at FROM karda_kb.graph_control WHERE workspace_id=$1 AND target_id=ANY($2::uuid[]) ORDER BY created_at DESC LIMIT 100',[who.workspaceId,[...assets.map(a=>a.id),...(index?[index.id]:[])]] )).rows;
  const releases=(await db.query('SELECT id,generation,created_at FROM karda_kb.semantic_release WHERE kb_id=$1 ORDER BY generation DESC LIMIT 100',[kbId])).rows;return{assets,index,versions,history,releases};});}
 async command(who:SemanticReadIdentity,value:unknown){const c=obj(value),kbId=id(c.kbId),target=id(c.id),requestId=id(c.requestId),action=text(c.action,32),note=text(c.note,4000);if(!Number.isInteger(c.revision)||Number(c.revision)<0)throw Error('graph_invalid_request');
  const isIndex=['build','retry','cancel'].includes(action);const write=!isIndex;const allowed=['kbId','id','requestId','revision','action','note',...(action==='save'?['kind','title','visibility','config']:action==='rollback'?['versionId']:[])];if(Object.keys(c).some(k=>!allowed.includes(k)))throw Error('graph_invalid_request');
  return this.transaction(who,[kbId],write,async db=>{
   await db.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',['karda:graph:target:'+target]);
   const fingerprint=hash(c),prior=(await db.query('SELECT fingerprint,result FROM karda_kb.graph_control WHERE target_id=$1 AND request_id=$2 AND workspace_id=$3 AND created_by=$4',[target,requestId,who.workspaceId,who.sub])).rows[0];if(prior){if(prior.fingerprint!==fingerprint)throw Error('graph_conflict');return prior.result;}
   let row:any;let result:Record<string,unknown>;
   if(isIndex){row=(await db.query('SELECT * FROM karda_kb.graph_index WHERE workspace_id=$1 AND created_by=$2 AND scope_key=$3 FOR UPDATE',[who.workspaceId,who.sub,scopeKey([kbId],who.productCode)])).rows[0];
    if(row&&row.id!==target||Number(c.revision)!==(row?.revision??0))throw Error('graph_conflict');
    if(!row){if(action!=='build')throw Error('graph_conflict');await db.query("INSERT INTO karda_kb.graph_index(id,workspace_id,created_by,kb_ids,scope_key,product_code) VALUES($1,$2,$3,$4,$5,$6)",[target,who.workspaceId,who.sub,JSON.stringify([kbId]),scopeKey([kbId],who.productCode),who.productCode]);}
    else await db.query("UPDATE karda_kb.graph_index SET state=$2::varchar,active_hash=CASE WHEN $2::varchar='cancelled' THEN NULL ELSE active_hash END,target_hash=CASE WHEN $2::varchar='cancelled' THEN NULL ELSE target_hash END,revision=revision+1,attempt=0,lease_id=NULL,lease_until=NULL,error_code=NULL,updated_at=now() WHERE id=$1",[target,action==='cancel'?'cancelled':'queued']);
    result={id:target,revision:(row?.revision??0)+1,state:action==='cancel'?'cancelled':'queued'};
   }else{row=(await db.query('SELECT * FROM karda_kb.graph_asset WHERE id=$1 AND workspace_id=$2 AND kb_id=$3 FOR UPDATE',[target,who.workspaceId,kbId])).rows[0];
    if(Number(c.revision)!==(row?.revision??0)||row&&row.created_by!==who.sub||row?.state==='deleted')throw Error('graph_conflict');
    if(action==='save'){
      const kind=text(c.kind,16);if(!['view','topic','rules'].includes(kind)||row&&row.kind!==kind)throw Error('graph_invalid_request');
      const title=text(c.title),visibility=c.visibility;if(!['personal','workspace'].includes(String(visibility)))throw Error('graph_invalid_request');
      const config=kind==='rules'?parseRules(c.config):viewConfig(c.config);if(kind==='rules'){const schema=(config as RuleConfig).schema;const def=(await db.query('SELECT definition FROM karda_kb.semantic_schema_version WHERE kb_id=$1 AND namespace=$2 AND schema_id=$3 AND version=$4',[kbId,schema.namespace,schema.schemaId,schema.version])).rows[0];const current=def?.definition.schema??(await new PostgresFormalSemanticLoader().load(db,[kbId])).schema;if(semanticValueHash(current)!==semanticValueHash(schema))throw Error('graph_rule_invalid');}
      if(!row)await db.query('INSERT INTO karda_kb.graph_asset(id,workspace_id,kb_id,created_by,kind,title,visibility,draft) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',[target,who.workspaceId,kbId,who.sub,kind,title,visibility,JSON.stringify(config)]);
      else await db.query('UPDATE karda_kb.graph_asset SET title=$2,visibility=$3,draft=$4,revision=revision+1,updated_at=now() WHERE id=$1',[target,title,visibility,JSON.stringify(config)]);
      result={id:target,revision:(row?.revision??0)+1};
    }else{
      if(!row)throw Error('graph_conflict');let version=row.active_version,state=row.state;
      if(action==='publish'){const access=await this.access(who,db,[kbId],true);if(!permits(access,'service.publish'))throw Error('graph_denied');const config=row.kind==='rules'?parseRules(row.draft):viewConfig(row.draft);version=randomUUID();await db.query('INSERT INTO karda_kb.graph_asset_version(id,asset_id,config,config_hash,created_by) VALUES($1,$2,$3,$4,$5)',[version,target,JSON.stringify(config),hash(config),who.sub]);state='active';}
      else if(action==='rollback'){const access=await this.access(who,db,[kbId],true);if(!permits(access,'service.publish'))throw Error('graph_denied');version=id(c.versionId);if(!(await db.query('SELECT id FROM karda_kb.graph_asset_version WHERE id=$1 AND asset_id=$2',[version,target])).rowCount)throw Error('graph_conflict');state='active';}
      else if(action==='stop')state='stopped';else if(action==='delete')state='deleted';else throw Error('graph_invalid_request');
      await db.query('UPDATE karda_kb.graph_asset SET state=$2,active_version=$3,revision=revision+1,updated_at=now() WHERE id=$1',[target,state,version]);result={id:target,revision:row.revision+1,state,versionId:version};
    }
   }
   await db.query('INSERT INTO karda_kb.graph_control(id,workspace_id,target_id,revision,request_id,fingerprint,action,note,result,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)',[randomUUID(),who.workspaceId,target,result.revision,requestId,fingerprint,action,note,JSON.stringify(result),who.sub]);return result;
  });
 }
}
export function parseRules(value:unknown):RuleConfig{
 const c=obj(value),schema=c.schema as RuleConfig['schema'];if(Object.keys(c).some(k=>!['schema','rules','hierarchy','constraints'].includes(k)))throw Error('graph_rule_invalid');try{validateOntology(schema);if(schema.entityTypes.length>256||schema.relationTypes.length>256)throw Error();}catch{throw Error('graph_rule_invalid');}
 if(!Array.isArray(c.rules)||c.rules.length>20)throw Error('graph_rule_invalid');
 const names=new Set<string>();const rules=c.rules.map(v=>{const r=obj(v),name=text(r.id,80),kind=text(r.kind,16),input=text(r.input,128),output=text(r.output,128),second=r.second===undefined?undefined:text(r.second,128);
 if(names.has(name)||!['inverse','compose','transitive'].includes(kind)||!schema.relationTypes.some(t=>t.id===input)||!schema.relationTypes.some(t=>t.id===output)||(kind==='compose'&&(!second||!schema.relationTypes.some(t=>t.id===second))))throw Error('graph_rule_invalid');if(kind==='transitive'&&input!==output)throw Error('graph_rule_invalid');names.add(name);
 return{id:name,kind:kind as 'inverse'|'compose'|'transitive',input,output,...(second?{second}:{})};});
 const hierarchy=(c.hierarchy??[]) as {child:string;parent:string}[],constraints=(c.constraints??[]) as {relationType:string;minSupport:number}[];
 if(!Array.isArray(hierarchy)||hierarchy.length>256||!Array.isArray(constraints)||constraints.length>256)throw Error('graph_rule_invalid');
 for(const h of hierarchy){if(Object.keys(obj(h)).some(k=>!['child','parent'].includes(k))||!schema.entityTypes.includes(h.child)||!schema.entityTypes.includes(h.parent)||h.child===h.parent)throw Error('graph_rule_invalid');}
 for(const type of schema.entityTypes){const seen=new Set<string>();const visit=(t:string,path:Set<string>)=>{if(path.has(t))throw Error('graph_rule_invalid');if(seen.has(t))return;seen.add(t);for(const p of hierarchy.filter(h=>h.child===t))visit(p.parent,new Set([...path,t]));};visit(type,new Set());}
 for(const r of constraints)if(!schema.relationTypes.some(t=>t.id===r.relationType)||!Number.isInteger(r.minSupport)||r.minSupport<1||r.minSupport>16)throw Error('graph_rule_invalid');
 return{schema:structuredClone(schema),rules,hierarchy:hierarchy.map(h=>({child:h.child,parent:h.parent})),constraints:constraints.map(c=>({relationType:c.relationType,minSupport:c.minSupport}))};
}
