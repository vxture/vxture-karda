import test from "node:test";
import assert from "node:assert/strict";
import { SemanticReviewApi, type ReleasePreview } from "./semantic-api";
import { ApiError } from "./api";

test("semantic browser client submits only the preview binding and reuses its event on retry",async()=>{
  const original=globalThis.fetch, requests:{url:string;body:Record<string,unknown>;cache:unknown}[]=[];
  globalThis.fetch=async(url,init)=>{
    requests.push({url:String(url),body:JSON.parse(String(init?.body)),cache:init?.cache});
    return Response.json({releaseId:"release",generation:2,duplicate:requests.length>1});
  };
  try{
    const api=new SemanticReviewApi("library/id");
    const preview={runId:"run",eventId:"event",expectedGeneration:1,fingerprint:"fingerprint",relationCount:2,
      impact:{scope:"proposed_replacement_structure",relations:[],sources:[]},changes:{added:[],removed:[],changed:[]},payload:{unsafe:true}} as ReleasePreview;
    await api.publish(preview);await api.publish(preview);
    assert.deepEqual(requests[0].body,{action:"publish",runId:"run",eventId:"event",expectedGeneration:1,fingerprint:"fingerprint"});
    assert.deepEqual(requests[1].body,requests[0].body);
    assert.equal(requests[0].url,"/api/kb/library%2Fid/semantic");assert.equal(requests[0].cache,"no-store");
  }finally{globalThis.fetch=original;}
});

test("semantic client preserves stale and authorization responses instead of empty success",async()=>{
  const original=globalThis.fetch;
  try{
    for(const status of [401,403,409,503]){
      globalThis.fetch=async()=>Response.json({error:"semantic_test"},{status});
      await assert.rejects(new SemanticReviewApi("library").detail("run"),e=>e instanceof ApiError&&e.status===status);
    }
    globalThis.fetch=async()=>new Response("invalid");
    await assert.rejects(new SemanticReviewApi("library").list(),/semantic_invalid_response/);
  }finally{globalThis.fetch=original;}
});
