// Factory-preset templates (KD-002 for content, 110-processing section for
// processing). These are product data, not DB structure, so they do not live in
// the DDL - but the tables that hold them (processing_template, content_template,
// content_template_field) have no UPDATE granted to the service role by design
// (98_column_locks: templates are seed/declarative, evolution means a new version
// row, never an in-place edit). So the seed path is INSERT-only and idempotent:
// ON CONFLICT DO NOTHING against the unique keys.
//
// Defined as code constants rather than a seed.sql so the same list drives both
// the runtime seed and the tests, with no second copy to drift.

export interface ProcessingPreset {
  templateCode: string;
  name: string;
  /** Chunking defaults (KD-007: target 512 / max 1024 / overlap 0). */
  defaultParams: { targetTokens: number; maxTokens: number; overlap: number; note: string };
}

// The six presets from 110-processing. org may tune params but not author new
// templates in v1; is_preset defaults true in the schema.
export const PROCESSING_PRESETS: ProcessingPreset[] = [
  {
    templateCode: "general",
    name: "General (structure-aware semantic)",
    defaultParams: { targetTokens: 512, maxTokens: 1024, overlap: 0, note: "split on IR element boundaries; bisect over-long elements at semantic breaks" },
  },
  {
    templateCode: "qa",
    name: "Q&A pairs",
    defaultParams: { targetTokens: 512, maxTokens: 1024, overlap: 0, note: "one question-answer per chunk; question weighted into search text" },
  },
  {
    templateCode: "table",
    name: "Table (row-wise)",
    defaultParams: { targetTokens: 512, maxTokens: 1024, overlap: 0, note: "header + row per chunk; header replicated into each" },
  },
  {
    templateCode: "manual",
    name: "Manual (hierarchical parent/child)",
    defaultParams: { targetTokens: 512, maxTokens: 1024, overlap: 0, note: "parent=section child=paragraph; recall child carries parent context" },
  },
  {
    templateCode: "paper",
    name: "Paper (section-aware)",
    defaultParams: { targetTokens: 512, maxTokens: 1024, overlap: 0, note: "formulas/figures as standalone chunks linked to their paragraph" },
  },
  {
    templateCode: "legal",
    name: "Legal (clause-wise)",
    defaultParams: { targetTokens: 512, maxTokens: 1024, overlap: 0, note: "clause-structured splitting for regulatory packages" },
  },
];

export type RetrievalRole = "search_text" | "filterable" | "store_only";
export type FieldValueType = "string" | "number" | "datetime" | "enum" | "richtext";

export interface ContentFieldPreset {
  fieldName: string;
  valueType: FieldValueType;
  required: boolean;
  retrievalRole: RetrievalRole;
  position: number;
  enumValues?: string[];
}

export interface ContentPreset {
  templateCode: string;
  name: string;
  fields: ContentFieldPreset[];
}

// The three v1 preset content templates (KD-002: FAQ / glossary / SOP card).
// scope='platform', so workspace_id is null; version 1.
export const CONTENT_PRESETS: ContentPreset[] = [
  {
    templateCode: "faq",
    name: "FAQ",
    fields: [
      { fieldName: "question", valueType: "string", required: true, retrievalRole: "search_text", position: 0 },
      { fieldName: "answer", valueType: "richtext", required: true, retrievalRole: "search_text", position: 1 },
      { fieldName: "category", valueType: "string", required: false, retrievalRole: "filterable", position: 2 },
    ],
  },
  {
    templateCode: "glossary",
    name: "Glossary term",
    fields: [
      { fieldName: "term", valueType: "string", required: true, retrievalRole: "search_text", position: 0 },
      { fieldName: "definition", valueType: "richtext", required: true, retrievalRole: "search_text", position: 1 },
      { fieldName: "aliases", valueType: "string", required: false, retrievalRole: "search_text", position: 2 },
      { fieldName: "domain", valueType: "string", required: false, retrievalRole: "filterable", position: 3 },
    ],
  },
  {
    templateCode: "sop",
    name: "SOP card",
    fields: [
      { fieldName: "title", valueType: "string", required: true, retrievalRole: "search_text", position: 0 },
      { fieldName: "steps", valueType: "richtext", required: true, retrievalRole: "search_text", position: 1 },
      { fieldName: "trigger", valueType: "string", required: false, retrievalRole: "search_text", position: 2 },
      { fieldName: "owner_role", valueType: "string", required: false, retrievalRole: "filterable", position: 3 },
      { fieldName: "status", valueType: "enum", required: false, retrievalRole: "filterable", position: 4, enumValues: ["draft", "active", "retired"] },
    ],
  },
];
