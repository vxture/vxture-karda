import test from "node:test";
import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {readFileSync} from "node:fs";
import {parsePilot} from "./pilot";
import {pilotWindow} from "./pilot-window";
import {pilotFailure} from "./pilot-service";
import type {SourceSearchResult} from "../retrieval/source-search";
import type {KnowledgePackage} from "./read-postgres";
test("pilot contracts reject client authority, mutable queries in review, invalid verdicts and missing revision or reason",()=>{
 const create={action:"create",kbId:randomUUID(),id:randomUUID(),title:"Approval pilot",query:"approval",topK:10,note:"Compare current routes"};
 assert.deepEqual(parsePilot(create),create);
 for(const input of [{...create,workspaceId:randomUUID()},{...create,topK:0},{...create,topK:21},{...create,query:" "},{...create,note:" "}])assert.throws(()=>parsePilot(input),/pilot_invalid_request/);
 const review={action:"review",kbId:create.kbId,id:create.id,observationId:randomUUID(),eventId:randomUUID(),expectedRevision:0,verdict:"neither",note:"No support"};assert.deepEqual(parsePilot(review),review);
 for(const patch of [{query:"changed"},{verdict:"approved"},{expectedRevision:-1},{observationId:""},{note:""}])assert.throws(()=>parsePilot({...review,...patch}),/pilot_invalid_request/);
});
test("comparison fingerprint binds identity, question, returned bodies and evidence, with honest independent-window counts",()=>{
 const source={mode:"source_only",items:[{documentId:"doc",text:"source"}],partial:false,gaps:[],searchedDocuments:3,searchedPassages:4,matchedPassages:2,truncated:true} as unknown as SourceSearchResult;
 const knowledge={edges:[{id:"relation"}],evidence:[{documentId:"doc"}],search:{matchedRelations:5},sourceStatus:"complete",truncated:true} as unknown as KnowledgePackage;
 const first=pilotWindow("identity","case","question",10,source,knowledge);assert.equal(first.summary.sharedDocuments,1);assert.equal(first.summary.matchedRelations,5);assert.equal(first.summary.sourceTruncated,true);
 assert.equal(first.fingerprint,pilotWindow("identity","case","question",10,structuredClone(source),structuredClone(knowledge)).fingerprint);
 for(const next of [pilotWindow("other","case","question",10,source,knowledge),pilotWindow("identity","case","changed",10,source,knowledge),pilotWindow("identity","case","question",10,{...source,partial:true},knowledge)])assert.notEqual(next.fingerprint,first.fingerprint);
});
test("pilot errors remain actionable without exposing upstream details and fresh/upgrade schema is identical",()=>{
 assert.deepEqual(pilotFailure(Error("private SQL password")),{code:"pilot_unavailable",status:503});assert.equal(pilotFailure(Error("pilot_window_changed")).status,409);assert.equal(pilotFailure(Error("semantic_read_denied")).status,403);
 const root=new URL("../../../../../deploy/database/ddl/",import.meta.url),read=(f:string)=>readFileSync(new URL(f,root),"utf8").replace(/\r\n/g,"\n");
 for(const [name,file] of [["PILOT WORKFLOW","00_baseline.sql"],["PILOT WORKFLOW LOCKS","98_column_locks.sql"]]){const part=(s:string)=>s.slice(s.indexOf("-- BEGIN "+name),s.indexOf("-- END "+name)+("-- END "+name).length);assert.equal(part(read(file)),part(read("incr/0036_pilot_workflow.sql")));}
});
