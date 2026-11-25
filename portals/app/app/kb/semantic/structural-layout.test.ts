import test from "node:test";
import assert from "node:assert/strict";
import {performance} from "node:perf_hooks";
import {structuralLayout,validLayoutCoordinates} from "./structural-layout";

test("structural layout is deterministic across order, duplicate direction and self loops",()=>{
  const ids=["a","b","c","d","isolate"],links=[{sourceId:"a",targetId:"b"},{sourceId:"a",targetId:"c"},{sourceId:"a",targetId:"d"}];
  const first=structuralLayout({ids,links});assert.ok(validLayoutCoordinates(first,ids));
  assert.deepEqual(first,structuralLayout({ids:[...ids].reverse(),links:[...links].reverse().map(e=>({sourceId:e.targetId,targetId:e.sourceId}))}));
  assert.deepEqual(first,structuralLayout({ids,links:[...links,...links,{sourceId:"a",targetId:"a"}]}));
  const points=new Map(first.points.map(p=>[p.id,p])),distance=(a:string,b:string)=>Math.hypot(points.get(a)!.x-points.get(b)!.x,points.get(a)!.y-points.get(b)!.y);
  assert.ok(distance("a","b")<distance("b","c"),"star hub settles nearer leaves than leaf-to-leaf separation");
  assert.ok(distance("a","isolate")>distance("a","b"),"isolates occupy separate cells");
});

test("structural layout bounds full-budget work, disconnected packing and coordinates",()=>{
  const ids=Array.from({length:500},(_,i)=>String(i)),links=Array.from({length:1000},(_,i)=>({sourceId:String(i%500),targetId:String((i+1)%500)}));
  const start=performance.now(),value=structuralLayout({ids,links});
  assert.ok(performance.now()-start<5000,"bounded full topology finishes within five seconds");assert.ok(validLayoutCoordinates(value,ids));
  const isolated=structuralLayout({ids,links:[]});assert.ok(validLayoutCoordinates(isolated,ids));
  assert.equal(new Set(isolated.points.map(p=>`${p.x}/${p.y}`)).size,500);
  assert.ok(validLayoutCoordinates(structuralLayout({ids:[],links:[]}),[]));
  assert.ok(validLayoutCoordinates(structuralLayout({ids:["only"],links:[]}),["only"]));
  assert.throws(()=>structuralLayout({ids:[...ids,"overflow"],links}),/semantic_layout_budget/);
  assert.throws(()=>structuralLayout({ids,links:[...links,links[0]]}),/semantic_layout_budget/);
  assert.throws(()=>structuralLayout({ids:["a","a"],links:[]}),/semantic_layout_budget/);
  assert.throws(()=>structuralLayout({ids:["a"],links:[{sourceId:"a",targetId:"hidden"}]}),/semantic_layout_topology/);
});

test("worker coordinates cannot introduce identities, duplicates, invalid bounds or non-finite values",()=>{
  const good={size:100,points:[{id:"a",x:50,y:50}]};assert.ok(validLayoutCoordinates(good,["a"]));
  for(const value of [null,{}, {...good,size:Infinity},{...good,size:0},{...good,size:1000001},
    {...good,points:[{id:"hidden",x:50,y:50}]},{...good,points:[]},{...good,points:[{id:"a",x:NaN,y:50}]},
    {...good,points:[{id:"a",x:-1,y:50}]},{...good,points:[{id:"a",x:50,y:101}]}])assert.equal(validLayoutCoordinates(value,["a"]),false);
  assert.equal(validLayoutCoordinates({size:100,points:[{id:"a",x:1,y:1},{id:"a",x:2,y:2}]},["a","b"]),false);
});
