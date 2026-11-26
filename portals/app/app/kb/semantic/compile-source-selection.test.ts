import test from "node:test";
import assert from "node:assert/strict";
import {compileSourceSelection} from "./compile-source-selection";
import {parseCompileTaskRequest} from "./compile-task";
const a="11111111-1111-4111-8111-111111111111",b="22222222-2222-4222-8222-222222222222";
test("explicit compile source scopes are bounded, sorted and cannot silently become all-source requests",()=>{
  const ids=[b,a];assert.deepEqual(compileSourceSelection(ids),[a,b]);assert.deepEqual(ids,[b,a]);
  for(const value of [undefined,null,[],[a,a],[""],["other"],[a.toUpperCase().replace('11111111','AAAAAAAA')],Array.from({length:101},()=>a)])assert.throws(()=>compileSourceSelection(value),/semantic_invalid_source_selection/);
  const max=Array.from({length:100},(_,i)=>`${String(i).padStart(8,"0")}-1111-4111-8111-111111111111`);assert.equal(compileSourceSelection(max).length,100);
});
test("only task creation accepts an explicit source scope; legacy creation and execution keep their contract",()=>{
  assert.deepEqual(parseCompileTaskRequest(JSON.stringify({action:"create",taskId:a,documentIds:[b,a]})),{action:"create",taskId:a,documentIds:[a,b]});
  assert.deepEqual(parseCompileTaskRequest(JSON.stringify({action:"create",taskId:a})),{action:"create",taskId:a});
  assert.throws(()=>parseCompileTaskRequest(JSON.stringify({action:"execute",taskId:a,documentIds:[b]})),/semantic_invalid_task_request/);
  for(const ids of [[],[a,a],["bad"]])assert.throws(()=>parseCompileTaskRequest(JSON.stringify({action:"create",taskId:a,documentIds:ids})),/semantic_invalid_source_selection/);
});
