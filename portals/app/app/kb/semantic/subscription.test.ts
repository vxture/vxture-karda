import test from "node:test";
import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {readFileSync} from "node:fs";
import {parseSubscription} from "./subscription";
import {subscriptionTool} from "./subscription-tool";
import {dispatchTool} from "../tools/dispatch";
import type {CallerContext} from "../tools/s2s";
test("subscription requests pin windows and reject client authority, page cursors and invalid acknowledgements",()=>{
  const command={action:"create",id:randomUUID(),name:"Agent checkpoint",window:{kb_id:randomUUID(),entity_ids:[]}};
  assert.deepEqual(parseSubscription(command),command);
  for(const patch of [{identity:{}},{window:{...command.window,page_cursor:""}},{window:{...command.window,known_revision:"a".repeat(64)}},{name:""}])
    assert.throws(()=>parseSubscription({...command,...patch}),/subscription_invalid/);
  for(const input of [{action:"poll",id:command.id,after:-1},{action:"ack",id:command.id,sequence:0,revision:"a".repeat(64),expectedAck:0},
    {action:"list",productCode:"other"},{action:"poll",id:command.id,after:1,body:{}}])assert.throws(()=>parseSubscription(input),/subscription_invalid/);
});
test("subscription tool and dispatch enforce OBO/read rights and avoid leaking private errors",async()=>{
  const caller:CallerContext={mode:"obo",callerProduct:"runos",org:randomUUID(),workspace:randomUUID(),user:`usr_${randomUUID()}`,
    productAccess:{roles:["readonly"],permissions:["product.enter","data.read"]}};
  let calls=0;
  const backend=async(who:CallerContext,args:Record<string,unknown>)=>subscriptionTool(who,args,async(identity)=>{calls++;assert.equal(identity.productCode,"runos");return {format:"karda.subscriptions.v1",subscriptions:[],nextBefore:null};});
  const backends={listKbs:async()=>[],knowledgeSubscription:backend};
  assert.equal((await dispatchTool("karda.knowledge_subscription",{action:"list"},caller,backends)).status,200);
  assert.equal((await dispatchTool("karda.knowledge_subscription",{action:"list"},{...caller,mode:"service",user:null},backends)).status,403);
  assert.equal((await dispatchTool("karda.knowledge_subscription",{action:"list"},{...caller,productAccess:undefined},backends)).status,403);assert.equal(calls,1);
  const failed=await subscriptionTool(caller,{action:"list"},async()=>{throw Error("private SQL credentials");});assert.deepEqual(failed,{status:503,body:{error:"subscription_unavailable"}});
});
test("subscription fresh and upgrade DDL and column grants are in lockstep",()=>{
  const root=new URL("../../../../../deploy/database/ddl/",import.meta.url),read=(f:string)=>readFileSync(new URL(f,root),"utf8").replace(/\r\n/g,"\n");
  for(const [section,file] of [["KNOWLEDGE SUBSCRIPTIONS","00_baseline.sql"],["KNOWLEDGE SUBSCRIPTION LOCKS","98_column_locks.sql"]]){
    const part=(s:string)=>s.slice(s.indexOf(`-- BEGIN ${section}`),s.indexOf(`-- END ${section}`)+`-- END ${section}`.length);
    assert.equal(part(read(file)),part(read("incr/0034_knowledge_subscriptions.sql")));
  }
});
