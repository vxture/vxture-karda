import test from "node:test";
import assert from "node:assert/strict";
import {inspectSources,type SourceCandidate} from "./source-readiness";
const row=(patch:Partial<SourceCandidate>={}):SourceCandidate=>({id:"source",title:"<source>",mime:"text/plain",content_state:"indexed",active_chunk_version:1,content_hash:"a".repeat(64),storage_ref:"private/raw",size_bytes:"8",...patch});
const checked=async()=>"2026-11-26T00:00:00Z";
test("source inspection returns only diagnostic metadata and classifies each blocked input before reading",async()=>{
  const inputs=[row({id:"f",mime:"application/unknown"}),row({id:"b",content_state:"archived"}),row({id:"c",active_chunk_version:null}),row({id:"d",size_bytes:null}),row({id:"e",content_hash:"broken"}),row({id:"a"})];
  const called:string[]=[];
  const report=await inspectSources(inputs,async d=>{called.push(d.id);return {text:"Proof \u4e2d\ud83d\ude00",parserVersion:"native_text"};},checked);
  assert.equal(report.readable,1);assert.equal(report.blocked,5);assert.equal(report.total,6);assert.deepEqual(called,["a"]);
  assert.deepEqual(report.items.map(i=>i.id),["a","b","c","d","e","f"]);
  assert.equal(report.items[0].characters,9);assert.equal(report.items[0].parserVersion,"native_text");
  assert.deepEqual(report.items[1].issues,["not_indexed"]);assert.deepEqual(report.items[5].issues,["unsupported_format"]);
  const serialized=JSON.stringify(report);for(const secret of ["private/raw","Proof","a".repeat(64)])assert.equal(serialized.includes(secret),false);
  assert.equal(report.format,"karda.source-readiness.v1");assert.equal(report.checkedAt,await checked());
});
test("source inspection distinguishes missing originals, invalid binary snapshots and empty text without hiding read failures",async()=>{
  const native=await inspectSources([row()],async()=>({text:null,parserVersion:null}),checked);assert.deepEqual(native.items[0].issues,["original_unavailable"]);
  const binary=await inspectSources([row({mime:"application/pdf"})],async()=>({text:null,parserVersion:null}),checked);assert.deepEqual(binary.items[0].issues,["snapshot_unavailable"]);
  const empty=await inspectSources([row()],async()=>({text:" \n",parserVersion:"native_text"}),checked);assert.deepEqual(empty.items[0].issues,["text_empty"]);
  await assert.rejects(inspectSources([row()],async()=>{throw new Error("storage failure");},checked),/storage failure/);
  const report=await inspectSources([],async()=>{throw new Error("unexpected read");},checked);assert.equal(report.total,0);assert.equal(report.readable,0);
});
test("source inspection refuses incomplete/over-budget input rather than returning partial readiness",async()=>{
  const read=async()=>({text:"x",parserVersion:"native_text"});
  await assert.rejects(inspectSources(Array.from({length:101},()=>row()),read,checked),/semantic_source_budget/);
  let calls=0;await assert.rejects(inspectSources(Array.from({length:5},()=>row({size_bytes:String(8*1024*1024)})),async()=>{calls++;return read();},checked),/semantic_source_budget/);assert.equal(calls,4);
  await assert.rejects(inspectSources([row(),row(),row()],async()=>({text:"x".repeat(6*1024*1024),parserVersion:"native_text"}),checked),/semantic_source_budget/);
  await assert.rejects(inspectSources([row({title:"x".repeat(2*1024*1024)})],read,checked),/semantic_source_budget/);
});
