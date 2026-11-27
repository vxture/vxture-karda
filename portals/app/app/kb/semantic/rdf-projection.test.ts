import {test} from "node:test";
import assert from "node:assert/strict";
import {fileURLToPath} from "node:url";
import {existsSync} from "node:fs";
import {projectRdf,resource} from "./rdf-projection";
import {executeJena,validateCurrentGraph} from "./jena-runtime";
import {projectDirectory} from "./projection";
import {tenderSnapshot,tenderSchema,CLOCK} from "./tender-fixture";

function fixture(){
  const snapshot=tenderSnapshot(),kb="00000000-0000-0000-0000-000000000001";
  const names=[...new Set([...snapshot.entities.map(x=>x.id),...snapshot.relations.map(x=>x.id),...snapshot.assertions.map(x=>x.id),...snapshot.evidence.map(x=>x.id),...snapshot.sources.map(x=>x.documentId)])];
  const ids=new Map(names.map((s,i)=>[s,"00000000-0000-0000-0000-"+String(i+10).padStart(12,"0")]));
  for(const x of snapshot.entities){x.kbId=kb;x.id=ids.get(x.id)!;}
  for(const x of snapshot.relations){x.kbId=kb;x.id=ids.get(x.id)!;x.sourceId=ids.get(x.sourceId)!;x.targetId=ids.get(x.targetId)!;x.assertionIds=x.assertionIds.map(id=>ids.get(id)!);}
  for(const x of snapshot.assertions){x.kbId=kb;x.id=ids.get(x.id)!;x.evidenceIds=x.evidenceIds.map(id=>ids.get(id)!);}
  for(const x of snapshot.evidence){x.kbId=kb;x.id=ids.get(x.id)!;x.documentId=ids.get(x.documentId)!;}
  for(const x of snapshot.sources){x.kbId=kb;x.documentId=ids.get(x.documentId)!;}
  const graph=projectDirectory(snapshot,tenderSchema,{visibleKbIds:new Set([kb]),now:CLOCK},{maxNodes:50,maxEdges:50});
  return{snapshot,kb,ids,graph};
}

test("RDF preserves stable relationship, premises and exact source anchors without source bodies",()=>{
  const {graph}=fixture();graph.nodes[0].label='line\n" <SERVICE> \\ \b';
  const rdf=projectRdf(graph,tenderSchema);
  assert.equal(rdf.edges,3);assert.equal(rdf.nodes,4);assert.match(rdf.data,/urn:karda:relation:/);assert.match(rdf.data,/urn:karda:vocab:assertion/);
  assert.match(rdf.data,/urn:karda:vocab:sourceVersion/);assert.match(rdf.data,/\\u000a/);assert.match(rdf.data,/\\u0008/);
  assert.equal(projectRdf({...graph,nodes:[...graph.nodes].reverse(),edges:[...graph.edges].reverse()},tenderSchema).fingerprint,rdf.fingerprint);
  const cross=structuredClone(graph);cross.edges[0].kbId="00000000-0000-0000-0000-000000000099";
  assert.throws(()=>projectRdf(cross,tenderSchema),/semantic_rdf_scope/);
  assert.throws(()=>projectRdf({...graph,schema:{...graph.schema,version:"other"}},tenderSchema),/semantic_rdf_scope/);
});

test("withdrawn premises are excluded before RDF conversion and cannot bridge a query",()=>{
  const {snapshot,kb}=fixture();snapshot.sources.filter(s=>s.current).forEach(s=>s.withdrawn=true);
  const graph=projectDirectory(snapshot,tenderSchema,{visibleKbIds:new Set([kb]),now:CLOCK},{maxNodes:50,maxEdges:50});
  const rdf=projectRdf(graph,tenderSchema);assert.equal(rdf.edges,0);assert.equal(rdf.data,"\n");
});

test("real Jena accepts the mapped graph, reports endpoint type violations and executes fixed SPARQL",async()=>{
  const jar=fileURLToPath(new URL("../../../../semantic/target/karda-semantic.jar",import.meta.url));
  // CI must build the real module before the app suite; this is not a mock gate.
  assert.ok(existsSync(jar),"build portals/semantic before this integration test");
  const previous=process.env.KARDA_JENA_JAR;process.env.KARDA_JENA_JAR=jar;
  try{
    const {graph,kb,ids}=fixture(),rdf=projectRdf(graph,tenderSchema);
    const report=await executeJena(rdf);assert.equal(report.conforms,true);assert.equal(report.issues.length,0);
    const result=await executeJena(rdf,{kbId:kb,seedId:ids.get("project")!,hops:2});
    assert.deepEqual(result.edgeIds,[resource("relation",kb,ids.get("r1")!),resource("relation",kb,ids.get("r2")!)]);
    const wrong=structuredClone(graph);wrong.nodes.find(n=>n.id===ids.get("project"))!.type="document";
    const invalid=await executeJena(projectRdf(wrong,tenderSchema));assert.equal(invalid.conforms,false);assert.ok(invalid.issues.length>0);
    await assert.rejects(validateCurrentGraph(wrong,tenderSchema),/semantic_shacl_invalid/);
  }finally{if(previous===undefined)delete process.env.KARDA_JENA_JAR;else process.env.KARDA_JENA_JAR=previous;}
});
