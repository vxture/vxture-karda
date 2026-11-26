import test from "node:test";
import assert from "node:assert/strict";
import {parseSourceInspectionQuery} from "./source-query";
const id="11111111-1111-4111-8111-111111111111";
test("source window query keeps directory batches and one-source lookup mutually exclusive",()=>{
  assert.deepEqual(parseSourceInspectionQuery(new URLSearchParams("view=sources")),{});
  assert.deepEqual(parseSourceInspectionQuery(new URLSearchParams({view:"sources",before:id})),{before:id});
  assert.deepEqual(parseSourceInspectionQuery(new URLSearchParams({view:"sources",documentId:id})),{documentId:id});
  for(const query of ["","view=other","view=sources&view=sources","view=sources&before=","view=sources&documentId=bad",`view=sources&before=${id}&documentId=${id}`,`view=sources&documentId=${id}&documentId=${id}`,"view=sources&limit=100","view=sources&runId=anything"])
    assert.throws(()=>parseSourceInspectionQuery(new URLSearchParams(query)),/semantic_invalid_source_query/);
});
