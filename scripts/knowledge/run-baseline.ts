// Local K0 smoke baseline for the EXISTING lexical ranker. No network/model/DB.
// Synthetic cases test repeatability and report plumbing, not business accuracy.
import { bm25Rank } from "../../portals/app/app/kb/retrieval/bm25";

const documents = [
  {id:"tender-current", text:"河湾信息化项目 第3.2条 投标人应提供有效的质量管理体系认证证书。投标截止日期为2026年12月1日。"},
  {id:"supplement", text:"河湾信息化项目补遗：允许联合体投标。联合体每个成员须提供营业执照；牵头方负责提交联合体协议。"},
  {id:"certificate", text:"质量管理体系认证证书审核：证书名称、持有人名称应与投标主体一致，证书在投标截止日期仍须有效。"},
  {id:"authorization", text:"河湾信息化项目：法定代表人授权书须由法定代表人签字并加盖公章；授权代表提供身份证明。"},
  {id:"financial", text:"河湾信息化项目 第4.1条：提交2025年度审计报告，成立不足一年的企业可提供成立以来财务报表。"},
  {id:"delivery", text:"河湾信息化项目交付：中标后90天内完成部署和验收；质量管理体系认证证书不代替交付验收证明。"},
  {id:"sop-current", text:"当前退款SOP：金额超过5000元须经理审核，退款办理期限为7个工作日，适用于2026年11月起的新申请。"},
  {id:"product", text:"产品数据接口手册：批量导出采用JSON格式，单次最多返回200条记录。"},
];
const cases = [
  {id:"q01",kind:"single",query:"河湾信息化项目质量管理体系认证要求",expected:["tender-current"]},
  {id:"q02",kind:"single",query:"联合体每个成员营业执照",expected:["supplement"]},
  {id:"q03",kind:"single",query:"法定代表人授权书签字公章",expected:["authorization"]},
  {id:"q04",kind:"single",query:"2025年度审计报告不足一年",expected:["financial"]},
  {id:"q05",kind:"single",query:"部署验收交付期限",expected:["delivery"]},
  {id:"q06",kind:"single",query:"退款SOP金额经理审核",expected:["sop-current"]},
  {id:"q07",kind:"multi_document",query:"河湾信息化项目认证证书有哪些要求及审核有效条件",expected:["tender-current","certificate"]},
  {id:"q08",kind:"multi_document",query:"联合体投标的营业执照和授权代表身份证明要准备什么",expected:["supplement","authorization"]},
  {id:"q09",kind:"multi_document",query:"河湾信息化项目投标截止日期与证书有效期限",expected:["tender-current","certificate"]},
  {id:"q10",kind:"multi_document",query:"河湾信息化项目财务审计材料与法定代表人授权签字材料",expected:["financial","authorization"]},
  {id:"q11",kind:"single",query:"JSON批量导出单次最多记录",expected:["product"]},
  {id:"q12",kind:"unknown",query:"木星卫星遥测协议",expected:[]},
];
const topK = 5;
const results = cases.map(c => {
  const retrieved = bm25Rank(documents, c.query).slice(0,topK).map(r => r.id);
  const found = c.expected.filter(id => retrieved.includes(id));
  return {
    ...c, retrieved, found:found.length,
    complete: c.expected.length === 0 ? retrieved.length === 0 : found.length === c.expected.length,
  };
});
const expectedEvidence = cases.reduce((sum,c) => sum + c.expected.length,0);
const retrievedExpected = results.reduce((sum,r) => sum + r.found,0);
console.log(JSON.stringify({
  reportVersion:1,
  dataClass:"synthetic",
  component:"existing bm25Rank only; no hybrid, reranker, answer generation or production authorization",
  corpus: {documents:documents.length, cases:cases.length, multiDocument:cases.filter(c=>c.kind==="multi_document").length},
  topK,
  metrics: {
    expectedEvidence, retrievedExpected,
    evidenceRecall: retrievedExpected / expectedEvidence,
    completeCases: results.filter(r=>r.complete).length,
    totalCases: results.length,
  },
  limits: [
    "Synthetic retrieval smoke report; not a business gold set or answer accuracy measure.",
    "No claim that graph retrieval improves answers; run an independent real-source holdout after K0b.",
    "No latency claim; server scope and source lifecycle integration are tested separately.",
  ],
  cases:results,
}, null, 2));
