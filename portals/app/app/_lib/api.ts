// Console API client (track 10). Thin typed wrappers over the kb HTTP routes,
// which already enforce every authorization rule server-side (workspace scoping,
// the publish ladder, ownership). The browser only ever holds the opaque RP
// cookie, sent automatically same-origin; these helpers never see a token.
//
// Every call throws ApiError on a non-2xx so a component can branch on
// err.status (401 -> prompt sign-in) without threading a result type through the
// UI. The one place that maps a status to human wording is format.apiErrorMessage.
import type { Unavailable } from "../kb/processing/unavailable";
import type { DegradationKind } from "../kb/connectors/catalog";
import type { PublishState } from "./format";

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code?: string,
  ) {
    super(code ?? `HTTP ${status}`);
    this.name = "ApiError";
  }
}

export interface Kb {
  id: string;
  workspaceId: string;
  ownerType: "platform" | "tenant" | "user" | "product";
  ownerSub: string | null;
  name: string;
  description: string | null;
  publishState: PublishState;
  processingTemplateId: string | null;
  governanceEnabled: boolean;
  exemptSyncedContent: boolean;
  defaultVerifier: string | null;
  defaultVerifyIntervalDays: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface Doc {
  id: string;
  kbId: string;
  folderId: string | null;
  title: string;
  source: "upload" | "api" | "connector";
  contentState: string;
  verificationState: string;
  verifier: string | null;
  verifiedAt: string | null;
  expiresAt: string | null;
  mime: string | null;
  sizeBytes: number | null;
  failureReason: string | null;
  createdAt: string;
  updatedAt: string;
}

// Mirrors AuthUser (auth/lib/claims). Name/email are intentionally NOT here -
// they are kept out of the access token, so the token-derived session only knows
// the opaque sub, the active workspace, and the scope-prefixed roles.
export interface SessionUser {
  sub: string;
  activeWorkspace?: string | null;
  activeOrg?: string | null;
  roles?: string[];
  canManage?: boolean;
  isWorkspaceOwner?: boolean;
}

async function req<T>(input: string, init?: RequestInit): Promise<T> {
  const res = await fetch(input, { cache: "no-store", ...init });
  if (res.status === 204) return undefined as T;
  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    // no/invalid body
  }
  if (!res.ok) {
    const code = body && typeof body === "object" ? (body as { error?: string }).error : undefined;
    throw new ApiError(res.status, code);
  }
  return body as T;
}

/**
 * Read a required key off a response envelope.
 *
 * `req<T>` casts the parsed JSON without checking it, so naming the wrong
 * envelope key does not throw - it yields `undefined`, which flows into state
 * and crashes several renders later somewhere unrelated. (It did: a PATCH read
 * `kb` where every kb route sends `knowledgeBase`, and the page died in a card
 * that had nothing to do with the request.) Failing here names the endpoint and
 * the key instead.
 */
function need<T, K extends keyof T>(body: T, key: K, endpoint: string): NonNullable<T[K]> {
  const value = body?.[key];
  if (value === undefined || value === null) {
    throw new ApiError(500, `malformed_response:${endpoint}:${String(key)}`);
  }
  return value as NonNullable<T[K]>;
}

// --- session ------------------------------------------------------------------

export async function getSession(): Promise<{ authenticated: boolean; user?: SessionUser; reason?: string }> {
  return req("/auth/session");
}

export function loginHref(returnTo: string): string {
  return `/auth/login?returnTo=${encodeURIComponent(returnTo)}`;
}

// --- libraries ----------------------------------------------------------------

export async function listKbs(): Promise<Kb[]> {
  const body = await req<{ knowledgeBases: Kb[] }>("/api/kb");
  return need(body, "knowledgeBases", "/api/kb");
}

export async function getKb(id: string): Promise<Kb> {
  const body = await req<{ knowledgeBase: Kb }>(`/api/kb/${id}`);
  return need(body, "knowledgeBase", `/api/kb/${id}`);
}

export async function createKb(input: { name: string; description?: string }): Promise<Kb> {
  const body = await req<{ knowledgeBase: Kb }>("/api/kb", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });
  return need(body, "knowledgeBase", "/api/kb");
}

export async function setSharing(id: string, target: PublishState): Promise<Kb> {
  const body = await req<{ knowledgeBase: Kb }>(`/api/kb/${id}/publish`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ target }),
  });
  return need(body, "knowledgeBase", `/api/kb/${id}/publish`);
}

