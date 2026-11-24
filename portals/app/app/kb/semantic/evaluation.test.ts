import {test} from "node:test";
import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {readFileSync} from "node:fs";
import {
  corpusFingerprint,evaluateDraftLexical,validateEvaluation,
  type EvaluationCorpus,type DraftDataset,
} from "./evaluation";

function fixture(): {corpus:EvaluationCorpus;dataset:DraftDataset} {
  const text="第一条 采购预算金额公开。\n第二条 供应商证明材料。\n";
  const second=text.indexOf("第二条");
  const corpus:EvaluationCorpus={
    formatVersion:1,dataClass:"test_fixture",sources:[{
      id:"source",title:"条例",url:"https://example.org/regulation",edition:"fixed",
      text,canonicalSha256:createHash("sha256").update(text).digest("hex"),
      sections:[
        {id:"s1",label:"第一条",start:0,end:second-1},
        {id:"s2",label:"第二条",start:second,end:text.length-1},
      ],
    }],
  };
  const dataset:DraftDataset={
    formatVersion:1,reviewStatus:"agent_draft",corpusSha256:corpusFingerprint(corpus),
    cases:[
      {id:"dev",split:"development",kind:"single",question:"采购预算金额",expectedAnswer:"公开",
        evidence:[{sourceId:"source",sectionId:"s1"}]},
      {id:"reserve",split:"reserved",kind:"single",question:"供应商证明材料",expectedAnswer:"证明材料",
        evidence:[{sourceId:"source",sectionId:"s2"}]},
    ],
  };
  return {corpus,dataset};
}

test("multi-source scoring uses source/section identity and never credits a namesake section", () => {
  const {corpus,dataset} = fixture();
  corpus.sources.push({ ...structuredClone(corpus.sources[0]), id: "other-source", title: "Other", url: "https://example.org/other" });
  dataset.corpusSha256 = corpusFingerprint(corpus);
  dataset.cases = [{ id: "cross-doc", split: "development", kind: "multi_article", question: "采购预算金额",
    expectedAnswer: "Both sources", evidence: [{sourceId:"source",sectionId:"s1"},{sourceId:"other-source",sectionId:"s1"}] }];
  const report = evaluateDraftLexical(corpus, dataset, 1);
  assert.equal(report.metrics.hitEvidence, 1);
  assert.equal(report.metrics.completeEvidenceCases, 0);
  assert.equal(report.cases[0].retrieved.length, 1);
  assert.equal(report.evidenceIdentity, "source_and_section");
});

test("draft scoring reports evidence recall, never declares gold or exposes reserved questions",()=>{
  const {corpus,dataset}=fixture();
  const report=evaluateDraftLexical(corpus,dataset);
  assert.equal(report.acceptedGold,false);
  assert.equal(report.metrics.completeEvidenceCases,1);
  assert.equal(report.reservedCasesNotScored,1);
  assert.deepEqual(report.cases.map(c=>c.id),["dev"]);
  assert.equal(JSON.stringify(report).includes("expectedAnswer"),false);
});

test("source tampering fails before a retrieval score is produced",()=>{
  const {corpus,dataset}=fixture();
  corpus.sources[0].text+="other";
  assert.throws(()=>evaluateDraftLexical(corpus,dataset),/source_hash_mismatch/);
});

test("metadata and anchor changes invalidate the dataset binding even if text stays identical",()=>{
  for(const mutate of [
    (c:EvaluationCorpus)=>{c.sources[0].edition="different";},
    (c:EvaluationCorpus)=>{c.sources[0].url="https://example.org/other";},
    (c:EvaluationCorpus)=>{c.sources[0].sections[0].end--;},
  ]){
    const {corpus,dataset}=fixture();
    mutate(corpus);
    assert.throws(()=>validateEvaluation(corpus,dataset),/dataset_corpus_mismatch/);
  }
});

test("overlapping or out-of-range anchors cannot silently relabel source passages",()=>{
  for(const patch of [{start:-1},{end:999},{start:0,end:0},{start:0.1}]){
    const {corpus,dataset}=fixture();
    Object.assign(corpus.sources[0].sections[0],patch);
    assert.throws(()=>validateEvaluation(corpus,dataset),/invalid_section_anchor/);
  }
  const {corpus,dataset}=fixture();
  corpus.sources[0].sections[1].start=1;
  assert.throws(()=>validateEvaluation(corpus,dataset),/invalid_section_anchor/);
});

