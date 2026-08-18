// The Runos-channel tool surface (230-runos-channel): karda's knowledge service
// exposed as MCP tools for the Runos commercial-capability gateway. Two Runos
// capabilities front this one endpoint:
//
//   karda.kb-read   operations: search | ask | list_kbs        (risk: read)
//   karda.kb-write  operations: write_document | create_entry  (risk: write)
//
// Runos live-verifies the registered operations against this tools/list at
// endpoint registration (tools_list_mismatch), so names and schemas here ARE
// the registration contract - snake_case operation names, declared operations
// a subset of what the endpoint serves.
//
// Channel rules (the deliberate deltas vs the direct S2S channel):
// - Calls arrive in SERVICE mode (Runos per-caller credentials are blocked on
//   platform token exchange; the gateway injects one account-scoped channel
//   credential). Tenant context therefore rides ARGUMENTS (org_id/workspace_id),
//   not a token - Runos's capability-level authorization (grant, risk_scope,
//   quota) has already run in front of us; object-level checks stay ours.
// - search/ask take REQUIRED kb_ids, merged as PRESET libraries (product_110
//   D5): a service caller has no user attachment list, so it names its
//   libraries explicitly; visibility still gates every id.
// - write_document/create_entry ARE allowed in service mode on THIS channel
//   (owner direction 2026-08-18: the capability platform gets knowledge read
//   AND write). The OBO-only rule on the direct channel guards against a
//   background task forging USER assets; a Runos-channel write is a PRODUCT
//   act, target-scoped to the caller-named workspace, and lands as
//   `processing`/`draft` - never directly published - per the governance ladder
//   (owner product definition section 15: Draft -> Review/Verify -> Published).
import type { CallerContext } from "../tools/s2s";
import type { ToolBackends } from "../tools/dispatch";
import { toolResult, type McpToolResult } from "./protocol";

/** The act.sub-equivalent this channel records: calls are attributed to the
 *  runos gateway (per-agent attribution lives in Runos's own audit, keyed by
 *  the _meta.vxture task_id the agent sent there). */
export const CHANNEL_CALLER = "runos";

const CONTEXT_PROPS = {
  org_id: {
    type: "string",
    description: "Platform tenant UUID (the org). Threaded to Atlas as tenantId - must be the platform UUID.",
  },
  workspace_id: { type: "string", description: "The workspace the call operates in." },
  task_id: {
    type: "string",
    maxLength: 128,
    description: "The agent task's work-unit id; the SAME value the agent sent Runos. Optional but strongly preferred.",
  },
} as const;

