import test from "node:test";
import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {readFileSync} from "node:fs";
import {parseOperationCommand,parseOperationsQuery,operationTransition} from "./operations";

test("maintenance commands enforce scope, bounded notes, valid dates and explicit workflow transitions",()=>{
  const kb=randomUUID(),create={action:"create",kbId:kb,targetType:"library",targetId:kb,eventId:randomUUID(),taskId:randomUUID(),title:"Repair source",note:"Human reported issue",state:"open",priority:"high",dueDate:"2026-11-30"};
  assert.deepEqual(parseOperationCommand(JSON.stringify(create)),create);
  for(const change of [{workspaceId:randomUUID()},{actor:"forged"},{state:"resolved"},{dueDate:"2026-02-30"},{note:""},{targetType:"library",targetId:randomUUID()}])
    assert.throws(()=>parseOperationCommand(JSON.stringify({...create,...change})),/operations_invalid_request/);
  assert.equal(operationTransition("open","blocked"),true);assert.equal(operationTransition("blocked","resolved"),true);
  assert.equal(operationTransition("resolved","in_progress"),false);assert.equal(operationTransition("resolved","open"),true);
  assert.deepEqual(parseOperationsQuery(new URLSearchParams({taskId:create.taskId,historyBefore:"21"})),{taskId:create.taskId,historyBefore:21});
  for(const query of ["state=all","kbId=bad","overdue=false",`taskId=${create.taskId}&state=open`,`taskId=${create.taskId}&historyBefore=0`,"state=open&state=blocked"])
    assert.throws(()=>parseOperationsQuery(new URLSearchParams(query)),/operations_invalid_request/);
});
test("maintenance ledger fresh and upgrade schema/grants remain identical and append only",()=>{
  const root=new URL("../../../../../deploy/database/ddl/",import.meta.url),read=(file:string)=>readFileSync(new URL(file,root),"utf8").replace(/\r\n/g,"\n");
  for(const [section,file] of [["MAINTENANCE TASK","00_baseline.sql"],["MAINTENANCE TASK LOCKS","98_column_locks.sql"]]){
    const part=(s:string)=>s.slice(s.indexOf(`-- BEGIN ${section}`),s.indexOf(`-- END ${section}`)+`-- END ${section}`.length);
    assert.equal(part(read(file)),part(read("incr/0032_maintenance_task_event.sql")));
  }
});