export async function setGovernance(id: string, governanceEnabled: boolean): Promise<Kb> {
  const body = await req<{ knowledgeBase: Kb }>(`/api/kb/${id}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ governanceEnabled }),
  });
  return need(body, "knowledgeBase", `/api/kb/${id}`);
}

// Verifier assignment (Track 12b): the default verifier (a user sub, or null to
// clear) and the re-verification interval in days (null = verify once).
export async function setVerifierConfig(
  id: string,
  cfg: { defaultVerifier: string | null; defaultVerifyIntervalDays: number | null },
): Promise<Kb> {
  const body = await req<{ knowledgeBase: Kb }>(`/api/kb/${id}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(cfg),
  });
  return need(body, "knowledgeBase", `/api/kb/${id}`);
}

// --- documents ----------------------------------------------------------------

/** 按 `document_id` 索引的驻留原因。空对象 = 没有任何文档卡住。 */
export type ParkedByDocument = Record<string, Unavailable>;

/**
 * 文档清单,外加**每份驻留文档卡在什么原因上**。
 *
 * `parked` 与 `documents` 并列而不是长在文档行上:文档没有驻留,是它的任务驻留了
 * (见 `kb/processing/task-read.ts` 的 `readParkedByDocument`)。
 *
 * 字段缺失时回落成空对象——旧版本的端点不返回它,而调用方直接索引,不该为此写判空。
 */
export async function listDocuments(kbId: string): Promise<{ documents: Doc[]; parked: ParkedByDocument }> {
  const body = await req<{ documents: Doc[]; parked?: ParkedByDocument }>(`/api/kb/${kbId}/documents`);
  return { documents: need(body, "documents", `/api/kb/${kbId}/documents`), parked: body.parked ?? {} };
}

export async function uploadDocument(
  kbId: string,
  file: File,
  title?: string,
  folderId?: string | null,
): Promise<Doc> {
  const form = new FormData();
  form.append("file", file);
  if (title) form.append("title", title);
  // The route has read `folder_id` from the start; nothing was sending it, so
  // every upload landed unfiled regardless of where the user was working.
  if (folderId) form.append("folder_id", folderId);
  const body = await req<{ document: Doc }>(`/api/kb/${kbId}/documents`, {
    method: "POST",
    body: form,
  });
  return need(body, "document", `/api/kb/${kbId}/documents`);
}

export async function deleteDocument(kbId: string, docId: string): Promise<void> {
  await req<void>(`/api/kb/${kbId}/documents/${docId}`, { method: "DELETE" });
}

export async function verifyDocument(kbId: string, docId: string): Promise<Doc> {
  const body = await req<{ document: Doc }>(`/api/kb/${kbId}/documents/${docId}/verify`, { method: "POST" });
  return need(body, "document", `/api/kb/${kbId}/documents/${docId}/verify`);
}

/** Re-run a failed document. Distinct from the queue tick, which is a machine
 *  endpoint behind INTERNAL_JOB_TOKEN and drains everything. */
export async function reprocessDocument(kbId: string, docId: string): Promise<Doc> {
  const body = await req<{ document: Doc }>(`/api/kb/${kbId}/documents/${docId}/reprocess`, { method: "POST" });
  return need(body, "document", `/api/kb/${kbId}/documents/${docId}/reprocess`);
}

/** Where the browser reads a document's bytes. `inline` asks for the disposition
 *  that RENDERS instead of saving; the server still refuses inline for types it
 *  will not serve that way (text/html and SVG execute script), so a caller
 *  cannot force it - which is why the decision lives there and not here. */
export function documentBytesHref(kbId: string, docId: string, inline = false): string {
  return `/api/kb/${kbId}/documents/${docId}/download${inline ? "?inline=1" : ""}`;
}

// --- folders ------------------------------------------------------------------

export interface Folder {
  id: string;
  kbId: string;
  name: string;
  createdAt: string;
  updatedAt: string;
}

export async function listFolders(kbId: string): Promise<Folder[]> {
  const body = await req<{ folders: Folder[] }>(`/api/kb/${kbId}/folders`);
  return need(body, "folders", `/api/kb/${kbId}/folders`);
}

export async function createFolder(kbId: string, name: string): Promise<Folder> {
  const body = await req<{ folder: Folder }>(`/api/kb/${kbId}/folders`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name }),
  });
  return need(body, "folder", `/api/kb/${kbId}/folders`);
}

