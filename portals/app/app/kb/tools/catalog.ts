// The karda.* tool catalog (120-retrieval-tools 6; product_210 protocol). The
// descriptors published at /.well-known/vxture-tools and the mode rules that
// gate every call - pure data + pure predicates, so the contract face is fully
// testable without S2S or HTTP.
//
// The rule that carries the weight: create / attach / write are user-semantic
// acts and are OBO-ONLY - a service-mode call is refused (403 access_denied),
// the same hard rule as "service cannot reach a private library". A background
// task must not forge assets on a user's behalf.

export type ToolMode = "obo_or_service" | "obo_only";
export type MeteringKind = "per_call" | "per_doc" | "none";

export interface ToolDescriptor {
  name: string; // karda.<tool>
  summary: string;
  mode: ToolMode;
  metering: { kind: MeteringKind; metric?: string };
  /** Input keys the tool accepts (documented; validated per-tool). */
  input: string[];
  authz: { asset_types: ["knowledge_base"] };
}

export const PROTOCOL_VERSION = "1.0.0";

export const TOOLS: ToolDescriptor[] = [
  {name:"karda.knowledge_subscription",summary:"Persist an identity/product-bound knowledge window and consumption checkpoint. action=create/list/poll/ack/cancel. Poll always revalidates current scope and returns a replacement window plus bounded revision metadata replay; ack is explicit CAS and never grants offline access. No historical content, webhook push, background polling or model call. On any error discard cached content; cancelled or revoked scopes cannot deliver.",
    mode:"obo_only",metering:{kind:"none"},input:["action","id","name","window","before","after","sequence","revision","expectedAck"],authz:{asset_types:["knowledge_base"]}},
  {
    name:"karda.topic_knowledge",
    summary:"Discover current relation topics, then read an evidence compilation and separately human-accepted cited summary. Same current authority, consumer-product attachment, source and latest-review checks as knowledge packages. action=list or read with relation_type; optional summary_id selects an accepted current summary, before pages accepted summaries. Empty results never expose pending/stale summary identities. No model call, approval or writes. Discard old content on errors; revalidate before reuse.",
    mode:"obo_only",metering:{kind:"none"},input:["kb_id","action","relation_type","summary_id","before"],authz:{asset_types:["knowledge_base"]},
  },
  {
    name:"karda.published_search",
    summary:"Lexical search of currently authorized reviewed published relations, entity labels, assertions and exact supporting evidence across up to20 explicit attached user libraries. Returns ranked relation IDs with a bounded knowledge package. Optional page_cursor (empty starts) enables current-authority pagination; retain query, top_k, types and library scope. Replace each page; discard on error and restart on409. Each page request is metered. Excludes drafts/inference/stale sources before ranking. Scores are local ordering only, not confidence. No graph expansion, model answer or service-mode access.",
    mode:"obo_only",metering:{kind:"per_call",metric:"karda.search"},
    input:["kb_ids","query","top_k","relation_types","page_cursor"],authz:{asset_types:["knowledge_base"]},
  },
  {
    name:"karda.knowledge_sync",
    summary:"Revalidate one published knowledge window. Use knowledge_package inputs plus optional known_revision. replace atomically replaces the window (including empty); unchanged omits the payload. Revisions grant no access or offline lease. Revalidate before reuse; discard cached knowledge on any error, 401/403, or 409 and restart paging on 409. No event feed or cross-page snapshot guarantee.",
    mode:"obo_only",
    metering:{kind:"none"},
    input:["kb_id","kb_ids","entity_ids","relation_types","max_hops","max_nodes","max_edges","page_cursor","known_revision"],
    authz:{asset_types:["knowledge_base"]},
  },
  {
    name:"karda.source_search",
    summary:"Search exact current source passages with version, hash, UTF-16 offsets and PDF pages; no generated knowledge or summaries. Initial adapter supports same-workspace user libraries in the caller product's attachments.",
    mode:"obo_only",
    metering:{kind:"per_call",metric:"karda.search"},
    input:["kb_ids","query","top_k","verification_filter"],
    authz:{asset_types:["knowledge_base"]},
  },
  {
    name:"karda.knowledge_package",
    summary:"Read reviewed published relations and exact evidence across up to 20 explicitly named, visible attached user libraries. Supply either kb_id or kb_ids. For directory paging use empty entity_ids and page_cursor='', then directoryPage.nextCursor with unchanged filters/budgets. On 409 restart; cursors grant no access. Library identities stay distinct.",
    mode:"obo_only",
    metering:{kind:"none"},
    input:["kb_id","kb_ids","entity_ids","relation_types","max_hops","max_nodes","max_edges","page_cursor"],
    authz:{asset_types:["knowledge_base"]},
  },
  {
    name: "karda.search",
    summary: "Hybrid retrieval across visible, attached libraries.",
    mode: "obo_or_service",
    metering: { kind: "per_call", metric: "karda.search" },
    input: ["query", "top_k", "kb_ids", "preset_kb_ids", "verification_filter", "filters", "task_id"],
    authz: { asset_types: ["knowledge_base"] },
  },
  {
    name: "karda.ask",
    summary: "Single-turn cited question answering.",
    mode: "obo_or_service",
    metering: { kind: "per_call", metric: "karda.ask" },
    input: ["question", "top_k", "kb_ids", "preset_kb_ids", "verification_filter", "task_id"],
    authz: { asset_types: ["knowledge_base"] },
  },
  {
    name: "karda.get_evidence",
    summary: "What a citation rests on: the assertions it covers, who asserted them, when, and from which document version.",
    mode: "obo_or_service",
    // NOT metered, and that is a product decision rather than an oversight.
    // This is the follow-up an agent makes to CHECK an answer it was already
    // charged for. Billing the check would put a price on verification - the
    // one behaviour a knowledge platform should be making free.
    metering: { kind: "none" },
    input: ["citation_id"],
    authz: { asset_types: ["knowledge_base"] },
  },
  {
    name: "karda.get_context",
    summary: "The passage a citation came from, read out of the source document with surrounding context.",
    mode: "obo_or_service",
    // Not metered, like get_evidence and for the same reason: this reads around
    // a citation the caller was already charged for. What keeps that safe is
    // that the caller chooses the WIDTH of the window and never its position -
    // the anchor is always the citation. Total unmetered reach is therefore
    // bounded by the citations it holds, and citations only come from
    // search/ask, which are metered.
    metering: { kind: "none" },
    input: ["citation_id", "radius"],
    authz: { asset_types: ["knowledge_base"] },
  },
  {
    name: "karda.find_entity",
    summary: "What the corpus knows about a thing: the entity, and the assertions naming it with their sources.",
    mode: "obo_or_service",
    // Metered per call, unlike get_evidence. The distinction is what the call
    // IS: get_evidence checks an answer the caller already paid for, and
    // charging for a check would put a price on verification. This one is a
    // fresh question against the corpus - the same kind of work search does,
    // and priced the same way.
    metering: { kind: "per_call", metric: "karda.find_entity" },
    input: ["name", "kb_ids"],
    authz: { asset_types: ["knowledge_base"] },
  },
  {
    name: "karda.browse",
    summary: "What a library holds: its assertions or its entities, paged.",
    mode: "obo_or_service",
    // Metered per call, like search and find_entity. It reads the corpus and
    // returns content; that it takes no query does not make it cheaper. If
    // anything the opposite - browse is the one tool a caller can loop.
    metering: { kind: "per_call", metric: "karda.browse" },
    input: ["kb_id", "target", "page_size", "cursor"],
    authz: { asset_types: ["knowledge_base"] },
  },
  {
    name: "karda.list_kbs",
    summary: "List visible / attached libraries with tier and governance summary.",
    mode: "obo_or_service",
    metering: { kind: "none" },
    input: ["filter"],
    authz: { asset_types: ["knowledge_base"] },
  },
  {
    name: "karda.attach_kb",
    summary: "Add a library to the caller's user x product attachment list.",
    mode: "obo_only",
    metering: { kind: "none" },
    input: ["kb_id"],
    authz: { asset_types: ["knowledge_base"] },
  },
  {
    name: "karda.detach_kb",
    summary: "Remove a library from the caller's attachment list.",
    mode: "obo_only",
    metering: { kind: "none" },
    input: ["kb_id"],
    authz: { asset_types: ["knowledge_base"] },
  },
  {
    name: "karda.create_kb",
    summary: "Create a user-tier library, auto-attached at the creation site.",
    mode: "obo_only",
    metering: { kind: "none" },
    input: ["name", "processing_template"],
    authz: { asset_types: ["knowledge_base"] },
  },
  {
    name: "karda.write_document",
    summary: "Write a document into a library (knowledge capture path).",
    mode: "obo_only",
    metering: { kind: "per_doc", metric: "karda.ingest" },
    input: ["kb_id", "content", "file_ref", "template_override"],
    authz: { asset_types: ["knowledge_base"] },
  },
  {
    name: "karda.create_entry",
    summary: "Write an entry to a library per a content template.",
    mode: "obo_only",
    metering: { kind: "per_doc", metric: "karda.ingest" },
    input: ["kb_id", "template_id", "fields"],
    authz: { asset_types: ["knowledge_base"] },
  },
];

const BY_NAME = new Map(TOOLS.map((t) => [t.name, t]));

export function toolByName(name: string): ToolDescriptor | null {
  return BY_NAME.get(name) ?? null;
}

/** The manifest published at GET /.well-known/vxture-tools (S2S, tailnet only). */
export function manifest(): { protocol_version: string; tools: ToolDescriptor[] } {
  return { protocol_version: PROTOCOL_VERSION, tools: TOOLS };
}

// --- mode gate --------------------------------------------------------------

export type CallMode = "obo" | "service";

export type ModeCheck = { allowed: true } | { allowed: false; reason: string };

/**
 * Is `callMode` permitted for `tool`? An obo_only tool refuses a service call.
 * This is the one place the OBO-only rule is enforced, so a new tool cannot ship
 * without going through it.
 */
export function checkMode(tool: ToolDescriptor, callMode: CallMode): ModeCheck {
  if (tool.mode === "obo_only" && callMode === "service") {
    return { allowed: false, reason: "access_denied: this tool requires a user (OBO) call" };
  }
  return { allowed: true };
}

/** A create/attach/write tool needs a user sub; a search tool does not. */
export function requiresUser(tool: ToolDescriptor): boolean {
  return tool.mode === "obo_only";
}
