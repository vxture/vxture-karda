import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { AtlasSemanticCandidateClient, compileRelations, freezeCompilerSnapshot, runSemanticCompile,
  RELATION_COMPILER_PROMPT, type CompilerSnapshot } from "./compiler";
import { AtlasApiError } from "../atlas/client";
import { UnavailableError } from "../processing/orchestrator";
import type { ChatRequest } from "../retrieval/ask";

function fixture(){
  const kbId=randomUUID(),left=randomUUID(),right=randomUUID(),assertion=randomUUID(),doc=randomUUID();
  const snapshot:CompilerSnapshot={kbId,schema:{namespace:"test",schemaId:"objects",version:"1",entityTypes:["object"],
    relationTypes:[{id:"requires",sourceTypes:["object"],targetTypes:["object"]}]},entityTypes:[{kind:"legacy",type:"object"}],
    entities:[{id:left,kbId,kind:"legacy",name:"Alpha",aliases:["A"]},{id:right,kbId,kind:"legacy",name:"Beta",aliases:[]}],
    sources:[{kbId,documentId:doc,version:1,contentHash:"a".repeat(64)}],
    assertions:[{id:assertion,kbId,statement:"Alpha requires Beta",evidence:[{documentId:doc,version:1,start:4,end:8,excerpt:"text"}]}]};
  const proposal={type:"requires",source:{name:"A",type:"object"},target:{name:"Beta",type:"object"},assertionIds:[assertion]};
  return {snapshot,proposal,kbId,left,right};
}
test("compiler resolves same-library aliases, emits stable candidates and never accepts unknown evidence",()=>{
  const {snapshot,proposal,left,right}=fixture(),result=compileRelations(snapshot,[proposal]);
  assert.equal(result.payload.relations[0].sourceId,left);assert.equal(result.payload.relations[0].targetId,right);
  assert.equal(result.payload.relations[0].id,compileRelations(snapshot,[proposal]).payload.relations[0].id);
  const reversed=structuredClone(snapshot);reversed.entities.reverse();assert.equal(result.payload.relations[0].id,compileRelations(reversed,[proposal]).payload.relations[0].id);
  const rejected=compileRelations(snapshot,[{...proposal,assertionIds:[randomUUID()]},{...proposal,type:"unknown"},
    {...proposal,source:{name:"missing",type:"object"}},{...proposal,autoApprove:true},proposal,proposal]);
  assert.deepEqual(rejected.rejected.map(r=>r.reason),["unsupported_assertion","unknown_type","missing_entity","invalid_candidate","duplicate_relation"]);
  assert.equal(rejected.payload.relations.length,1);
});
test("compiler refuses ambiguous entities and exposes alternatives without resolving conflict",()=>{
  const {snapshot,proposal}=fixture();
  snapshot.entities.push({...snapshot.entities[1],id:randomUUID(),name:"Gamma",aliases:["Beta"]});
  assert.equal(compileRelations(snapshot,[proposal]).rejected[0].reason,"ambiguous_entity");
  snapshot.entities[2].aliases=[];
  const result=compileRelations(snapshot,[proposal,{...proposal,target:{name:"Gamma",type:"object"}}]);
  assert.equal(result.conflicts.length,1);assert.equal(result.conflicts[0].relationIds.length,2);
});
test("compiler authority snapshot rejects foreign library, changed version, invalid span and budgets",()=>{
  const {snapshot,proposal}=fixture();
  for(const change of [(s:CompilerSnapshot)=>{s.entities[0].kbId=randomUUID();},
    (s:CompilerSnapshot)=>{s.assertions[0].evidence[0].version=2;},
    (s:CompilerSnapshot)=>{s.assertions[0].evidence[0].end=99;}]){
    const bad=structuredClone(snapshot);change(bad);assert.throws(()=>freezeCompilerSnapshot(bad),/semantic_invalid_compiler_snapshot/);
  }
  assert.throws(()=>compileRelations(snapshot,Array(201).fill(proposal)),/semantic_candidate_budget/);
});
test("Atlas relation adapter uses extract selection, bounded output and maps parked capabilities",async()=>{
  const {snapshot,proposal}=fixture();let seen:ChatRequest|undefined;
  const client=new AtlasSemanticCandidateClient({chat:async req=>{seen=req;return{content:JSON.stringify({relations:[proposal]})};}});
  const context={tenantId:randomUUID(),workspaceId:randomUUID(),taskId:"compile-1"};
  assert.deepEqual(await client.propose(snapshot,context),[proposal]);
  assert.equal(seen?.taskId,"compile-1");assert.equal(seen?.maxTokens,4096);assert.equal(seen?.temperature,0);
  assert.equal(seen?.messages[0].content,RELATION_COMPILER_PROMPT);assert.match(RELATION_COMPILER_PROMPT,/untrusted data/);
  assert.equal(JSON.parse(seen!.messages[1].content).assertions[0].evidence[0].excerpt,"text");
  for(const content of ['{"relations":[],"publish":true}',"not-json",JSON.stringify({relations:Array(201).fill(proposal)})])
    await assert.rejects(new AtlasSemanticCandidateClient({chat:async()=>({content})}).propose(snapshot,context),/semantic_invalid_model_response/);
  await assert.rejects(new AtlasSemanticCandidateClient({chat:async()=>({content:"x".repeat(65537)})}).propose(snapshot,context),/semantic_model_response_budget/);
  await assert.rejects(new AtlasSemanticCandidateClient({chat:async()=>{throw new AtlasApiError("ENDPOINT_NOT_ROUTABLE",404,false,"missing");}}).propose(snapshot,context),UnavailableError);
});
test("compile coordinator isolates input, writes only valid candidates and never reviews/publishes",async()=>{
  const {snapshot,proposal,kbId}=fixture();let calls=0;
  const identity={workspaceId:randomUUID(),sub:`usr_${randomUUID()}`,roles:[],productCode:"karda"};
  const loadAuthorizedSnapshot=async()=>({snapshot,tenantId:randomUUID()});
  const store={recordCompile:async()=>{calls++;return{runId:randomUUID(),duplicate:false};}};
  const result=await runSemanticCompile(identity,kbId,"one",{loadAuthorizedSnapshot,store,candidates:{propose:async input=>{
    input.entities[0].name="mutated";return[proposal];}}});
  assert.equal(result.compilation.payload.relations.length,1);assert.equal(snapshot.entities[0].name,"Alpha");assert.equal(calls,1);
  const bad=await runSemanticCompile(identity,kbId,"two",{loadAuthorizedSnapshot,store,candidates:{propose:async()=>[{...proposal,type:"invalid"}]}});
  assert.equal(bad.runId,"");assert.equal(calls,1);
  await assert.rejects(runSemanticCompile(identity,kbId,"three",{loadAuthorizedSnapshot:async()=>{throw new Error("denied");},store,
    candidates:{propose:async()=>{throw new Error("model_must_not_run");}}}),/denied/);
});