export async function renameFolder(kbId: string, folderId: string, name: string): Promise<Folder> {
  const body = await req<{ folder: Folder }>(`/api/kb/${kbId}/folders/${folderId}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name }),
  });
  return need(body, "folder", `/api/kb/${kbId}/folders/${folderId}`);
}

export async function deleteFolder(kbId: string, folderId: string): Promise<void> {
  await req<void>(`/api/kb/${kbId}/folders/${folderId}`, { method: "DELETE" });
}

// --- library settings ---------------------------------------------------------

export interface ProcessingTemplateOption {
  id: string | null;
  templateCode: string;
  name: string;
  targetTokens: number;
  maxTokens: number;
  note: string;
}

export async function listProcessingTemplates(): Promise<ProcessingTemplateOption[]> {
  const body = await req<{ templates: ProcessingTemplateOption[] }>(`/api/kb/processing-templates`);
  return need(body, "templates", `/api/kb/processing-templates`);
}

export async function setProcessingTemplate(kbId: string, processingTemplateId: string | null): Promise<Kb> {
  // `knowledgeBase`, not `kb` - that is the key every kb route uses. Reading the
  // wrong one returns undefined rather than throwing, so the page sets its
  // library to undefined and crashes on the next render.
  const body = await req<{ knowledgeBase: Kb }>(`/api/kb/${kbId}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ processingTemplateId }),
  });
  return need(body, "knowledgeBase", `/api/kb/${kbId}`);
}

export interface MetadataField {
  fieldName: string;
  valueType: "string" | "number" | "datetime" | "enum";
  enumValues?: string[];
  filterable: boolean;
}

/** The filterable budget as the server computes it. `used` counts the five
 *  system dimensions, so a UI that showed `cap` as available would overstate it
 *  by five - which is why the server sends the arithmetic rather than the cap. */
export interface MetadataBudget {
  cap: number;
  used: number;
  remaining: number;
  systemDimensions: string[];
}

export async function listMetadataFields(kbId: string): Promise<{ fields: MetadataField[]; budget: MetadataBudget }> {
  return req<{ fields: MetadataField[]; budget: MetadataBudget }>(`/api/kb/${kbId}/metadata-fields`);
}

/** Replaces the WHOLE set - there is no per-field write. See the route comment:
 *  the cap and duplicate rules are set properties, and UPDATE is revoked on the
 *  table, so delete+insert is the only legal write. */
export async function putMetadataFields(
  kbId: string,
  fields: MetadataField[],
): Promise<{ fields: MetadataField[]; budget: MetadataBudget }> {
  return req<{ fields: MetadataField[]; budget: MetadataBudget }>(`/api/kb/${kbId}/metadata-fields`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ fields }),
  });
}

// --- search / ask (the Console retrieval surface) ------------------------------

export interface SearchItem {
  id: string;
  kbId: string;
  score: number;
  snippet: string;
}

export interface SearchResult {
  items: SearchItem[];
  degraded: null | "rerank_unavailable";
  partial: boolean;
  ignoredKbIds: string[];
  scopeKbIds: string[];
}

export async function searchKbs(input: {
  query: string;
  kb_ids?: string[];
  top_k?: number;
  verification_filter?: string;
}): Promise<SearchResult> {
  const body = await req<{ result: SearchResult }>("/api/kb/search", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });
  return need(body, "result", "/api/kb/search");
}

export interface AskResult {
  answer: string;
  citations: { id: string; kbId: string; snippet: string }[];
  degraded: null | "rerank_unavailable";
  partial: boolean;
  noContext: boolean;
}

export async function askKbs(input: {
  question: string;
  kb_ids?: string[];
  top_k?: number;
  verification_filter?: string;
}): Promise<AskResult> {
  const body = await req<{ result: AskResult }>("/api/kb/ask", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });
  return need(body, "result", "/api/kb/ask");
}

// --- governance: the re-verification work queue (batch 11) --------------------

export interface QueueItem {
  kind: "document" | "entry";
  id: string;
  kbId: string;
  kbName: string;
  /** Null for an untitled entry - the UI shows a placeholder rather than
   *  inventing one. */
  title: string | null;
  verificationState: "stale" | "unverified";
  verifier: string | null;
  verifiedAt: string | null;
  expiresAt: string | null;
  source: string | null;
}

export interface QueueResult {
  items: QueueItem[];
  /** Totals for the whole eligible queue, not the returned page. */
  staleTotal: number;
  unverifiedTotal: number;
  truncated: boolean;
  /** False offline, where there is no corpus to queue. */
  live: boolean;
}

export async function readGovernanceQueue(kbId?: string): Promise<QueueResult> {
  return req<QueueResult>(`/api/kb/governance/queue${kbId ? `?kb=${encodeURIComponent(kbId)}` : ""}`);
}

