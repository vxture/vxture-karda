import test from "node:test";
import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {readFileSync} from "node:fs";
import {parseRolloutCommand,rolloutState} from "./rollout-control";

test("rollout changes require explicit version, event, boolean and bounded reason",()=>{
  const input={eventId:randomUUID(),expectedRevision:0,enabled:false,reason:" planned drill "};
  assert.equal(parseRolloutCommand(input).reason,"planned drill");
  for(const patch of [{eventId:"bad"},{expectedRevision:-1},{expectedRevision:0.5},{expectedRevision:2147483647},{enabled:"false"},{reason:" "},{reason:"x".repeat(1001)},{workspaceId:randomUUID()},{actor:"other"}])
    assert.throws(()=>parseRolloutCommand({...input,...patch}),/knowledge_rollout_invalid/);
  assert.deepEqual(rolloutState([]),{format:"karda.knowledge-rollout.v1",revision:0,enabled:true,history:[]});
});
test("rollout event structure and immutable grants match fresh and incremental paths",()=>{
  const root=new URL("../../../../../deploy/database/ddl/",import.meta.url);
  const read=(s:string)=>readFileSync(new URL(s,root),"utf8").replaceAll("\r\n","\n");
  const increment=read("incr/0029_knowledge_rollout_control.sql");
  for(const [file,label] of [["00_baseline.sql","KNOWLEDGE ROLLOUT"],["98_column_locks.sql","KNOWLEDGE ROLLOUT LOCKS"]]){
    const start=`-- BEGIN ${label}\n`,end=`-- END ${label}`,section=(s:string)=>s.slice(s.indexOf(start),s.indexOf(end)+end.length);
    assert.ok(read(file).includes(start));assert.equal(section(read(file)),section(increment));
  }
});
