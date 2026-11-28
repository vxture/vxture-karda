import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {payload,transcript,command} from './contract';
import {parseVisualRead,visualKnowledgeTool} from './read';
import {contextRecipe} from '../services/context-contract';
import {normalizeContext,assembleContext} from '../services/context-engine';
const kb=randomUUID();
test('visual payload preserves nature and rejects bad coordinates, table merges and forged origins',()=>{
 const p=payload({blocks:[transcript('Proof Unicode','human',[0.1,0.2,0.9,0.4])],blank:false,limitations:[]});assert.equal(p.blocks[0].text,'Proof Unicode');assert.throws(()=>payload({...p,blank:true}));assert.throws(()=>payload({...p,blocks:[{...p.blocks[0],bbox:[0.9,0.2,0.1,0.4]}]}));assert.throws(()=>payload({...p,blocks:[p.blocks[0],p.blocks[0]]}));assert.throws(()=>payload({...p,blocks:[{...p.blocks[0],origin:'approved_model'}]}));
 const cell={row:0,col:0,rowSpan:2,colSpan:2,text:'Merged',header:true,locator:'sheet1!A1:B2'},table={...transcript(''),kind:'table',rows:2,cols:2,cells:[cell]};assert.equal(payload({...p,blocks:[table]}).blocks[0].cells[0].colSpan,2);assert.throws(()=>payload({...p,blocks:[{...table,cells:[cell,{...cell,row:1,col:1,rowSpan:1,colSpan:1}]}]}));
});
test('visual commands and reads bind scope/version and explicit unknown-call acknowledgement',async()=>{
 const common={id:randomUUID(),requestId:randomUUID(),revision:1,note:'Explicit review'};assert.equal(command({...common,action:'retry',assetIds:[randomUUID()],acknowledgeUnknown:true}).action,'retry');assert.throws(()=>command({...common,action:'retry',assetIds:[randomUUID()]}));assert.throws(()=>command({...common,action:'accept',assetId:randomUUID(),workspaceId:randomUUID()}));assert.throws(()=>parseVisualRead({kb_ids:[kb],asset_id:randomUUID(),image:true}));assert.throws(()=>parseVisualRead({kb_ids:[kb],image:true}));assert.throws(()=>parseVisualRead({kb_ids:[kb,kb]}));assert.throws(()=>parseVisualRead({kb_ids:[kb],region:[0,0,1,1]}));assert.equal(parseVisualRead({kb_ids:[kb],query:'Proof',kind:'table'}).kind,'table');assert.equal((await visualKnowledgeTool({mode:'service',user:null,workspace:randomUUID(),org:null,callerProduct:'other'},{kb_ids:[kb]})).status,403);
});
test('visual recipe retains whole structured evidence without fabricating source text offsets',()=>{
 const section={id:'visual',name:'Visual evidence',mode:'visual',required:true,priority:50,query:'',entityIds:[],relationTypes:[],maxHops:1,maxNodes:20,maxEdges:10},recipe=contextRecipe({goal:'Check chart',allowPartial:false,maxItems:10,sections:[section]},[kb]);const item={assetId:randomUUID(),versionId:randomUUID(),kbId:kb,payload:{blocks:[transcript('Proof')],blank:false,limitations:[]},image:{resource:'/protected/image'},gaps:[]},input=normalizeContext(recipe.sections[0],{items:[item],gaps:[]},{}),out=assembleContext(recipe,[input],8192,'revision','query',null,r=>r);assert.equal(out.result.status,'complete');assert.equal(out.result.items[0].kind,'visual_source');assert.equal(out.result.evidence.length,0);assert.ok(JSON.stringify(out.result).includes('/protected/image'));assert.equal(out.result.budget.usedBytes,Buffer.byteLength(JSON.stringify(out.result)));
});