/** Verify one queue item. Documents and entries take different routes because
 *  they are different tables with different exemption rules - the queue carries
 *  `kind` precisely so the caller does not have to guess. */
export async function verifyQueueItem(item: Pick<QueueItem, "kind" | "kbId" | "id">): Promise<void> {
  const path =
    item.kind === "document"
      ? `/api/kb/${item.kbId}/documents/${item.id}/verify`
      : `/api/kb/${item.kbId}/entries/${item.id}/verify`;
  await req<unknown>(path, { method: "POST" });
}

export interface SweepSummary {
  scanned: number;
  staled: number;
  scope: "workspace" | "global";
  live?: boolean;
}

/** Run the interval-expiry sweep over the caller's OWN workspace. Sending no
 *  job token is what selects the scoped path; the global sweep is the cron
 *  caller's, and a user must not be able to reach it. */
export async function runGovernanceSweep(): Promise<SweepSummary> {
  return req<SweepSummary>("/api/kb/governance/sweep", { method: "POST" });
}

// --- connector bindings (batch 12) --------------------------------------------

export type BindingMode = "backfill" | "incremental";
export type BindingState = "active" | "paused" | "revoked";

export interface Binding {
  id: string;
  kbId: string;
  connectorCode: string;
  externalSourceId: string;
  mode: BindingMode;
  state: BindingState;
  /** karda-side consumption checkpoint. Null before the first sync. */
  cursor: string | null;
  lastSyncedAt: string | null;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ConnectorInfo {
  name: string;
  capabilities: {
    changeDetection: "source" | "karda";
    delivery: "poll" | "notify";
    fetch: "direct" | "ref";
    reconcile: "list" | "none";
    deleteSignal: "tombstone" | "absence";
  };
  /** Accepted trade-offs of this connector, stated rather than absorbed. */
  degradations: DegradationKind[];
}

export async function listBindings(kbId: string): Promise<Binding[]> {
  const body = await req<{ bindings: Binding[] }>(`/api/kb/${kbId}/bindings`);
  return need(body, "bindings", `/api/kb/${kbId}/bindings`);
}

export async function createBinding(
  kbId: string,
  connectorCode: string,
  externalSourceId: string,
): Promise<{ binding: Binding; connector?: ConnectorInfo }> {
  return req<{ binding: Binding; connector?: ConnectorInfo }>(`/api/kb/${kbId}/bindings`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ connector_code: connectorCode, external_source_id: externalSourceId }),
  });
}

export interface RevokeImpact {
  documents: number;
  /** Verified documents leaving recall - the part that actually hurts. */
  verified: number;
  unverified: number;
  /** Always false: the schema forbids re-binding a revoked source to the same
   *  library, so revoke is permanent for that pair. */
  rebindable: false;
  connectorCode: string;
  externalSourceId: string;
}

/** What a revoke would cost, BEFORE doing it. */
export async function previewRevoke(kbId: string, bindingId: string): Promise<RevokeImpact> {
  const body = await req<{ impact: RevokeImpact }>(`/api/kb/${kbId}/bindings/${bindingId}/revoke-preview`);
  return need(body, "impact", `/api/kb/${kbId}/bindings/${bindingId}/revoke-preview`);
}

