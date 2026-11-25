import test from "node:test";
import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {readFileSync} from "node:fs";
import {fileURLToPath} from "node:url";
import {generateTopicSummary,validateTopicSummary,TOPIC_SUMMARY_PROMPT} from "./topic-summary";
import type {TopicDossier} from "./topic-dossier";
import {executeTopicSummary} from "./topic-summary-execution";

const input:TopicDossier={format:"karda.topic-dossier.v1",relationType:"requires",inputHash:"a".repeat(64),schema:{namespace:"test",schemaId:"test",version:"1"},sections:[{
  relationId:"r",source:{id:"a",label:"A"},target:{id:"b",label:"B"},statements:[{id:"s",text:"A requires B",evidence:[{id:"e",documentId:"d",version:1,start:0,end:5,pages:[1],excerpt:"proof"}]}]}]};
test("model summary admits bounded cited paragraphs only, with evidence identifiers bound to supplied current dossier",()=>{
  const valid={paragraphs:[{text:"A requires B",citations:["e"]}]};
  assert.equal(validateTopicSummary(valid,input).inputHash,input.inputHash);
  for(const value of [{paragraphs:[]},{paragraphs:[{text:"made up",citations:["unknown"]}]},{paragraphs:[{text:"no support",citations:[]}]},
    {paragraphs:[{text:"repeat",citations:["e","e"]}]},{paragraphs:[{text:"x".repeat(2001),citations:["e"]}]},{...valid,approved:true}])
    assert.throws(()=>validateTopicSummary(value,input),/semantic_summary_invalid_output/);
});
test("Atlas summary call uses existing extract selector, trusted tenant/workspace/task, bounded output and untrusted-data prompt",async()=>{
  const context={tenantId:randomUUID(),workspaceId:randomUUID(),taskId:`karda:topic:${randomUUID()}`};let calls=0;
  const result=await generateTopicSummary(input,context,{chat:async request=>{
    calls++;assert.equal(request.endpointCode,"chat/extract");assert.equal(request.tenantId,context.tenantId);assert.equal(request.taskId,context.taskId);
    assert.equal(request.messages[0].content,TOPIC_SUMMARY_PROMPT);assert.match(TOPIC_SUMMARY_PROMPT,/untrusted/);
    assert.equal(JSON.parse(request.messages[1].content).inputHash,input.inputHash);assert.equal(request.maxTokens,4096);
    return {content:JSON.stringify({paragraphs:[{text:"A requires B",citations:["e"]}]})};
  }},{endpointCode:"chat/extract"});
  assert.equal(calls,1);assert.equal(result.payload.paragraphs.length,1);
  await assert.rejects(generateTopicSummary(input,context,{chat:async()=>({content:"invalid"})}),/semantic_summary_invalid_output/);
});
test("summary execution never calls a model for denied or existing work, and save rechecks authority after model execution",async()=>{
  const identity={workspaceId:randomUUID(),sub:"user",roles:[],productCode:"karda"},kb=randomUUID(),id=randomUUID(),dossierId=randomUUID();
  let generated=0,prepared=0,saved=0;
  const response={items:[],more:false,nextCursor:null,focusedId:null,savedId:null,duplicate:false,modelInput:input,availableTypes:["requires"],truncated:false};
  const deps:NonNullable<Parameters<typeof executeTopicSummary>[5]>={handle:async(who,library,request)=>{
    assert.equal(who.sub,"user");assert.equal(library,kb);
    if(request.action==="summary_prepare"){prepared++;return response;}
    saved++;throw new Error("semantic_topic_conflict");
  },tenant:async()=>randomUUID(),client:()=>({chat:async()=>{generated++;return {content:JSON.stringify({paragraphs:[{text:"A requires B",citations:["e"]}]})};}})};
  await assert.rejects(executeTopicSummary(identity,kb,id,dossierId,async()=>true,deps),/semantic_topic_conflict/);
  assert.equal(generated,1);assert.equal(saved,1);assert.equal(prepared,1);
  const existing=await executeTopicSummary(identity,kb,id,dossierId,async()=>true,{...deps,handle:async()=>({...response,modelInput:null,duplicate:true})});
  assert.equal(existing.duplicate,true);assert.equal(generated,1);
  await assert.rejects(executeTopicSummary(identity,kb,id,dossierId,async()=>true,{...deps,handle:async()=>{throw new Error("semantic_topic_denied");}}),/semantic_topic_denied/);
  assert.equal(generated,1);
});
test("model summary structure and immutable grants are identical for fresh and incremental databases",()=>{
  const root=fileURLToPath(new URL("../../../../../deploy/database/ddl/",import.meta.url)),read=(name:string)=>readFileSync(`${root}/${name}`,"utf8").replaceAll("\r\n","\n");
  const increment=read("incr/0020_topic_summary.sql");
  for(const [name,file] of [["TOPIC SUMMARY","00_baseline.sql"],["TOPIC SUMMARY LOCKS","98_column_locks.sql"]]){
    const section=(s:string)=>s.slice(s.indexOf(`-- BEGIN ${name}`),s.indexOf(`-- END ${name}`)+`-- END ${name}`.length);
    assert.equal(section(increment),section(read(file)));
  }
});
