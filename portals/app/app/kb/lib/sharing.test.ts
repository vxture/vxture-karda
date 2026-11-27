import test from "node:test";
import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {readFileSync} from "node:fs";
import {parseSharing} from "./sharing";
import {sharingFailure} from "./sharing-service";
test("sharing commands require an explicit preview and reject forged authority, missing reasons and stale-CAS shapes",()=>{
 assert.deepEqual(parseSharing({action:"preview",target:"private"}),{action:"preview",target:"private"});
 const c={action:"apply",target:"ws_published",eventId:randomUUID(),expectedRevision:0,previewHash:"a".repeat(64),note:"Publish intentionally"};assert.deepEqual(parseSharing(c),c);
 for(const bad of [{target:"private"},{...c,identity:{}},{...c,expectedRevision:-1},{...c,note:" "},{...c,previewHash:""},{...c,target:"public"}])assert.throws(()=>parseSharing(bad),/sharing_invalid_request/);
 assert.deepEqual(sharingFailure(Error("private SQL password")),{code:"sharing_unavailable",status:503});assert.equal(sharingFailure(Error("sharing_changed")).status,409);
});
test("sharing fresh and upgrade declarations preserve immutable event grants",()=>{
 const root=new URL("../../../../../deploy/database/ddl/",import.meta.url),read=(f:string)=>readFileSync(new URL(f,root),"utf8").replace(/\r\n/g,"\n");
 for(const [name,file] of [["LIBRARY SHARING","00_baseline.sql"],["LIBRARY SHARING LOCKS","98_column_locks.sql"]]){const part=(s:string)=>s.slice(s.indexOf("-- BEGIN "+name),s.indexOf("-- END "+name)+("-- END "+name).length);assert.equal(part(read(file)),part(read("incr/0038_library_sharing.sql")));}
});
