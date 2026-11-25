import test from "node:test";
import assert from "node:assert/strict";
import {knowledgeTopics,searchPublishedPassages} from "./knowledge-explorer";
import type {KnowledgePackage} from "./read-postgres";

function fixture():KnowledgePackage{
  const schema={namespace:"local",schemaId:"test",version:"1"};
  return {format:"karda.knowledge-package.v1",schema,
    nodes:[{id:"a",kbId:"kb",type:"entity",label:"A"},{id:"b",kbId:"kb",type:"entity",label:"B"}],
    edges:[{id:"ab",kbId:"kb",schema,type:"requires",sourceId:"a",targetId:"b",assertionIds:["assertion"],origin:"asserted"}],
    assertions:[{id:"assertion",kbId:"kb",contentState:"indexed",verificationState:"verified",verificationExpiresAt:null,
      supersededById:null,validFrom:null,validUntil:null,evidenceIds:["e1","e2"]}],
    evidence:[{id:"e1",kbId:"kb",documentId:"doc",documentVersion:2,start:10,end:22,stance:"supports",pages:[1,3]},
      {id:"e2",kbId:"kb",documentId:"doc",documentVersion:2,start:24,end:36,stance:"contradicts"}],
    statements:[{id:"assertion",statement:"A requires B"}],
    passages:[{evidenceId:"e1",excerpt:"\u4e2d\u6587\ud83d\ude00 <script>support</script>"},{evidenceId:"e2",excerpt:"excluded"}],
    sourceStatus:"complete",gaps:[],truncated:false};
}
test("topics summarize existing directed published facts deterministically without new statements",()=>{
  const pack=fixture();
  assert.deepEqual(knowledgeTopics(pack),[{type:"requires",relationIds:["ab"],entityIds:["a","b"],assertionIds:["assertion"]}]);
  assert.deepEqual(knowledgeTopics({...pack,nodes:[pack.nodes[0]]}),[]);
  assert.deepEqual(knowledgeTopics({...pack,edges:[]}),[]);
});
test("passage search uses exact UTF-16 matches, retains evidence identity and excludes unlinked/contradicting passages",()=>{
  const pack=fixture(),before=JSON.stringify(pack);
  const found=searchPublishedPassages(pack,"\ud83d\ude00");
  assert.equal(found.total,1);assert.equal(found.matches[0].start,2);assert.equal(found.matches[0].end,4);
  assert.deepEqual(found.matches[0].relationIds,["ab"]);assert.equal(found.matches[0].evidenceId,"e1");
  assert.equal(found.matches[0].excerpt.slice(2,4),"\ud83d\ude00");
  assert.equal(searchPublishedPassages(pack,"excluded").total,0);
  assert.equal(searchPublishedPassages({...pack,edges:[]},"support").total,0);
  assert.equal(searchPublishedPassages({...pack,evidence:[]},"support").total,0);
  assert.equal(searchPublishedPassages({...pack,nodes:[]},"support").total,0);
  assert.equal(searchPublishedPassages(pack,"SUPPORT").total,0);
  assert.equal(searchPublishedPassages(pack," ").total,0);assert.equal(searchPublishedPassages(pack,"x".repeat(201)).total,0);
  assert.equal(JSON.stringify(pack),before);
});
test("search deduplicates evidence with shared support and bounds returned matches without hiding total",()=>{
  const pack=fixture();
  pack.evidence=Array.from({length:60},(_,i)=>({...pack.evidence[0],id:`e${i}`}));
  pack.passages=pack.evidence.map(e=>({evidenceId:e.id,excerpt:"support"}));
  pack.assertions[0].evidenceIds=pack.evidence.map(e=>e.id);
  pack.edges.push({...pack.edges[0],id:"second"});
  const result=searchPublishedPassages(pack,"support");
  assert.equal(result.total,60);assert.equal(result.matches.length,20);
  assert.deepEqual(result.matches[0].relationIds,["ab","second"]);
  assert.equal(searchPublishedPassages(pack,"support",1000).matches.length,50);
  assert.deepEqual(searchPublishedPassages({...pack,passages:[...pack.passages].reverse()},"support"),result);
});
