import type {TopicDossier} from "./topic-dossier";
import {validateTopicSummary,type TopicSummary} from "./topic-summary";
import type {ModelSelection} from "../atlas/selection";

export interface TopicExportInput {
  id:string;relationType:string;inputHash:string;createdAt:string;createdBy:string;state:string;payload:TopicDossier|null;
  summaries:{id:string;state:string;revision:number;note:string|null;reviewedBy:string|null;payload:TopicSummary|null;selection:ModelSelection}[];
}
export function exportCurrentTopic(kbId:string,checkedAt:string,row:TopicExportInput,summaryId?:string){
  if(row.state!=="current_draft"||!row.payload||row.payload.inputHash!==row.inputHash||row.payload.relationType!==row.relationType)throw new Error("semantic_topic_conflict");
  const selected=summaryId?row.summaries.find(s=>s.id===summaryId):undefined;
  if(summaryId&&(!selected||selected.state!=="accept"||!selected.payload||selected.revision<1||!selected.reviewedBy))throw new Error("semantic_topic_conflict");
  if(selected&&selected.payload){
    if(selected.payload.inputHash!==row.inputHash)throw new Error("semantic_topic_conflict");
    validateTopicSummary({paragraphs:selected.payload.paragraphs},row.payload);
  }
  const result={format:"karda.topic-export.v1" as const,scope:"current_authorized_topic" as const,kbId,checkedAt,
    dossier:{id:row.id,relationType:row.relationType,inputHash:row.inputHash,createdAt:row.createdAt,createdBy:row.createdBy,
      state:"extractive_compilation" as const,payload:row.payload},
    summary:selected?{id:selected.id,state:"human_accepted" as const,revision:selected.revision,reviewedBy:selected.reviewedBy,note:selected.note,selection:selected.selection,payload:selected.payload}:null};
  if(Buffer.byteLength(JSON.stringify(result))>2*1024*1024)throw new Error("semantic_topic_budget");
  return result;
}
const safe=(s:string)=>s.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/[\\`*_[\]{}|#!]/g,"\\$&").replace(/[\r\n]/g," ");
export function topicExportMarkdown(value:ReturnType<typeof exportCurrentTopic>):string{
  const {dossier,summary}=value,lines=["# Current topic evidence compilation","",`Library: ${safe(value.kbId)}`,`Dossier: ${safe(dossier.id)}`,
    `Input fingerprint: ${safe(dossier.inputHash)}`,`Checked at: ${safe(value.checkedAt)}`,`Relation type: ${safe(dossier.relationType)}`,"",
    "Compiled from currently authorized published facts. This export is not a new publication or an ongoing access grant.",
    "The extractive compilation and any human-accepted model summary are separate artifacts.",""];
  if(summary){lines.push("## Human-accepted model summary","",`ID: ${safe(summary.id)} / review revision ${summary.revision}`,
    `Reviewer: ${safe(summary.reviewedBy!)}`,`Review note: ${safe(summary.note??"")}`,"");
    for(const p of summary.payload!.paragraphs)lines.push(safe(p.text),`Citations: ${p.citations.map(safe).join(", ")}`,"");}
  lines.push("## Published facts and exact support","");
  for(const section of dossier.payload.sections){lines.push(`### ${safe(section.source.label)} -> ${safe(dossier.relationType)} -> ${safe(section.target.label)}`,"",
    `Relation: ${safe(section.relationId)}`,`Entity IDs: ${safe(section.source.id)} / ${safe(section.target.id)}`,"");
    for(const s of section.statements){lines.push(safe(s.text),`Assertion: ${safe(s.id)}`,"");
      for(const e of s.evidence)lines.push(`> ${safe(e.excerpt)}`,`Evidence: ${safe(e.id)} / source ${safe(e.documentId)} / v${e.version} / UTF-16 ${e.start}:${e.end}${e.pages.length?` / PDF pages ${e.pages.join(", ")}`:""}`,"");}}
  return lines.join("\n");
}
