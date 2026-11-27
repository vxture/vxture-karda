import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {parse,failure} from './contract';
import {ProductionEngine} from './engine';
const id=randomUUID(),unitId=randomUUID(),eventId=randomUUID(),doc=randomUUID();
test('production contract: explicit scopes/reviews/unknown outcomes and bounded immutable commands',()=>{
 const c={action:'create',id,title:'Production',scopes:[{kbId:unitId,documentIds:[doc]}],extractMissing:true,note:'Explicit plan'};assert.equal(parse(c).action,'create');assert.throws(()=>parse({...c,scopes:[c.scopes[0],c.scopes[0]]}));assert.throws(()=>parse({...c,token:'forged'}));assert.throws(()=>parse({...c,extractMissing:'yes'}));assert.throws(()=>parse({action:'retry',id,eventId,expectedRevision:1,note:'Retry',stepIds:[doc]}));assert.throws(()=>parse({action:'review_assertions',id,unitId,eventId,expectedRevision:1,note:'',decision:'accept',items:[{id:doc,hash:'a'.repeat(64),revision:0}]}));assert.equal(failure(Error('private provider details')).code,'production_unavailable');
});
test('production DDL mirrors baseline and least-privilege state-only grants',()=>{
 const dir=new URL('../../../../../deploy/database/ddl/',import.meta.url);const sql=readFileSync(new URL('incr/0041_production_center.sql',dir),'utf8'),baseline=readFileSync(new URL('00_baseline.sql',dir),'utf8'),locks=readFileSync(new URL('98_column_locks.sql',dir),'utf8');
 for(const [name,body] of [['PRODUCTION CENTER',baseline],['PRODUCTION CENTER LOCKS',locks]]){const start='-- BEGIN '+name,end='-- END '+name;assert.equal(sql.slice(sql.indexOf(start),sql.indexOf(end)+end.length),body.slice(body.indexOf(start),body.indexOf(end)+end.length));}assert.match(sql,/REVOKE UPDATE,DELETE/);assert.match(sql,/CHECK\(attempt BETWEEN 0 AND 3\)/);
});
test('production execution isolates failures and preserves uncertain classification without fake success',async()=>{
 const settled:any[]=[];const store={settle:async(...a:unknown[])=>settled.push(a)};const engine=new ProductionEngine(store as any,{} as any);engine.compile=async()=>{throw Error('production_outcome_unknown');};await engine.run({} as any,{u:{},s:{kind:'compile',receipt:{taskId:doc}},p:{}} as any);assert.equal(settled[0][3],'failed');assert.equal(settled[0][5],'production_outcome_unknown');engine.compile=async()=>({state:'review',receipt:{taskId:null,plannedTaskId:doc,reason:'production_assertion_review_required'}});await engine.run({} as any,{u:{},s:{kind:'compile'},p:{}} as any);assert.equal(settled[1][3],'review');
});
