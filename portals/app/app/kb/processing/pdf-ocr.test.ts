import test from "node:test";
import assert from "node:assert/strict";
import {ocrPayload,recognizePdf,renderOcrPages} from "./pdf-ocr";
import {syntheticPdf} from "./source-fixtures";
import {sourceHash,snapshotIR} from "./source-snapshot";
import {verifiedSourceText} from "../semantic/source-text";
import {parseOcrCommand} from "./ocr-store";
import {randomUUID} from "node:crypto";
import {AtlasApiError} from "../atlas/client";

export const ocrResponse=()=>({task:"ocr",modelCode:"synthetic-vision",pages:[
  {pageIndex:0,spans:[{bbox:[0.1,0.1,0.9,0.2],text:"Proof \u4e2d\ud83d\ude00"},{bbox:[0.1,0.3,0.9,0.4],text:"Must be retained."}]},
  {pageIndex:1,spans:[]}]});
test("OCR retains exact Unicode, reading order and original pages through source evidence",()=>{
  const bytes=Buffer.from("%PDF-synthetic"),payload=ocrPayload(ocrResponse(),bytes,2,"synthetic-vision"),snap=payload.snapshot;
  assert.equal(snap.text,"Proof \u4e2d\ud83d\ude00\n\nMust be retained.");
  assert.equal(snap.locators[1].start,11);assert.equal(snap.locators[1].page,1);
  const text=verifiedSourceText({contentState:"indexed",activeVersion:1,contentHash:sourceHash(bytes),mime:"application/pdf",normalized:snap},bytes);
  assert.equal(text,snap.text);assert.equal(snapshotIR(snap).elements[0].locator.page,1);
  assert.equal(payload.pages[1].spans.length,0);
});
test("OCR refuses missing/repeated pages, broken regions, wrong model and empty output",()=>{
  const bytes=Buffer.from("%PDF-synthetic");
  for(const change of [(r:any)=>r.pages.pop(),(r:any)=>r.pages[1].pageIndex=0,(r:any)=>r.modelCode="other",
    (r:any)=>r.pages[0].spans[0].bbox=[0.5,0,0.1,1],(r:any)=>r.pages[0].spans[0].text="\0",(r:any)=>r.pages[0].spans=[]]){
    const raw=ocrResponse();change(raw);assert.throws(()=>ocrPayload(raw,bytes,2,"synthetic-vision"),/ocr_/);
  }
});
test("OCR uses Atlas parse with explicit model, tenant, workspace, stable task and full page batch",async()=>{
  const context={ws:randomUUID(),org:randomUUID()},bytes=Buffer.from("%PDF-synthetic");let calls=0;
  const core={baseUrl:"http://127.0.0.1:9999",tokenSource:{tokenFor:async()=>"synthetic-token"},fetchImpl:async(url:unknown,init:any)=>{
    calls++;assert.equal(String(url),"http://127.0.0.1:9999/v1/parse");
    const b=JSON.parse(init.body);assert.equal(b.taskId,"karda:ocr:synthetic");assert.equal(b.tenantId,context.org);
    assert.equal(b.workspaceId,context.ws);assert.equal(b.modelCode,"synthetic-vision");assert.equal(b.pages.length,2);assert.equal(b.endpointCode,undefined);
    return new Response(JSON.stringify(ocrResponse()),{status:200});
  }};
  const payload=await recognizePdf(core,context,"karda:ocr:synthetic","synthetic-vision",bytes,async()=>["a","b"]);
  assert.equal(payload.snapshot.contentHash,sourceHash(bytes));assert.equal(calls,1);
  await assert.rejects(recognizePdf({...core,fetchImpl:async()=>new Response(JSON.stringify({code:"PROVIDER_UNAVAILABLE",message:"private",retryable:true}),{status:503})},
    context,"task","synthetic-vision",bytes,async()=>["a"]),AtlasApiError);
});
test("bounded raster creates PNGs without invoking recognition; malformed PDF refused",{timeout:30000},async()=>{
  const pages=await renderOcrPages(syntheticPdf(["Synthetic raster proof"]));assert.equal(pages.length,1);
  assert.equal(Buffer.from(pages[0],"base64").subarray(0,8).toString("hex"),"89504e470d0a1a0a");
  await assert.rejects(renderOcrPages(Buffer.from("invalid")),/ocr_invalid_pdf/);
});
test("OCR commands cannot submit a client transcript or change scope fields",()=>{
  const command={action:"create",id:randomUUID(),documentId:randomUUID(),modelCode:"vision/model"};
  assert.deepEqual(parseOcrCommand(JSON.stringify(command)),command);
  assert.throws(()=>parseOcrCommand(JSON.stringify({...command,payload:{text:"fabricated"}})),/ocr_invalid/);
  assert.throws(()=>parseOcrCommand(JSON.stringify({...command,modelCode:""})),/ocr_invalid/);
});
