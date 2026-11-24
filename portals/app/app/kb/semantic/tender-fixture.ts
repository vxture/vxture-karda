// Synthetic tender example authored for Karda. Not customer documents or gold evaluation data.
import type { KnowledgeSnapshot, OntologySchema } from "./contracts";

export const tenderSchema: OntologySchema = {
  namespace: "karda.synthetic.tender", schemaId: "qualification", version: "1",
  entityTypes: ["project", "clause", "qualification", "document"],
  relationTypes: [
    { id: "has_clause", sourceTypes: ["project"], targetTypes: ["clause"] },
    { id: "requires", sourceTypes: ["clause"], targetTypes: ["qualification"] },
    { id: "proven_by", sourceTypes: ["qualification"], targetTypes: ["document"] },
  ],
};
export const CLOCK = "2026-11-24T00:00:00.000Z";
export const KB = "synthetic-public";
export const PRIVATE_KB = "synthetic-private";
export function tenderSnapshot(): KnowledgeSnapshot {
  return {
    entities: [
      { id: "project", kbId: KB, type: "project", label: "河湾信息化项目" },
      { id: "clause", kbId: KB, type: "clause", label: "第 3.2 条" },
      { id: "qualification", kbId: KB, type: "qualification", label: "质量管理体系认证" },
      { id: "certificate", kbId: KB, type: "document", label: "有效认证证书" },
    ],
    sources: [
      { kbId: KB, documentId: "tender", version: 1, current: false, withdrawn: false, textLength: 1000 },
      { kbId: KB, documentId: "tender", version: 2, current: true, withdrawn: false, textLength: 1000 },
      { kbId: KB, documentId: "supplement", version: 1, current: true, withdrawn: false, textLength: 500 },
    ],
    evidence: [
      { id: "e1", kbId: KB, documentId: "tender", documentVersion: 2, stance: "supports", start: 0, end: 30 },
      { id: "e2", kbId: KB, documentId: "tender", documentVersion: 2, stance: "supports", start: 30, end: 90 },
      { id: "e3", kbId: KB, documentId: "supplement", documentVersion: 1, stance: "supports", start: 0, end: 40 },
    ],
    assertions: [
      { id: "a1", kbId: KB, contentState: "indexed", verificationState: "verified", supersededById: null,
        validFrom: null, validUntil: null, verificationExpiresAt: null, evidenceIds: ["e1"] },
      { id: "a2", kbId: KB, contentState: "indexed", verificationState: "verified", supersededById: null,
        validFrom: null, validUntil: null, verificationExpiresAt: null, evidenceIds: ["e2"] },
      { id: "a3", kbId: KB, contentState: "indexed", verificationState: "verified", supersededById: null,
        validFrom: null, validUntil: null, verificationExpiresAt: null, evidenceIds: ["e3"] },
    ],
    relations: [
      { id: "r1", kbId: KB, schema: { ...tenderSchema }, type: "has_clause", sourceId: "project", targetId: "clause", assertionIds: ["a1"], origin: "asserted" },
      { id: "r2", kbId: KB, schema: { ...tenderSchema }, type: "requires", sourceId: "clause", targetId: "qualification", assertionIds: ["a2"], origin: "asserted" },
      { id: "r3", kbId: KB, schema: { ...tenderSchema }, type: "proven_by", sourceId: "qualification", targetId: "certificate", assertionIds: ["a3"], origin: "asserted" },
    ],
  };
}
