import test from "node:test";
import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {parseWorkQuery,workHref} from "./work-center";
test("work query rejects caller identity, duplicate filters and malformed cursors; navigation pins exact jobs",()=>{
  const id=randomUUID(),kbId=randomUUID(),documentId=randomUUID();
  assert.deepEqual(parseWorkQuery(new URLSearchParams({kbId,kind:"compilation",state:"attention"})),{kbId,kind:"compilation",state:"attention"});
  for(const q of ["workspace=forged","state=all","kind=unknown","kind=ocr&kind=processing","before=",`kbId=${id}&sub=other`])
    assert.throws(()=>parseWorkQuery(new URLSearchParams(q)),/work_invalid/);
  assert.equal(workHref({id,kbId,documentId,kind:"compilation"}),`/assets/${kbId}/semantic?taskId=${id}`);
  assert.equal(workHref({id,kbId,documentId,kind:"ocr"}),`/assets/${kbId}/ocr?documentId=${documentId}&draftId=${id}`);
  assert.equal(workHref({id,kbId,documentId,kind:"maintenance"}),`/pipeline/operations?taskId=${id}`);
  assert.throws(()=>workHref({id,kbId,documentId:null,kind:"ocr"}),/work_invalid/);
});
