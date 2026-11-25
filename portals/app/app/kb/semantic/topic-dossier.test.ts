import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {fileURLToPath} from "node:url";
import {composeTopicDossier,topicDossierHash} from "./topic-dossier";
import type {KnowledgePackage} from "./read-postgres";

export function topicPackage():KnowledgePackage{
  const schema={namespace:"test",schemaId:"test",version:"1"};
  return {format:"karda.knowledge-package.v1",schema,nodes:[{id:"a",kbId:"kb",type:"entity",label:"A"},{id:"b",kbId:"kb",type:"entity",label:"B"}],
    edges:[{id:"r",kbId:"kb",schema,type:"requires",sourceId:"a",targetId:"b",assertionIds:["s"],origin:"asserted"}],
    assertions:[{id:"s",kbId:"kb",contentState:"indexed",verificationState:"verified",verificationExpiresAt:null,validFrom:null,validUntil:null,supersededById:null,evidenceIds:["e"]}],
    evidence:[{id:"e",kbId:"kb",documentId:"d",documentVersion:1,start:0,end:5,stance:"supports",pages:[1,3]}],
    statements:[{id:"s",statement:"A requires B"}],passages:[{evidenceId:"e",excerpt:"proof"}],sourceStatus:"complete",gaps:[],truncated:false};
}
test("topic composition retains exact statements and versioned evidence; JSONB key order does not change hashes",()=>{
  const pack=topicPackage(),draft=composeTopicDossier(pack,"requires");
  assert.equal(draft.sections[0].statements[0].text,"A requires B");
  assert.deepEqual(draft.sections[0].statements[0].evidence[0],{id:"e",documentId:"d",version:1,start:0,end:5,pages:[1,3],excerpt:"proof"});
  const reordered=JSON.parse(JSON.stringify(draft),(key,value)=>value&&typeof value==="object"&&!Array.isArray(value)?Object.fromEntries(Object.entries(value).reverse()):value);
  assert.equal(topicDossierHash(reordered),topicDossierHash(draft));
  const changed=topicPackage();changed.passages[0].excerpt="other";
  assert.notEqual(composeTopicDossier(changed,"requires").inputHash,draft.inputHash);
  assert.throws(()=>composeTopicDossier({...pack,truncated:true},"requires"),/semantic_topic_incomplete/);
  assert.throws(()=>composeTopicDossier({...pack,sourceStatus:"partial"},"requires"),/semantic_topic_incomplete/);
  assert.throws(()=>composeTopicDossier({...pack,edges:[]},"requires"),/semantic_topic_empty/);
});
test("topic DDL and grants match fresh baseline and service cannot update or delete dossiers",()=>{
  const root=fileURLToPath(new URL("../../../../../deploy/database/ddl/",import.meta.url));
  const read=(name:string)=>readFileSync(`${root}/${name}`,"utf8").replaceAll("\r\n","\n");
  const inc=read("incr/0019_topic_dossier.sql");
  for(const [part,file] of [["TOPIC DOSSIER","00_baseline.sql"],["TOPIC DOSSIER LOCKS","98_column_locks.sql"]]){
    const section=(s:string)=>s.slice(s.indexOf(`-- BEGIN ${part}`),s.indexOf(`-- END ${part}`)+`-- END ${part}`.length);
    assert.equal(section(inc),section(read(file)));
  }
  assert.match(inc,/REVOKE UPDATE, DELETE/);
});