export interface McpToolDef {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

export const MCP_TOOLS: McpToolDef[] = [
  {
    name: "search",
    description:
      "Hybrid retrieval (lexical + vector, reranked) across the named knowledge libraries. " +
      "kb_ids is required: service callers name their libraries explicitly; ids that are not " +
      "visible to this workspace are ignored and echoed in ignored_kb_ids.",
    inputSchema: {
      type: "object",
      properties: {
        ...CONTEXT_PROPS,
        query: { type: "string" },
        kb_ids: { type: "array", items: { type: "string" }, minItems: 1 },
        top_k: { type: "integer", minimum: 1, maximum: 50 },
        verification_filter: { type: "string", enum: ["verified_only", "verified_and_untracked", "all"] },
      },
      required: ["org_id", "workspace_id", "query", "kb_ids"],
    },
  },
  {
    name: "ask",
    description:
      "Single-turn cited question answering grounded ONLY in the named libraries' content. " +
      "Returns answer + citations; no_context=true means retrieval found nothing and no answer was generated.",
    inputSchema: {
      type: "object",
      properties: {
        ...CONTEXT_PROPS,
        question: { type: "string" },
        kb_ids: { type: "array", items: { type: "string" }, minItems: 1 },
        top_k: { type: "integer", minimum: 1, maximum: 50 },
        verification_filter: { type: "string", enum: ["verified_only", "verified_and_untracked", "all"] },
      },
      required: ["org_id", "workspace_id", "question", "kb_ids"],
    },
  },
  {
    name: "list_kbs",
    description: "List the workspace's knowledge libraries with tier and governance summary.",
    inputSchema: {
      type: "object",
      properties: { ...CONTEXT_PROPS },
      required: ["org_id", "workspace_id"],
    },
  },
  {
    name: "write_document",
    description:
      "Capture a document into a library (knowledge-capture path). The document lands in `processing` " +
      "and flows the normal pipeline + governance ladder - it is never directly published.",
    inputSchema: {
      type: "object",
      properties: {
        ...CONTEXT_PROPS,
        kb_id: { type: "string" },
        content: { type: "string", description: "Inline utf-8 text content." },
        title: { type: "string" },
      },
      required: ["org_id", "workspace_id", "kb_id", "content"],
    },
  },
  {
    name: "create_entry",
    description:
      "Write a template-shaped entry (faq | glossary | sop) into a library. The entry lands as a `draft`; " +
      "publishing is a separate governed act.",
    inputSchema: {
      type: "object",
      properties: {
        ...CONTEXT_PROPS,
        kb_id: { type: "string" },
        template_id: { type: "string", description: "Template CODE: faq, glossary, or sop." },
        fields: { type: "object" },
        title: { type: "string" },
      },
      required: ["org_id", "workspace_id", "kb_id", "template_id", "fields"],
    },
  },
];

const TOOL_NAMES = new Set(MCP_TOOLS.map((t) => t.name));

export function isMcpTool(name: string): boolean {
  return TOOL_NAMES.has(name);
}

// --- calling -----------------------------------------------------------------

function invalid(detail: string): McpToolResult {
  return toolResult({ error: "invalid_arguments", detail }, true);
}

function str(v: unknown): string | null {
  return typeof v === "string" && v.length > 0 ? v : null;
}

/** Build the service-mode caller for this channel from the call's arguments. */
export function channelCaller(args: Record<string, unknown>): CallerContext | null {
  const org = str(args.org_id);
  const ws = str(args.workspace_id);
  if (!org || !ws) return null;
  return { callerProduct: CHANNEL_CALLER, org, workspace: ws, user: null, mode: "service" };
}

/**
 * Execute one MCP tool call against the shared backends. Handler failures
 * become isError tool results (MCP's two-layer rule, same as Runos's own
 * gateway: transport-layer errors are HTTP; everything after auth is a tool
 * result).
 */
export async function callMcpTool(
  name: string,
  args: Record<string, unknown>,
  backends: ToolBackends,
): Promise<McpToolResult> {
  const caller = channelCaller(args);
  if (!caller) return invalid("org_id and workspace_id are required");
  const ws = caller.workspace as string;

  try {
    switch (name) {
      case "list_kbs": {
        const kbs = await backends.listKbs(ws);
        return toolResult({ knowledgeBases: kbs as Record<string, unknown> });
      }
      case "search": {
        if (!backends.search) return toolResult({ error: "not_implemented", detail: "search backend not wired" }, true);
        const kbIds = presetIds(args);
        if (!kbIds) return invalid("kb_ids (non-empty string array) is required on this channel");
        const result = await backends.search(caller, {
          query: args.query,
          top_k: args.top_k,
          verification_filter: args.verification_filter,
          task_id: args.task_id,
          preset_kb_ids: kbIds,
        });
        return toolResult(result as Record<string, unknown>);
      }
      case "ask": {
        if (!backends.ask) {
          return toolResult({ error: "not_implemented", detail: "generation (Atlas A4) is not configured" }, true);
        }
        const kbIds = presetIds(args);
        if (!kbIds) return invalid("kb_ids (non-empty string array) is required on this channel");
        const result = await backends.ask(caller, {
          question: args.question,
          top_k: args.top_k,
          verification_filter: args.verification_filter,
          task_id: args.task_id,
          preset_kb_ids: kbIds,
        });
        return toolResult(result as Record<string, unknown>);
      }
      case "write_document": {
        if (!backends.writeDocument) {
          return toolResult({ error: "not_implemented", detail: "write_document backend not wired" }, true);
        }
        const r = await backends.writeDocument(caller, {
          kb_id: args.kb_id,
          content: args.content,
          title: args.title,
        });
        return toolResult(r.body, r.status >= 400);
      }
      case "create_entry": {
        if (!backends.createEntry) {
          return toolResult({ error: "not_implemented", detail: "create_entry backend not wired" }, true);
        }
        const r = await backends.createEntry(caller, {
          kb_id: args.kb_id,
          template_id: args.template_id,
          fields: args.fields,
          title: args.title,
        });
        return toolResult(r.body, r.status >= 400);
      }
      default:
        return toolResult({ error: "unknown_tool", detail: name }, true);
    }
  } catch (e) {
    // A thrown backend failure (Atlas outage on ask, a DB hiccup) is a tool
    // failure, not a protocol failure - Runos's invoke maps it to
    // capability_error/provider_error on its side.
    return toolResult({ error: "capability_failure", detail: e instanceof Error ? e.message : String(e) }, true);
  }
}

function presetIds(args: Record<string, unknown>): string[] | null {
  if (!Array.isArray(args.kb_ids)) return null;
  const ids = (args.kb_ids as unknown[]).filter((x): x is string => typeof x === "string" && x.length > 0);
  return ids.length > 0 ? ids : null;
}
