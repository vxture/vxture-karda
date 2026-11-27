import {completeIndex} from './runtime';
import test from 'node:test';
import assert from 'node:assert/strict';
import {Pool} from 'pg';
import {randomUUID} from 'node:crypto';
import {GraphStore} from './store';
import {localCompileProfile} from '../semantic/compile-profile';
import {semanticValueHash} from '../semantic/store-postgres';
const endpoint=process.env.KARDA_PROVISION_TEST_DATABASE_URL;
test('graph centers PostgreSQL: scoped index queue and asset CAS/version/publication/rollback/stop/delete, immutable history and revoked authority',{skip:!endpoint,timeout:60000},async()=>{
 const url=new URL(endpoint!);assert.ok(['localhost','127.0.0.1','[::1]'].includes(url.hostname));assert.equal(url.pathname,'/karda_p3_test');
 const admin=new Pool({connectionString:url.toString()});url.username='karda_svc';const service=new Pool({connectionString:url.toString(),max:3});
 const ws=randomUUID(),kb=randomUUID(),sub='usr_'+randomUUID(),who={workspaceId:ws,sub,roles:[],productCode:'karda'},view=randomUUID(),index=randomUUID(),rules=randomUUID();let member:string|undefined;
 const store=new GraphStore(service,async()=>true),viewConfig={nodeIds:[],edgeIds:[],layout:'structural',positions:{},focus:null,relationTypes:[],annotations:[],steps:[],groups:[]};
 const command=(action:string,id:string,revision:number,extra:Record<string,unknown>={})=>store.command(who,{kbId:kb,id,requestId:randomUUID(),revision,action,note:'Explicit synthetic operator decision',...extra}) as Promise<any>;
 try{
  member=(await admin.query('INSERT INTO local_authz.member(workspace_id,sub) VALUES($1,$2) RETURNING id',[ws,sub])).rows[0].id;
  await admin.query("INSERT INTO local_authz.member_role(member_id,role_id) SELECT $1,id FROM local_authz.role WHERE role_code='member'",[member]);
  await admin.query("INSERT INTO karda_kb.knowledge_base(id,workspace_id,owner_type,owner_sub,name) VALUES($1,$2,'user',$3,'Graph fixture')",[kb,ws,sub]);
  await admin.query("INSERT INTO karda_kb.kb_attachment(workspace_id,user_sub,product_code,kb_id) VALUES($1,$2,'karda',$3)",[ws,sub,kb]);
  const create={kbId:kb,id:view,requestId:randomUUID(),revision:0,action:'save',note:'Save view',kind:'view',title:'Narrative view',visibility:'personal',config:viewConfig};
  assert.equal((await store.command(who,create) as any).revision,1);assert.equal((await store.command(who,create) as any).revision,1);await assert.rejects(store.command(who,{...create,title:'Conflict'}),/graph_conflict/);
  let current=(await store.browse(who,kb,view)).assets[0];assert.equal(current.title,'Narrative view');
  const first=await command('publish',view,1);assert.ok(first.versionId);await assert.rejects(command('save',view,1,{kind:'view',title:'Stale',visibility:'personal',config:viewConfig}),/graph_conflict/);
  await command('save',view,2,{kind:'view',title:'Updated',visibility:'workspace',config:{...viewConfig,steps:[{title:'Step one',description:'Authored',nodeIds:[],edgeIds:[],evidenceIds:[]}]}});
  const second=await command('publish',view,3);assert.notEqual(second.versionId,first.versionId);await command('rollback',view,4,{versionId:first.versionId});await command('stop',view,5);
  assert.equal((await store.browse(who,kb,view)).versions.length,2);await assert.rejects(service.query('DELETE FROM karda_kb.graph_asset_version WHERE asset_id=$1',[view]),/permission denied/);await assert.rejects(service.query('UPDATE karda_kb.graph_asset SET created_by=$2 WHERE id=$1',[view,'other']),/permission denied/);
  assert.equal((await command('build',index,0)).state,'queued');assert.equal((await command('cancel',index,1)).state,'cancelled');assert.equal((await command('retry',index,2)).state,'queued');
  const lease=randomUUID();await admin.query("UPDATE karda_kb.graph_index SET state='building',lease_id=$2 WHERE id=$1",[index,lease]);const row={id:index,workspace_id:ws,created_by:sub,revision:3};assert.equal(await completeIndex(service,row,lease,'ready',{key:'c'.repeat(64),nodes:0,edges:0,manifest:{phase:'ready'}}),true);assert.equal(await completeIndex(service,row,lease,'failed',{error:'late_worker'}),false);
  const schema=localCompileProfile().schema;await admin.query('INSERT INTO karda_kb.semantic_schema_version(kb_id,namespace,schema_id,version,definition_hash,definition) VALUES($1,$2,$3,$4,$5,$6)',[kb,schema.namespace,schema.schemaId,schema.version,semanticValueHash({schema,entityTypes:[]}),{schema,entityTypes:[]}]);
  await command('save',rules,0,{kind:'rules',title:'Finite rules',visibility:'personal',config:{schema,rules:[{id:'part-of-transitive',kind:'transitive',input:'part_of',output:'part_of'}]}});await command('publish',rules,1);
  assert.ok((await store.browse(who,kb)).history.length>=9);
  await admin.query('DELETE FROM karda_kb.kb_attachment WHERE kb_id=$1',[kb]);await assert.rejects(store.browse(who,kb),/graph_denied/);await assert.rejects(command('stop',rules,2),/graph_denied/);
 }finally{
  await admin.query('DELETE FROM karda_kb.graph_control WHERE workspace_id=$1',[ws]);await admin.query('DELETE FROM karda_kb.graph_asset_version WHERE asset_id IN (SELECT id FROM karda_kb.graph_asset WHERE workspace_id=$1)',[ws]);await admin.query('DELETE FROM karda_kb.graph_asset WHERE workspace_id=$1',[ws]);await admin.query('DELETE FROM karda_kb.graph_index WHERE workspace_id=$1',[ws]);await admin.query('DELETE FROM karda_kb.semantic_schema_version WHERE kb_id=$1',[kb]);await admin.query('DELETE FROM karda_kb.knowledge_change_event WHERE workspace_id=$1',[ws]);await admin.query('DELETE FROM karda_kb.kb_attachment WHERE kb_id=$1',[kb]);await admin.query('DELETE FROM karda_kb.knowledge_base WHERE id=$1',[kb]);if(member){await admin.query('DELETE FROM local_authz.member_role WHERE member_id=$1',[member]);await admin.query('DELETE FROM local_authz.member WHERE id=$1',[member]);}await service.end();await admin.end();
 }
});
