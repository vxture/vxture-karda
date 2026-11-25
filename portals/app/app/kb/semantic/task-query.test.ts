import test from "node:test";
import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {parseCompileTaskQuery} from "./task-query";

test("compile operations queries bind a single lookup or a bounded state/history page, never caller authority",()=>{
  const id=randomUUID();
  assert.deepEqual(parseCompileTaskQuery(new URLSearchParams({before:id,state:"failed"})),{before:id,state:"failed"});
  assert.deepEqual(parseCompileTaskQuery(new URLSearchParams({taskId:id})),{taskId:id});
  for(const raw of ["before=bad","taskId=bad","state=unknown",`taskId=${id}&state=failed`,`taskId=${id}&before=${id}`,"state=failed&state=running","user=other","before=",`taskId=${id}&snapshot=old`])
    assert.throws(()=>parseCompileTaskQuery(new URLSearchParams(raw)),/semantic_invalid_task_request/);
});