export async function bindingAction(
  kbId: string,
  bindingId: string,
  action: "pause" | "resume" | "revoke",
): Promise<{ binding: Binding; cascade?: { tombstoned: number } }> {
  return req<{ binding: Binding; cascade?: { tombstoned: number } }>(`/api/kb/${kbId}/bindings/${bindingId}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ action }),
  });
}

/** The connector catalogue - what a library can bind to. */
export async function listConnectors(): Promise<(ConnectorInfo & { code: string; meetsDeleteInvariant: boolean })[]> {
  const body = await req<{ connectors: (ConnectorInfo & { code: string; meetsDeleteInvariant: boolean })[] }>(
    "/api/connectors",
  );
  return need(body, "connectors", "/api/connectors");
}

// --- the tool surface (batch 13) ----------------------------------------------

export interface ToolDescriptor {
  name: string;
  summary: string;
  mode: "obo_or_service" | "obo_only";
  metering: { kind: "per_call" | "per_doc" | "none"; metric?: string };
  input: string[];
  authz: { asset_types: string[] };
}

export interface ToolChannel {
  key: "runos" | "direct";
  name: string;
  endpoint: string;
  transport: string;
  auth: string;
  suits: string;
}

export interface ToolCatalog {
  protocolVersion: string;
  tools: ToolDescriptor[];
  channels: ToolChannel[];
  sameBackendBothChannels: boolean;
}

/** The tool surface as a human can read it. Projects the same manifest as
 *  /.well-known/vxture-tools, which is tailnet-only and S2S-authenticated - so
 *  a browser cannot read that one at all. */
export async function readToolCatalog(): Promise<ToolCatalog> {
  return req<ToolCatalog>("/api/tools/catalog");
}

// --- the evaluation runner (batch 14) -----------------------------------------

export interface EvalSetRow {
  id: string;
  name: string;
  description: string | null;
  kbScope: string[];
  questionCount: number;
  createdAt: string;
}

export interface EvalQuestionRow {
  id: string;
  question: string;
  /** DOCUMENT ids, never chunk ids - chunk ids are reborn on every rebuild. */
  expectedEvidence: string[];
  note: string | null;
  position: number;
}

export interface EvalRunRow {
  id: string;
  setId: string;
  baselineLabel: string;
  verificationFilter: string;
  topK: number;
  state: string;
  questionCount: number;
  /** NULL means NOT MEASURED, never zero. */
  recallHitPct: number | null;
  citationPrecisionPct: number | null;
  groundedAnswerPct: number | null;
  gapCount: number;
  degraded: boolean;
  startedAt: string;
  finishedAt: string | null;
}

export interface MetricDelta {
  key: "recallHitPct" | "citationPrecisionPct" | "groundedAnswerPct";
  current: number | null;
  previous: number | null;
  delta: number | null;
  direction: "better" | "worse" | "flat" | "unknown";
}

export interface RunWithDelta {
  run: EvalRunRow;
  previousRunId: string | null;
  deltas: MetricDelta[];
  regression: boolean;
}

export interface GapRow {
  questionId: string;
  question: string;
  recallHit: boolean;
  citedExpected: number;
  citedTotal: number;
  grounded: boolean;
  answerExcerpt: string | null;
}

export async function listEvalSets(): Promise<{ sets: EvalSetRow[]; live: boolean }> {
  return req<{ sets: EvalSetRow[]; live: boolean }>("/api/evaluation/sets");
}

export async function createEvalSet(name: string, kbScope: string[], description?: string): Promise<EvalSetRow> {
  const body = await req<{ set: EvalSetRow }>("/api/evaluation/sets", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name, kb_scope: kbScope, description }),
  });
  return need(body, "set", "/api/evaluation/sets");
}

export async function listEvalQuestions(setId: string): Promise<EvalQuestionRow[]> {
  const body = await req<{ questions: EvalQuestionRow[] }>(`/api/evaluation/sets/${setId}/questions`);
  return need(body, "questions", `/api/evaluation/sets/${setId}/questions`);
}

export async function addEvalQuestion(
  setId: string,
  question: string,
  expectedEvidence: string[],
  note?: string,
): Promise<EvalQuestionRow> {
  const body = await req<{ question: EvalQuestionRow }>(`/api/evaluation/sets/${setId}/questions`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ question, expected_evidence: expectedEvidence, note }),
  });
  return need(body, "question", `/api/evaluation/sets/${setId}/questions`);
}

export async function deleteEvalQuestion(setId: string, questionId: string): Promise<void> {
  await req<void>(`/api/evaluation/sets/${setId}/questions?id=${encodeURIComponent(questionId)}`, { method: "DELETE" });
}

export interface RunReport extends RunWithDelta {
  previous: EvalRunRow | null;
  /** False when Atlas A4 is unconfigured - the two citation metrics come back
   *  NULL rather than 0, and the page must say "not measured". */
  answeringAvailable: boolean;
  /** Questions skipped for asserting no expected evidence. */
  skipped: number;
}

export async function runEvalSet(
  setId: string,
  input: { baseline_label: string; verification_filter?: string; top_k?: number },
): Promise<RunReport> {
  return req<RunReport>(`/api/evaluation/sets/${setId}/run`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });
}

export async function listEvalRuns(setId?: string): Promise<{ runs: RunWithDelta[]; live: boolean }> {
  return req<{ runs: RunWithDelta[]; live: boolean }>(
    `/api/evaluation/runs${setId ? `?set=${encodeURIComponent(setId)}` : ""}`,
  );
}

export async function readRunDetail(runId: string): Promise<{ detail?: { runId: string; results: GapRow[] } }> {
  return req<{ detail?: { runId: string; results: GapRow[] } }>(
    `/api/evaluation/runs?run=${encodeURIComponent(runId)}`,
  );
}
