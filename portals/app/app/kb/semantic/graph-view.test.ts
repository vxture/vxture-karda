import test from "node:test";
import assert from "node:assert/strict";
import {performance} from "node:perf_hooks";
import {layoutGraph,graphPath} from "./graph-view";
import {packageMarkdown} from "./package-markdown";
import type {GraphEntity,SemanticRelation} from "./contracts";
import type {KnowledgePackage} from "./read-postgres";

const node=(id:string):GraphEntity=>({id,kbId:"kb",type:"entity",label:id});
const edge=(id:string,a:string,b:string):SemanticRelation=>({id,kbId:"kb",type:"requires",sourceId:a,targetId:b,assertionIds:["assertion"],origin:"asserted",schema:{namespace:"local",schemaId:"objects",version:"1"}});
test("graph layout and paths use only supplied eligible nodes and preserve deterministic business directions",()=>{
  const nodes=[node("a"),node("b"),node("c")],edges=[edge("ab","a","b"),edge("bc","b","c"),edge("leak","a","hidden")];
  const layout=layoutGraph(nodes,edges);
  assert.deepEqual(layout.edges.map(e=>e.id),["ab","bc"]);
  assert.deepEqual(layout.points,layoutGraph([...nodes].reverse(),edges).points);
  assert.deepEqual(graphPath(nodes,edges,"c","a"),["bc","ab"]);
  assert.deepEqual(edges[0].sourceId,"a");assert.equal(graphPath(nodes,edges,"a","hidden"),null);
  assert.equal(graphPath(nodes,[edges[0]],"a","c"),null);assert.deepEqual(graphPath(nodes,edges,"a","a"),[]);
  assert.throws(()=>layoutGraph([node("a"),node("a")],[]),/semantic_graph_budget/);
});
test("graph scale budget: 500 nodes/1000 edges layout and path remain bounded",()=>{
  const nodes=Array.from({length:500},(_,i)=>node(String(i)));
  const edges=Array.from({length:1000},(_,i)=>edge(String(i),String(i%500),String((i+1)%500)));
  const start=performance.now();
  for(let i=0;i<30;i++){
    const layout=layoutGraph(nodes,edges);assert.equal(layout.points.length,500);
    assert.equal(graphPath(nodes,edges,"0","250")?.length,250);
  }
  assert.ok(performance.now()-start<5000,"30 full-budget layout/path cycles must complete within five seconds");
  assert.throws(()=>layoutGraph([...nodes,node("overflow")],edges),/semantic_graph_budget/);
});
test("Markdown export includes only package facts and exact evidence, escapes executable source markup",()=>{
  const pack:KnowledgePackage={format:"karda.knowledge-package.v1",schema:{namespace:"local",schemaId:"objects",version:"1"},
    nodes:[node("a"),node("b")],edges:[edge("ab","a","b")],assertions:[{id:"assertion",kbId:"kb",contentState:"indexed",verificationState:"verified",
      verificationExpiresAt:null,validFrom:null,validUntil:null,supersededById:null,evidenceIds:["evidence"]}],
    evidence:[{id:"evidence",kbId:"kb",documentId:"document",documentVersion:2,start:0,end:10,stance:"supports"}],
    statements:[{id:"assertion",statement:"A requires B"}],passages:[{evidenceId:"evidence",excerpt:"<script>alert(1)</script> [run](javascript:bad)"}],
    sourceStatus:"complete",gaps:[],truncated:false};
  const md=packageMarkdown(pack);assert.match(md,/A requires B/);assert.match(md,/UTF-16 0:10/);
  assert.equal(md.includes("<script>"),false);assert.equal(md.includes("[run](javascript:bad)"),false);
  assert.equal(packageMarkdown({...pack,edges:[],nodes:[],assertions:[],evidence:[],passages:[],statements:[]}).includes("A requires B"),false);
});
