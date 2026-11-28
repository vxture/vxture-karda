/**
 * Real PostgreSQL product authority and publication workflow integration.
 * @package @karda/app
 * @layer Application
 * @category ProductOperations
 * @author AI-Generated
 * @date 2026-11-28
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {Pool} from 'pg';
import {execute as executeRaw,detail as detailRaw,processJob as processJobRaw} from './store';
import {testAuthority,seedTestGrants} from './test-authority';
const execute=(...a:Parameters<typeof executeRaw>)=>testAuthority(a[0],()=>executeRaw(...a));
const detail=(...a:Parameters<typeof detailRaw>)=>testAuthority(a[0],()=>detailRaw(...a));
const processJob=(...a:Parameters<typeof processJobRaw>)=>testAuthority(a[0],()=>processJobRaw(...a));
import {closeOperationsPool} from './access';
const endpoint=process.env.KARDA_PROVISION_TEST_DATABASE_URL;
test('public operations PostgreSQL: explicit grants, production, independent review, immutable release, revoke and isolation',{skip:!endpoint,timeout:120000},async()=>{
 const url=new URL(endpoint!);assert.ok(['localhost','127.0.0.1','[::1]'].includes(url.hostname));assert.equal(url.pathname,'/karda_p3_test');const admin=new Pool({connectionString:url.toString()});url.username='karda_svc';const old=process.env.DATABASE_URL;process.env.DATABASE_URL=url.toString();const editor='opr_'+randomUUID(),reviewer='opr_'+randomUUID(),publisher='opr_'+randomUUID(),outsider='opr_'+randomUUID(),libraryId=randomUUID(),sourceId=randomUUID();
 try{
 for(const [sub,roles] of [[editor,['editor']],[reviewer,['reviewer']],[publisher,['publisher']]] as const)await admin.query('INSERT INTO karda_kb.ops_member(sub,roles) VALUES($1,$2)',[sub,JSON.stringify(roles)]);
 for(const [subject,rs]of [[editor,['editor']],[reviewer,['reviewer']],[publisher,['publisher']]] as const)await seedTestGrants(subject,rs);
 await assert.rejects(execute(outsider,{action:'create',id:libraryId,title:'No grant',domain:'LEG',note:'Denied fixture'}),/operations_forbidden|operations_not_associated/);
 await execute(editor,{action:'create',id:libraryId,title:'Public fixture',domain:'LEG',note:'Create fixture'});
 let current=await detail(editor,libraryId);await execute(editor,{action:'save',id:libraryId,expectedRevision:current.library.revision,artifactId:sourceId,kind:'source',note:'Retain public source',payload:{title:'Official source',url:'https://example.gov/law',issuer:'Fixture',edition:'v1',rights:'Fixture only',validity:'current',text:'The supplier delivers goods.\n\nThe buyer checks the goods.'}});
 current=await detail(editor,libraryId);await execute(editor,{action:'process',id:libraryId,expectedRevision:current.library.revision,sourceId,note:'Prepare native candidates'});current=await detail(editor,libraryId);assert.equal(current.jobs.length,1);await processJob(editor,current.jobs[0].id);assert.equal((await detail(editor,libraryId)).artifacts.length,3);assert.equal((await processJob(editor,current.jobs[0].id)).duplicate,true);
 const command=async(actor:string,action:string,extra:Record<string,unknown>={})=>{const d=await detail(editor,libraryId);return execute(actor,{action,id:libraryId,expectedRevision:d.library.revision,note:'Explicit workflow action',...extra});};
 await assert.rejects(command(editor,'publish'),/operations_forbidden/);await command(editor,'submit');await command(reviewer,'approve');await command(publisher,'publish');current=await detail(editor,libraryId);assert.ok(current.library.active_release);assert.equal(current.publishedGraph.nodes.length,3);const release=current.library.active_release;
 await assert.rejects(execute(editor,{action:'save',id:libraryId,expectedRevision:1,artifactId:randomUUID(),kind:'source',payload:{},note:'Stale action'}),/operations_conflict/);
 await command(publisher,'withdraw');assert.equal((await detail(editor,libraryId)).library.active_release,null);await command(publisher,'restore',{releaseId:release});assert.notEqual((await detail(editor,libraryId)).library.active_release,release);
 await admin.query('DELETE FROM karda_kb.ops_role_assignment WHERE sub=$1',[editor]);
 const svc=new Pool({connectionString:url.toString()});try{await assert.rejects(svc.query("UPDATE karda_kb.public_release SET snapshot='[]' WHERE library_id=$1",[libraryId]),/permission denied/);await assert.rejects(svc.query('DELETE FROM karda_kb.ops_audit WHERE target=$1',[libraryId]),/permission denied/);}finally{await svc.end();}
 await admin.query("UPDATE karda_kb.ops_member SET status='disabled' WHERE sub=$1",[editor]);await assert.rejects(detail(editor,libraryId),/operations_not_associated/);await assert.rejects(detail('usr_'+randomUUID(),libraryId),/operations_authority_invalid/);
 }finally{await closeOperationsPool();process.env.DATABASE_URL=old;await admin.query('DELETE FROM karda_kb.public_job WHERE library_id=$1',[libraryId]);await admin.query('DELETE FROM karda_kb.public_release WHERE library_id=$1',[libraryId]);await admin.query('DELETE FROM karda_kb.public_artifact WHERE library_id=$1',[libraryId]);await admin.query('DELETE FROM karda_kb.public_library WHERE id=$1',[libraryId]);await admin.query('DELETE FROM karda_kb.ops_audit WHERE target=$1',[libraryId]);await admin.query('DELETE FROM karda_kb.ops_role_assignment WHERE sub=ANY($1::varchar[])',[[editor,reviewer,publisher]]);await admin.query('DELETE FROM karda_kb.ops_platform_member WHERE sub=ANY($1::varchar[])',[[editor,reviewer,publisher]]);await admin.query('DELETE FROM karda_kb.ops_member WHERE sub=ANY($1::text[])',[[editor,reviewer,publisher]]);await admin.end();}
});
