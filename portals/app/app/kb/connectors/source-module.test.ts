import test from "node:test";
import assert from "node:assert/strict";
import {randomUUID,createHash} from "node:crypto";
import {readFileSync} from "node:fs";
import {parseSource,type SourceItem} from "./source-contract";
import {sourceBytes,sourceVersionDecision} from "./source-content";
import {sourceFailure} from "./source-service";
const item=():SourceItem=>{const bytes=Buffer.from("Source proof");return {id:randomUUID(),sourceDocId:"stable-a",sourceVersion:1,event:"upsert",title:"Proof",mime:"text/plain",bytes:bytes.toString("base64"),contentHash:createHash("sha256").update(bytes).digest("hex")};};
test("source batches require explicit authority boundaries, stable IDs, ordered versions and exact bytes",()=>{
 const i=item(),c={action:"stage",bindingId:randomUUID(),id:randomUUID(),mode:"backfill",items:[i],note:"Initial import"};assert.deepEqual(parseSource(c),c);assert.equal(sourceBytes(i)!.toString(),"Source proof");
 for(const bad of [{...c,workspaceId:randomUUID()},{...c,items:[i,{...i,id:randomUUID()}]},{...c,items:[{...i,sourceVersion:0}]},{...c,items:[{...i,fetchRef:"https://private"}]},{...c,note:" "}])assert.throws(()=>parseSource(bad),/source_invalid_request/);
 assert.throws(()=>parseSource({action:"create",id:randomUUID(),connectorCode:"api",externalSourceId:"Source",note:"New",acceptLibraryScope:false}),/source_invalid_request/);
 assert.throws(()=>sourceBytes({...i,contentHash:"a".repeat(64)}),/source_content_invalid/);assert.throws(()=>sourceBytes({...i,bytes:"YQ="}),/source_content_invalid/);
});
test("source ordering preserves delete tombstones and rejects equal-version contradictions",()=>{
 const i=item();assert.equal(sourceVersionDecision(undefined,i),"apply");assert.equal(sourceVersionDecision({source_version:2,event:"delete",content_hash:null},i),"obsolete");
 assert.equal(sourceVersionDecision({source_version:1,event:"upsert",content_hash:i.contentHash!},i),"unchanged");
 assert.throws(()=>sourceVersionDecision({source_version:1,event:"delete",content_hash:null},i),/source_version_conflict/);
 assert.equal(sourceVersionDecision({source_version:1,event:"delete",content_hash:null},{...i,sourceVersion:2}),"apply");
 assert.equal(sourceFailure(Error("private SQL credentials")).code,"source_unavailable");assert.equal(sourceFailure(Error("source_lease_changed")).status,409);
});
test("source-management fresh/upgrade DDL and immutable grants stay aligned",()=>{
 const root=new URL("../../../../../deploy/database/ddl/",import.meta.url),read=(f:string)=>readFileSync(new URL(f,root),"utf8").replace(/\r\n/g,"\n");
 for(const [name,file] of [["SOURCE MANAGEMENT","00_baseline.sql"],["SOURCE MANAGEMENT LOCKS","98_column_locks.sql"]]){const part=(s:string)=>s.slice(s.indexOf("-- BEGIN "+name),s.indexOf("-- END "+name)+("-- END "+name).length);assert.equal(part(read(file)),part(read("incr/0039_source_management.sql")));}
});
