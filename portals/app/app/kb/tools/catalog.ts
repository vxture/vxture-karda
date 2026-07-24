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
  {
    name: "karda.search",
    summary: "Hybrid retrieval across visible, attached libraries.",
    mode: "obo_or_service",
    metering: { kind: "per_call", metric: "karda.search" },
    input: ["query", "top_k", "kb_ids", "verification_filter", "filters"],
    authz: { asset_types: ["knowledge_base"] },
  },
  {
    name: "karda.ask",
    summary: "Single-turn cited question answering.",
    mode: "obo_or_service",
    metering: { kind: "per_call", metric: "karda.ask" },
    input: ["question", "top_k", "kb_ids", "verification_filter"],
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
