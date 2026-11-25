import test from "node:test";
import assert from "node:assert/strict";
import {exportCurrentTopic,topicExportMarkdown,type TopicExportInput} from "./topic-export";
import {composeTopicDossier} from "./topic-dossier";
import {topicPackage} from "./topic-dossier.test";

function row():TopicExportInput{
  const payload=composeTopicDossier(topicPackage(),"requires");
  return {id:"topic",relationType:"requires",inputHash:payload.inputHash,createdAt:"2026-11-26T00:00:00Z",createdBy:"author",state:"current_draft",payload,
    summaries:[{id:"summary",state:"accept",revision:2,reviewedBy:"reviewer",note:"Checked",selection:{endpointCode:"chat/extract"},
      payload:{format:"karda.topic-summary.v1",inputHash:payload.inputHash,paragraphs:[{text:"A requires B",citations:["e"]}]}}]};
}
test("topic export keeps current extractive facts distinct from independently accepted summary and review",()=>{
  const value=row(),first=exportCurrentTopic("kb","2026-11-26T01:00:00Z",value);
  assert.equal(first.summary,null);assert.equal(first.dossier.state,"extractive_compilation");
  const full=exportCurrentTopic("kb","2026-11-26T01:00:00Z",value,"summary");
  assert.equal(full.summary?.state,"human_accepted");assert.equal(full.summary?.revision,2);assert.equal(full.summary?.reviewedBy,"reviewer");
  assert.equal(full.dossier.payload.sections[0].statements[0].evidence[0].excerpt,"proof");
  assert.deepEqual(full.summary?.payload?.paragraphs[0].citations,["e"]);
  assert.equal(value.summaries.length,1);assert.equal(first.format,"karda.topic-export.v1");
});
test("stale, rejected, pending, revised or unbound summaries and sources cannot export",()=>{
  for(const state of ["stale","reject","pending","revise"]){const value=row();value.summaries[0].state=state;assert.throws(()=>exportCurrentTopic("kb","now",value,"summary"),/semantic_topic_conflict/);}
  for(const patch of [{state:"stale_draft"},{payload:null},{inputHash:"different"}])assert.throws(()=>exportCurrentTopic("kb","now",{...row(),...patch}),/semantic_topic_conflict/);
  const value=row();assert.throws(()=>exportCurrentTopic("kb","now",value,"unknown"),/semantic_topic_conflict/);
  value.summaries[0].payload!.inputHash="different";assert.throws(()=>exportCurrentTopic("kb","now",value,"summary"),/semantic_topic_conflict/);
  const missing=row();missing.summaries[0].payload!.paragraphs[0].citations=["hidden"];assert.throws(()=>exportCurrentTopic("kb","now",missing,"summary"),/semantic_summary_invalid_output/);
});
test("topic Markdown escapes model/source content and preserves exact versioned support labels",()=>{
  const value=row();value.payload!.sections[0].source.label="<script>bad</script> [run](javascript:bad)";
  value.summaries[0].payload!.paragraphs[0].text="<img src=x>";
  const md=topicExportMarkdown(exportCurrentTopic("kb","now",value,"summary"));
  assert.equal(md.includes("<script>"),false);assert.equal(md.includes("<img"),false);assert.equal(md.includes("[run](javascript:"),false);
  assert.match(md,/UTF-16 0:5/);assert.match(md,/PDF pages 1, 3/);assert.match(md,/not a new publication/);assert.match(md,/review revision 2/);
});
