import {createHash} from "node:crypto";
import type {MaintenanceReport,MaintenanceIssue} from "./maintenance";
import {maintenanceActions,MAINTENANCE_ISSUES} from "./maintenance-impact";

export function maintenanceAudit(report:MaintenanceReport,kbId:string){
  if(!Number.isSafeInteger(report.generation)||report.generation<0||!Number.isFinite(Date.parse(report.checkedAt))||
    report.sources.length>100||report.relations.length>5000)throw new Error("semantic_invalid_audit");
  // Explicit fields prevent future internal report extensions leaking into exports.
  const sources=report.sources.map(r=>({id:r.id,title:r.title,publishedVersion:r.publishedVersion,currentVersion:r.currentVersion,
    issues:[...r.issues].sort(),relationIds:[...r.relationIds].sort()})).sort((a,b)=>a.id.localeCompare(b.id));
  const relations=report.relations.map(r=>({id:r.id,type:r.type,sourceId:r.sourceId,targetId:r.targetId,
    issues:[...r.issues].sort(),documentIds:[...r.documentIds].sort(),actions:maintenanceActions(r.issues)})).sort((a,b)=>a.id.localeCompare(b.id));
  const summary={sourceCount:sources.length,relationCount:relations.length,affectedSources:sources.filter(r=>r.issues.length).length,
    affectedRelations:relations.filter(r=>r.issues.length).length,
    issueCounts:MAINTENANCE_ISSUES.map(issue=>({issue,count:relations.filter(r=>r.issues.includes(issue)).length}))};
  const body={format:"karda.maintenance-audit.v1" as const,scope:"current_authorized_diagnostic" as const,kbId,
    generation:report.generation,releaseId:report.releaseId,checkedAt:report.checkedAt,summary,sources,relations};
  const serialized=JSON.stringify(body);
  if(Buffer.byteLength(serialized)>2*1024*1024)throw new Error("semantic_audit_budget");
  return {...body,digestAlgorithm:"sha256-json-body-v1" as const,digest:createHash("sha256").update(serialized).digest("hex")};
}
export type MaintenanceAudit=ReturnType<typeof maintenanceAudit>;

const safe=(value:string)=>value.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/[\\`*_[\]{}|#!]/g,"\\$&").replace(/[\r\n]/g," ");
/** Human-readable companion. JSON is the digest-bearing canonical artifact. */
export function maintenanceAuditMarkdown(audit:MaintenanceAudit):string{
  const lines=["# Knowledge maintenance audit","",`Library: ${safe(audit.kbId)}`,`Generation: ${audit.generation}`,
    `Release: ${safe(audit.releaseId??"none")}`,`Checked at: ${safe(audit.checkedAt)}`,`JSON body SHA-256: ${audit.digest}`,"",
    "Diagnostic snapshot only. Actions are suggestions for human review, not approvals or commands.",
    "This file describes the full current report, not the browser's filters. It grants no current source access.","",
    "## Summary","",`Sources with findings: ${audit.summary.affectedSources}/${audit.summary.sourceCount}`,
    `Relations with findings: ${audit.summary.affectedRelations}/${audit.summary.relationCount}`,"",
    ...audit.summary.issueCounts.map(c=>`- ${c.issue}: ${c.count}`),"","## Sources",""];
  for(const row of audit.sources)lines.push(`### ${safe(row.title)}`,"",`ID: ${safe(row.id)}`,
    `Version: ${row.publishedVersion} -> ${row.currentVersion??"unavailable"}`,`Issues: ${row.issues.join(", ")||"none"}`,
    `Relations: ${row.relationIds.map(safe).join(", ")||"none"}`,"");
  lines.push("## Relations","");
  for(const row of audit.relations)lines.push(`### ${safe(row.id)}`,"",`${safe(row.sourceId)} -> ${safe(row.type)} -> ${safe(row.targetId)}`,
    `Issues: ${row.issues.join(", ")||"none"}`,`Suggested human actions: ${row.actions.join(", ")||"none"}`,
    `Source IDs: ${row.documentIds.map(safe).join(", ")||"none"}`,"");
  return lines.join("\n");
}
