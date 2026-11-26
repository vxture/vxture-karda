import test from "node:test";
import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {readFileSync} from "node:fs";
import {parseProfileCommand,validateCompileProfile,type CompileProfile} from "./profile-config";
import {profileHash} from "./profile-authority";
export const sampleProfile=():CompileProfile=>({schema:{namespace:"karda.config",schemaId:"domain-relations",version:"1",entityTypes:["object"],
  relationTypes:[{id:"requires",sourceTypes:["object"],targetTypes:["object"]}]},entityTypes:[{kind:"thing",type:"object"}]});
test("profile definitions and commands reject forged namespaces, missing types, duplicate mappings and extra authority",()=>{
  const definition=sampleProfile(),command={action:"save",id:randomUUID(),title:"Domain",definition};
  assert.deepEqual(parseProfileCommand(JSON.stringify(command)),command);
  const swapped={entityTypes:definition.entityTypes,schema:{...definition.schema}};assert.equal(profileHash(definition),profileHash(swapped));
  for(const mutate of [(p:CompileProfile)=>p.schema.namespace="ontos",(p:CompileProfile)=>p.schema.entityTypes.push("object"),
    (p:CompileProfile)=>p.schema.relationTypes[0].targetTypes=["missing"],(p:CompileProfile)=>p.entityTypes.push({...p.entityTypes[0]}),
    (p:CompileProfile)=>p.schema.version=undefined as any]){const p=sampleProfile();mutate(p);assert.throws(()=>validateCompileProfile(p),/profile_invalid/);}
  assert.throws(()=>parseProfileCommand(JSON.stringify({...command,workspaceId:randomUUID()})),/profile_invalid/);
  assert.throws(()=>parseProfileCommand(JSON.stringify({action:"activate",eventId:randomUUID(),profileId:null,expectedRevision:0,note:""})),/profile_invalid/);
});
test("compile profile schema and immutable grants match fresh and upgrade definitions",()=>{
  const root=new URL("../../../../../deploy/database/ddl/",import.meta.url),read=(f:string)=>readFileSync(new URL(f,root),"utf8").replace(/\r\n/g,"\n");
  for(const [name,file] of [["COMPILE PROFILES","00_baseline.sql"],["COMPILE PROFILE LOCKS","98_column_locks.sql"]]){
    const part=(s:string)=>s.slice(s.indexOf(`-- BEGIN ${name}`),s.indexOf(`-- END ${name}`)+`-- END ${name}`.length);
    assert.equal(part(read(file)),part(read("incr/0033_compile_profiles.sql")));
  }
});