test("evidence IDs must identify a real source section and cannot count twice",()=>{
  for(const patch of [
    [{sourceId:"wrong",sectionId:"s1"}],
    [{sourceId:"source",sectionId:"missing"}],
    [{sourceId:"source",sectionId:"s1"},{sourceId:"source",sectionId:"s1"}],
  ]){
    const {corpus,dataset}=fixture();
    dataset.cases[0].evidence=patch;
    assert.throws(()=>validateEvaluation(corpus,dataset),/invalid_case_evidence/);
  }
});

test("duplicate questions or case IDs cannot inflate case counts",()=>{
  for(const patch of [{id:"dev"},{question:"采购预算金额"}]){
    const {corpus,dataset}=fixture();
    Object.assign(dataset.cases[1],patch);
    assert.throws(()=>validateEvaluation(corpus,dataset),/invalid_evaluation_case/);
  }
});

test("development and reserved evidence must stay disjoint by source section",()=>{
  const {corpus,dataset}=fixture();
  dataset.cases[1].evidence=[{sourceId:"source",sectionId:"s1"}];
  assert.throws(()=>validateEvaluation(corpus,dataset),/cross_split_evidence_overlap/);
});

test("unanswerable cases may return retrieval candidates but this is not scored as a generated answer",()=>{
  const {corpus,dataset}=fixture();
  dataset.cases.push({
    id:"unknown",split:"development",kind:"unanswerable",
    question:"此项目采购预算具体是多少",expectedAnswer:null,evidence:[],
  });
  const report=evaluateDraftLexical(corpus,dataset);
  assert.equal(report.metrics.unanswerableCasesReturningCandidates,1);
  assert.equal(report.metrics.answerableCases,1);
  assert.equal(report.cases.find(c=>c.id==="unknown")!.allEvidenceRetrieved,null);
});

test("unanswerable labels cannot include answers or evidence; multi-article labels require two grounds",()=>{
  for(const patch of [
    {kind:"unanswerable" as const,expectedAnswer:"incorrect"},
    {kind:"unanswerable" as const,expectedAnswer:null},
    {kind:"multi_article" as const},
    {expectedAnswer:""},
  ]){
    const {corpus,dataset}=fixture();
    Object.assign(dataset.cases[0],patch);
    assert.throws(()=>validateEvaluation(corpus,dataset),/invalid_case_evidence/);
  }
});

test("the draft runner cannot self-upgrade to human-reviewed gold or request unlimited retrieval",()=>{
  const {corpus,dataset}=fixture();
  Object.assign(dataset,{reviewStatus:"human_reviewed"});
  assert.throws(()=>evaluateDraftLexical(corpus,dataset),/invalid_evaluation_format/);
  const valid=fixture();
  for(const k of [0,21,1.5,Infinity]){
    assert.throws(()=>evaluateDraftLexical(valid.corpus,valid.dataset,k),/invalid_top_k/);
  }
});

test("the checked-in real source has 79 verified anchors and 60 explicitly unreviewed candidates",()=>{
  const base=new URL("../../../../../scripts/knowledge/corpus/",import.meta.url);
  const corpus=JSON.parse(readFileSync(new URL("procurement-regulations-2015.json",base),"utf8")) as EvaluationCorpus;
  const dataset=JSON.parse(readFileSync(new URL("procurement-draft-cases.json",base),"utf8")) as DraftDataset;
  validateEvaluation(corpus,dataset);
  assert.equal(corpus.sources[0].sections.length,79);
  assert.equal(dataset.cases.length,60);
  assert.equal(dataset.cases.filter(c=>c.kind==="multi_article").length,20);
  assert.equal(dataset.reviewStatus,"agent_draft");
  assert.equal(dataset.cases.filter(c=>c.split==="reserved").length,15);
  const report=evaluateDraftLexical(corpus,dataset);
  assert.equal(report.cases.length,45);
  assert.equal(report.acceptedGold,false);
});
