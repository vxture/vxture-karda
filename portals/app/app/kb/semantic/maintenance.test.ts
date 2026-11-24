import {test} from "node:test";
import assert from "node:assert/strict";
import {maintenanceReport, type MaintenanceAssertion} from "./maintenance";
import type {PublishedRelationInput} from "./read-postgres";

test("maintenance traces changed sources to relations without upgrading diagnostics into publication",()=>{
  const schema={namespace:"test",schemaId:"test",version:"1",entityTypes:["entity"],relationTypes:[{id:"requires",sourceTypes:["entity"],targetTypes:["entity"]}]};
  const input:PublishedRelationInput={schema,entityTypes:new Map([["entity","entity"]]),
    sources:[{kbId:"kb",documentId:"doc",version:2,contentHash:"hash"}],
    relations:[{id:"r",kbId:"kb",sourceId:"left",targetId:"right",type:"requires",origin:"asserted",schema,assertionIds:["a"]}]};
  const assertion:MaintenanceAssertion={id:"a",content_state:"indexed",verification_state:"verified",expires_at:null,valid_until:null,superseded_by:null};
  const current={generation:1,releaseId:"release",now:new Date("2026-11-25T00:00:00Z"),
    documents:[{id:"doc",title:"Synthetic",content_state:"indexed",content_hash:"hash",active_chunk_version:2}],
    texts:new Map([["doc","A\ud83d\ude00B"]]),assertions:[assertion],grounds:[{assertion_id:"a",document_id:"doc",document_version:2,start_offset:1,end_offset:3,excerpt:"\ud83d\ude00"}],
    entityTypes:new Map([["left","entity"],["right","entity"]]),reviewedIds:new Set(["r"])};
  const original=structuredClone(input);
  const healthy=maintenanceReport(input,current);
  assert.deepEqual(healthy.relations[0].issues,[]);
  assert.deepEqual(healthy.sources[0].relationIds,["r"]);
  assert.equal(healthy.checkedAt,current.now.toISOString());
  const changed=maintenanceReport(input,{...current,documents:[{...current.documents[0],content_hash:"new",active_chunk_version:3}]});
  assert.deepEqual(changed.relations[0].issues,["evidence_missing","source_changed"]);
  const removed=maintenanceReport(input,{...current,documents:[]});
  assert.deepEqual(removed.sources[0].issues,["source_missing"]);
  assert.deepEqual(removed.relations[0].issues,["evidence_missing","source_missing"]);
  const withdrawn=maintenanceReport(input,{...current,documents:[{...current.documents[0],content_state:"archived"}]});
  assert.deepEqual(withdrawn.relations[0].issues,["evidence_missing","source_inactive"]);
  const invalid=maintenanceReport(input,{...current,assertions:[{...assertion,expires_at:current.now}],reviewedIds:new Set(),entityTypes:new Map()});
  assert.deepEqual(invalid.relations[0].issues,["assertion_inactive","entity_missing","review_changed"]);
  assert.deepEqual(maintenanceReport(input,{...current,texts:new Map()}).relations[0].issues,["evidence_missing","source_unavailable"]);
  assert.deepEqual(maintenanceReport(input,{...current,grounds:[{...current.grounds[0],excerpt:"wrong"}]}).relations[0].issues,["evidence_missing"]);
  assert.deepEqual(input,original,"diagnostics never modify the release");
});
