import test from "node:test";
import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {readFileSync} from "node:fs";
import {parseCompileTaskRequest} from "./compile-task";
import {localCompileProfile} from "./compile-profile";
import {validateOntology} from "./projection";

test("compile task requests cannot inject snapshots, identity or model configuration",()=>{
  const body={action:"create",taskId:randomUUID()};assert.deepEqual(parseCompileTaskRequest(JSON.stringify(body)),body);
  for(const extra of [{snapshot:{}},{sub:"user"},{endpointCode:"other"},{taskId:"bad"},{action:"publish"}])
    assert.throws(()=>parseCompileTaskRequest(JSON.stringify({...body,...extra})),/semantic_invalid_task_request/);
  for(const text of ["null","[]","broken"," ".repeat(1025)])assert.throws(()=>parseCompileTaskRequest(text),/semantic_invalid_task_request/);
  assert.equal(parseCompileTaskRequest(JSON.stringify({...body,action:"execute"})).action,"execute");
});

test("bootstrap ontology is a fixed local definition and never claims an Ontos version",()=>{
  const profile=localCompileProfile();validateOntology(profile.schema);
  assert.equal(profile.schema.namespace,"karda.local");assert.equal(profile.schema.version,"1");
  profile.schema.relationTypes.length=0;
  assert.equal(localCompileProfile().schema.relationTypes.length,4);
});

test("compile task baseline and increment keep structure and column locks in sync",()=>{
  const root=new URL("../../../../../deploy/database/ddl/",import.meta.url);
  const read=(name:string)=>readFileSync(new URL(name,root),"utf8");
  const increment=read("incr/0017_semantic_compile_task.sql");
  for(const [label,file] of [["TASK","00_baseline.sql"],["TASK LOCKS","98_column_locks.sql"]]){
    const section=(text:string)=>text.match(new RegExp(`-- BEGIN SEMANTIC ${label}\\r?\\n[\\s\\S]*?-- END SEMANTIC ${label}(?:\\r?\\n|$)`))![0];
    assert.equal(section(read(file)),section(increment));
  }
});
