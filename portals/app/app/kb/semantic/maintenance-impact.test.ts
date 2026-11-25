import test from "node:test";
import assert from "node:assert/strict";
import {maintenanceImpact,maintenanceActions} from "./maintenance-impact";
import type {MaintenanceReport} from "./maintenance";
const r=(id:string,a:string,b:string,changed=false):MaintenanceReport["relations"][number]=>({id,sourceId:a,targetId:b,type:"requires",issues:changed?["source_changed"]:[],documentIds:[changed?"changed":"other"]});
const report:MaintenanceReport={generation:1,releaseId:"release",checkedAt:"2026-11-25T00:00:00Z",sources:[],relations:[r("a","1","2",true),r("b","2","3"),r("c","3","4"),r("d","private","island")]};
test("impact connectivity is bounded, deterministic and diagnostic only, with original directions intact",()=>{
  const original=structuredClone(report),scope=maintenanceImpact(report,"changed",1);
  assert.deepEqual(scope.rows.map(r=>[r.id,r.depth]),[["a",0],["b",1]]);assert.equal(scope.directCount,1);
  assert.deepEqual(scope.entityIds,["1","2","3"]);assert.equal(scope.rows[1].sourceId,"2");
  assert.deepEqual(maintenanceImpact({...report,relations:[...report.relations].reverse()},"changed",1),scope);
  assert.equal(maintenanceImpact(report,"unknown",3).rows.length,0);
  assert.equal(maintenanceImpact(report,"",3).rows.length,3);assert.equal(maintenanceImpact(report,"",0,true).rows.length,4);
  assert.deepEqual(report,original);assert.deepEqual(maintenanceActions(["review_changed","source_changed","evidence_missing"]),["rebuild_candidates","review_relations"]);
  assert.throws(()=>maintenanceImpact(report,"",4),/semantic_invalid_impact/);
});
test("impact fan-out respects500 entities/1000 relations and reports truncation",()=>{
  const big={...report,relations:[r("000","seed","root",true),...Array.from({length:1500},(_,i)=>r(`r${i}`,"root",`node${i}`))]};
  const result=maintenanceImpact(big,"changed",3);assert.ok(result.truncated);assert.ok(result.entityIds.length<=500);assert.ok(result.rows.length<=1000);
  assert.equal(result.rows[0].id,"000");
});
