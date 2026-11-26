import test from "node:test";
import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {parseTopicKnowledge,type TopicKnowledgeResult} from "./topic-knowledge";
import {topicKnowledgeTool} from "./topic-knowledge-tool";
import {dispatchTool} from "../tools/dispatch";
import type {CallerContext} from "../tools/s2s";
test("topic knowledge requests expose only bounded consumer actions",()=>{
  const kb_id=randomUUID();assert.deepEqual(parseTopicKnowledge({kb_id,action:"list"}),{kbId:kb_id,action:"list"});
  const read={kb_id,action:"read",relation_type:"requires"};assert.equal(parseTopicKnowledge({...read,summary_id:randomUUID()}).action,"read");
  for(const value of [{...read,kb_id:"bad"},{...read,relation_type:" "},{...read,relation_type:"x".repeat(129)},{...read,summary_id:null},{...read,before:randomUUID(),summary_id:randomUUID()},
    {...read,identity:{}},{...read,action:"compose"},{kb_id,action:"list",before:randomUUID()}])assert.throws(()=>parseTopicKnowledge(value),/topic_knowledge_invalid/);
});
test("topic knowledge OBO dispatch uses read permission and trusted caller identity",async()=>{
  const caller:CallerContext={mode:"obo",callerProduct:"runos",org:randomUUID(),workspace:randomUUID(),user:"usr_topic",productAccess:{roles:["readonly"],permissions:["product.enter","data.read"]}};
  let calls=0;const body:TopicKnowledgeResult={format:"karda.topic-knowledge.v1",checkedAt:"2026-11-26T00:00:00Z",kbId:randomUUID(),topics:[],dossier:null,summary:null,summaries:[],nextBefore:null,gaps:[]};
  const backend:typeof topicKnowledgeTool=(who,args)=>topicKnowledgeTool(who,args,async(identity,input,admit)=>{calls++;assert.equal(identity.productCode,"runos");assert.equal(identity.sub,caller.user);assert.equal(input.kbId,body.kbId);assert.equal(await admit(),true);return body;});
  const args={kb_id:body.kbId,action:"list"};
  assert.equal((await dispatchTool("karda.topic_knowledge",args,caller,{listKbs:async()=>[],topicKnowledge:backend})).status,200);
  assert.equal((await backend({...caller,mode:"service",user:null},args)).status,403);assert.equal(calls,1);
  assert.equal((await backend({...caller,productAccess:undefined},args)).status,403);
  const denied=await topicKnowledgeTool(caller,args,async()=>{throw Error("private SQL text");});assert.equal(denied.status,503);assert.deepEqual(denied.body,{error:"topic_knowledge_unavailable"});
});
