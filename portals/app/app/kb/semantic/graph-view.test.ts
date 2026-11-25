import test from "node:test";
import assert from "node:assert/strict";
import {performance} from "node:perf_hooks";
import {layoutGraph,layoutGroupedGraph,graphGroups,graphCommunities,graphPath} from "./graph-view";
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
test("component groups are stable, retain isolates and self loops, and cannot bridge through hidden nodes",()=>{
  const nodes=[node("a"),node("b"),node("c"),node("d"),node("e")];
  const edges=[edge("ab","a","b"),edge("self","a","a"),edge("cd","c","d"),edge("hidden-a","b","hidden"),edge("hidden-b","hidden","c")];
  const groups=graphGroups(nodes,edges);
  assert.deepEqual(groups,[{id:"a",nodeIds:["a","b"],edgeIds:["ab","self"]},{id:"c",nodeIds:["c","d"],edgeIds:["cd"]},{id:"e",nodeIds:["e"],edgeIds:[]}]);
  assert.deepEqual(graphGroups([...nodes].reverse(),[...edges].reverse()),groups);
  const layout=layoutGroupedGraph(nodes,edges);
  assert.deepEqual(layout.points,layoutGroupedGraph([...nodes].reverse(),[...edges].reverse()).points);
  assert.equal(layout.edges.length,3);
  assert.equal(new Set(layout.points.map(p=>`${p.x}:${p.y}`)).size,5);
  assert.ok(layout.points.every(p=>p.x>=0&&p.y>=0&&p.x<=layout.size&&p.y<=layout.size));
  assert.deepEqual(graphGroups(nodes,edges.filter(e=>e.id!=="ab"))[0].nodeIds,["c","d"]);
  assert.equal(layoutGroupedGraph([],[]).points.length,0);
  assert.throws(()=>graphGroups(Array.from({length:501},(_,i)=>node(String(i))),[]),/semantic_graph_budget/);
});
test("grouped layout stays bounded for 500 isolated and one fully connected component",()=>{
  const nodes=Array.from({length:500},(_,i)=>node(String(i)));
  const chain=Array.from({length:499},(_,i)=>edge(String(i),String(i),String(i+1)));
  for(const edges of [[],chain]){
    const layout=layoutGroupedGraph(nodes,edges);
    assert.equal(layout.points.length,500);
    assert.ok(layout.points.every(p=>Number.isFinite(p.x)&&Number.isFinite(p.y)&&p.x>=0&&p.y>=0&&p.x<=layout.size&&p.y<=layout.size));
  }
});
test("communities split dense neighborhoods across a weak bridge without changing business edges",()=>{
  const nodes="abcdef".split("").map(node),edges=[edge("ab","a","b"),edge("ac","a","c"),edge("bc","b","c"),edge("de","d","e"),edge("df","d","f"),edge("ef","e","f"),edge("bridge","c","d")];
  const before=JSON.stringify(edges),groups=graphCommunities(nodes,edges);
  assert.deepEqual(groups.map(g=>g.nodeIds),[["a","b","c"],["d","e","f"]]);
  assert.deepEqual(graphCommunities([...nodes].reverse(),[...edges].reverse()),groups);
  assert.equal(groups.some(g=>g.edgeIds.includes("bridge")),false);
  assert.equal(layoutGroupedGraph(nodes,edges,true).edges.length,7,"cross-community edges remain visible");
  assert.equal(JSON.stringify(edges),before);
  assert.deepEqual(graphCommunities(nodes,[...edges,edge("hidden","a","secret")]),groups);
});
test("community algorithm bounds full-size work and handles duplicates, self loops and isolates",()=>{
  const nodes=Array.from({length:500},(_,i)=>node(String(i))),edges=Array.from({length:1000},(_,i)=>edge(String(i),String(i%500),String((i+1)%500)));
  const start=performance.now(),groups=graphCommunities(nodes,edges);
  assert.equal(new Set(groups.flatMap(g=>g.nodeIds)).size,500);
  assert.ok(performance.now()-start<1000,"full-budget navigation grouping finishes in one second");
  assert.deepEqual(graphCommunities([node("a"),node("b")],[edge("self","a","a")]).map(g=>g.nodeIds),[["a"],["b"]]);
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
