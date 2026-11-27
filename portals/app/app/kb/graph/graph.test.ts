import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {hash,viewConfig,restoreView} from './contract';
import {parseRules} from './store';
import {eligibleGraph} from './eligible';
import {localCompileProfile} from '../semantic/compile-profile';
import {tenderSnapshot,tenderSchema,CLOCK,KB} from '../semantic/tender-fixture';
test('asset fingerprints are stable across JSONB key order and restore removes unavailable annotations and step members',()=>{
 const n=randomUUID(),hidden=randomUUID(),config=viewConfig({nodeIds:[n,hidden],edgeIds:[],layout:'structural',positions:{[hidden]:{x:1,y:2}},focus:hidden,relationTypes:[],annotations:[{id:hidden,text:'Unavailable commentary'}],steps:[{title:'Step',description:'Authored',nodeIds:[hidden],edgeIds:[],evidenceIds:[]}],groups:[]});
 assert.equal(hash({a:1,b:{d:2,c:3}}),hash({b:{c:3,d:2},a:1}));
 const restored=restoreView(config,{schema:tenderSchema,nodes:[{id:n,kbId:KB,type:'entity',label:'Visible'}],edges:[],assertions:[],evidence:[],truncated:false});assert.deepEqual(restored.config.nodeIds,[n]);assert.deepEqual(restored.config.annotations,[]);assert.deepEqual(restored.config.positions,{});assert.equal(restored.config.focus,null);assert.deepEqual(restored.missing.nodeIds,[hidden]);
});
test('rule packages reject cycles, unknown types, arbitrary rules and unsupported transitive mappings',()=>{
 const schema={...localCompileProfile().schema,entityTypes:['entity','child']};
 const rule={id:'proof',kind:'transitive',input:'part_of',output:'part_of'};
 assert.equal(parseRules({schema,rules:[rule],hierarchy:[{child:'child',parent:'entity'}],constraints:[{relationType:'part_of',minSupport:2}]}).rules.length,1);
 for(const patch of [{hierarchy:[{child:'entity',parent:'child'},{child:'child',parent:'entity'}]},{rules:[{...rule,kind:'execute'}]},{rules:[{...rule,output:'supports'}]},{constraints:[{relationType:'missing',minSupport:1}]},{schema:{...schema,entityTypes:[]}}])assert.throws(()=>parseRules({schema,rules:[rule],...patch}),/graph_rule_invalid/);
});
test('full eligible graph preserves authorization and cannot reconnect through withdrawn sources',()=>{
 const snapshot=tenderSnapshot();assert.equal(eligibleGraph(snapshot,tenderSchema,{visibleKbIds:new Set([KB]),now:CLOCK}).edges.length,3);snapshot.sources.filter(s=>s.current).forEach(s=>s.withdrawn=true);assert.equal(eligibleGraph(snapshot,tenderSchema,{visibleKbIds:new Set([KB]),now:CLOCK}).edges.length,0);
});
