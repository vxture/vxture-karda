import test from "node:test";
import assert from "node:assert/strict";
import {centerGraphCamera,defaultGraphCamera,graphCanvasPoint,graphViewport,graphSegmentVisible,visibleGraph,zoomGraphCamera,type GraphLayout} from "./graph-viewport";

test("wide and tall SVG letterboxing maps pointer pixels and camera viewport exactly",()=>{
  const wide=graphViewport(1000,1000,500,defaultGraphCamera());
  assert.deepEqual(wide,{left:-500,top:0,right:1500,bottom:1000});
  assert.deepEqual(graphViewport(1000,500,1000,defaultGraphCamera()),{left:0,top:-500,right:1000,bottom:1500});
  const a=graphCanvasPoint(1000,1000,500,100,100),b=graphCanvasPoint(1000,1000,500,150,150);
  assert.equal(b.x-a.x,100);assert.equal(b.y-a.y,100,"equal screen distances use the same SVG scale on both axes");
  assert.deepEqual(graphCanvasPoint(1000,1000,500,500,250),{x:500,y:500});
});

test("pointer-anchored zoom preserves world coordinates and clamps without drift",()=>{
  const camera={zoom:2,x:300,y:-100},anchor={x:170,y:800},size=1000;
  const world=(v:number,offset:number,zoom:number)=>(v-size/2-offset)/zoom+size/2;
  const next=zoomGraphCamera(size,camera,8,anchor);
  assert.equal(world(anchor.x,camera.x,camera.zoom),world(anchor.x,next.x,next.zoom));
  assert.equal(world(anchor.y,camera.y,camera.zoom),world(anchor.y,next.y,next.zoom));
  const max=zoomGraphCamera(size,next,100,anchor);assert.equal(max.zoom,16);
  assert.deepEqual(zoomGraphCamera(size,max,100,anchor),max);
  assert.equal(zoomGraphCamera(size,camera,0,anchor).zoom,.2);
  const centered=centerGraphCamera(size,camera,{x:100,y:700});
  const bounds=graphViewport(size,500,500,centered);
  assert.equal((bounds.left+bounds.right)/2,100);assert.equal((bounds.top+bounds.bottom)/2,700);
});

test("viewport retains crossing and boundary edges without bridging missing endpoints",()=>{
  const bounds={left:0,top:0,right:100,bottom:100};
  assert.ok(graphSegmentVisible({x:-100,y:50},{x:200,y:50},bounds));
  assert.ok(graphSegmentVisible({x:-10,y:-10},{x:0,y:0},bounds));
  assert.ok(graphSegmentVisible({x:0,y:0},{x:0,y:0},bounds));
  assert.equal(graphSegmentVisible({x:-1,y:0},{x:-1,y:100},bounds),false);
  assert.equal(graphSegmentVisible({x:-1,y:-1},{x:-1,y:-1},bounds),false);
  assert.equal(graphSegmentVisible({x:-100,y:1},{x:1,y:-100},bounds),false,"bounding-box overlap alone must not count as intersection");
});

test("full-budget culling preserves complete input, selected/keyboard pins and path directions",()=>{
  const layout:GraphLayout={size:5000,points:Array.from({length:500},(_,i)=>({id:String(i),kbId:"kb",type:"entity",label:String(i),x:i*10,y:i*10})),
    edges:Array.from({length:1000},(_,i)=>({id:String(i),kbId:"kb",type:"requires",sourceId:String(i%500),targetId:String((i%500+1)%500),assertionIds:[],origin:"asserted",schema:{namespace:"local",schemaId:"objects",version:"1"}}))};
  const before=JSON.stringify(layout),bounds={left:0,top:0,right:100,bottom:100};
  const view=visibleGraph(layout,bounds,["499"],["200"],0);
  assert.equal(view.points.length,12);assert.ok(view.points.some(p=>p.id==="499"));
  assert.ok(view.edges.some(e=>e.id==="200"));assert.ok(view.edges.length<1000);
  assert.equal(view.edges.find(e=>e.id==="200")?.sourceId,"200");
  const invalid={...layout,edges:[...layout.edges,{...layout.edges[0],id:"missing",targetId:"hidden"}]};
  assert.equal(visibleGraph(invalid,bounds,[],["missing"]).edges.some(e=>e.id==="missing"),false);
  assert.equal(JSON.stringify(layout),before);
});
