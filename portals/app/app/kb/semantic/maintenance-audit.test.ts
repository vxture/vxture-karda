import test from "node:test";
import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {maintenanceAudit,maintenanceAuditMarkdown} from "./maintenance-audit";
import type {MaintenanceReport} from "./maintenance";
import {verifyMaintenanceAudit,compareMaintenanceAudits} from "../../../../../scripts/knowledge/verify-maintenance-audit.mjs";
const report:MaintenanceReport={generation:2,releaseId:"release",checkedAt:"2026-11-25T00:00:00Z",sources:[{id:"doc",title:"Doc",publishedVersion:1,currentVersion:2,issues:["source_changed"],relationIds:["r"]}],relations:[{id:"r",type:"requires",sourceId:"a",targetId:"b",issues:["source_changed","review_changed"],documentIds:["doc"]}]};

test("audit JSON records deterministic full diagnostic scope and verifiable exact body digest",()=>{
  const before=JSON.stringify(report),first=maintenanceAudit(report,"kb"),{digest,digestAlgorithm,...body}=first;
  assert.equal(digestAlgorithm,"sha256-json-body-v1");assert.equal(digest,createHash("sha256").update(JSON.stringify(body)).digest("hex"));
  assert.equal(first.summary.affectedRelations,1);assert.equal(first.summary.affectedSources,1);
  assert.equal(first.summary.issueCounts.find(c=>c.issue==="review_changed")?.count,1);
  assert.deepEqual(first.relations[0].actions,["rebuild_candidates","review_relations"]);
  assert.equal(maintenanceAudit({...report,relations:[{...report.relations[0],issues:["review_changed","source_changed"]}]},"kb").digest,digest);
  assert.notEqual(maintenanceAudit(report,"other").digest,digest);
  assert.notEqual(maintenanceAudit({...report,checkedAt:"2026-11-25T00:00:01Z"},"kb").digest,digest);
  const extended={...report,relations:report.relations.map(r=>({...r,secret:"private"}))};
  assert.equal(JSON.stringify(maintenanceAudit(extended,"kb")).includes("private"),false);
  assert.equal(JSON.stringify(report),before);
});

test("offline audit verification detects edits and comparison distinguishes findings from current truth",()=>{
  const first=maintenanceAudit(report,"kb"),second=maintenanceAudit({...report,checkedAt:"2026-11-25T00:00:01Z",relations:[{...report.relations[0],issues:["entity_missing"]}]},"kb");
  assert.equal(verifyMaintenanceAudit(first),first);
  assert.throws(()=>verifyMaintenanceAudit({...first,generation:3}),/audit_digest_mismatch/);
  const diff=compareMaintenanceAudits(first,second);
  assert.equal(diff.scope,"historical_diagnostics_only");
  assert.deepEqual(diff.relations.findings,[{id:"r",appeared:["entity_missing"],cleared:["review_changed","source_changed"]}]);
  assert.throws(()=>compareMaintenanceAudits(first,first),/audit_incompatible_comparison/);
  assert.throws(()=>compareMaintenanceAudits(first,maintenanceAudit({...report,checkedAt:second.checkedAt},"other")),/audit_incompatible_comparison/);
});

test("audit Markdown escapes untrusted titles/identities and clearly limits the diagnostic",()=>{
  const audit=maintenanceAudit({...report,sources:[{...report.sources[0],title:'<script>alert(1)</script> [run](javascript:bad)\n# heading'}]},"kb");
  const text=maintenanceAuditMarkdown(audit);
  assert.equal(text.includes("<script>"),false);assert.equal(text.includes("[run](javascript:"),false);
  assert.match(text,/not approvals or commands/);assert.match(text,/full current report/);assert.ok(text.includes(audit.digest));
  assert.match(text,/rebuild_candidates/);assert.match(text,/review_relations/);
  const empty=maintenanceAudit({generation:0,releaseId:null,checkedAt:report.checkedAt,sources:[],relations:[]},"kb");
  assert.equal(empty.summary.relationCount,0);assert.match(maintenanceAuditMarkdown(empty),/Release: none/);
  assert.throws(()=>maintenanceAudit({...report,generation:-1},"kb"),/semantic_invalid_audit/);
  assert.throws(()=>maintenanceAudit({...report,checkedAt:"bad"},"kb"),/semantic_invalid_audit/);
  assert.throws(()=>maintenanceAudit({...report,sources:[{...report.sources[0],title:"x".repeat(2*1024*1024)}]},"kb"),/semantic_audit_budget/);
});
