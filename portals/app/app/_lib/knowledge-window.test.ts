import test from "node:test";
import assert from "node:assert/strict";
import {KnowledgeWindowClient,KnowledgeWindowError,initialKnowledgeEntity} from "./knowledge-window";
const pack={format:"karda.knowledge-package.v1",schema:{namespace:"local",schemaId:"objects",version:"1"},nodes:[],edges:[],assertions:[],evidence:[],statements:[],passages:[],gaps:[],sourceStatus:"complete",truncated:false};
const revision="a".repeat(64),observedAt="2026-11-25T00:00:00Z";
const response=(action="replace",knowledge:unknown=pack,extra={})=>Response.json({format:"karda.knowledge-sync.v1",revision,observedAt,reuse:"revalidate",action,knowledge,...extra});

test("knowledge windows revalidate same scope, reuse matching baselines and clear on failure or scope changes",async()=>{
  const urls:string[]=[];let answer=()=>response();
  const client=new KnowledgeWindowClient(async(url,options)=>{urls.push(String(url));assert.equal(options?.cache,"no-store");assert.equal(options?.credentials,"same-origin");return answer();});
  const query=new URLSearchParams({cursor:""}),first=await client.read("kb",query);assert.equal(first?.action,"replace");
  answer=()=>response("unchanged",null);const next=await client.read("kb",query);
  assert.equal(next?.knowledge,first?.knowledge);assert.ok(urls[1].includes(`known_revision=${revision}`));
  answer=()=>new Response("",{status:403});await assert.rejects(client.read("kb",query),(e:unknown)=>e instanceof KnowledgeWindowError&&e.status===403);
  answer=()=>response();await client.read("kb",query);assert.equal(urls[3].includes("known_revision"),false);
  await client.read("other",query);assert.equal(urls[4].includes("known_revision"),false);
  await client.read("other",new URLSearchParams({entity:"different"}));assert.equal(urls[5].includes("known_revision"),false);
  client.clear();await client.read("other",new URLSearchParams({entity:"different"}));assert.equal(urls[6].includes("known_revision"),false);
});

test("unknown or malformed sync responses fail closed and cannot reuse an old baseline",async()=>{
  for(const invalid of [()=>response("unchanged",null),()=>response("replace",null),()=>response("other"),()=>response("replace",pack,{revision:"bad"}),
    ()=>response("replace",pack,{observedAt:"bad"}),()=>response("replace",pack,{reuse:"offline"}),()=>response("replace",{...pack,nodes:Array(501).fill({})})]){
    const client=new KnowledgeWindowClient(async()=>invalid());await assert.rejects(client.read("kb",new URLSearchParams()),KnowledgeWindowError);
  }
  let calls=0;const client=new KnowledgeWindowClient(async()=>++calls===1?response():response("unchanged",null,{revision:"b".repeat(64)}));
  await client.read("kb",new URLSearchParams());await assert.rejects(client.read("kb",new URLSearchParams()),KnowledgeWindowError);
});

test("late responses and unmount cancellation cannot overwrite a newer window",async()=>{
  const pending:((value:Response)=>void)[]=[],signals:(AbortSignal|null|undefined)[]=[];
  const client=new KnowledgeWindowClient(async(_url,options)=>{signals.push(options?.signal);return new Promise(resolve=>pending.push(resolve));});
  const first=client.read("kb",new URLSearchParams({entity:"old"}));
  const second=client.read("kb",new URLSearchParams({entity:"new"}));assert.equal(signals[0]?.aborted,true);
  pending[1](response());assert.equal((await second)?.action,"replace");pending[0](response());assert.equal(await first,null);
  const third=client.read("kb",new URLSearchParams({entity:"new"}));client.clear();assert.equal(signals[2]?.aborted,true);pending[2](response());assert.equal(await third,null);
});

test("entity links accept one canonical UUID only",()=>{
  const id="11111111-1111-4111-8111-111111111111";assert.equal(initialKnowledgeEntity(id),id);
  for(const value of [undefined,[id,id],"bad","javascript:alert(1)","<script>","A".repeat(36)])assert.equal(initialKnowledgeEntity(value),"");
});
