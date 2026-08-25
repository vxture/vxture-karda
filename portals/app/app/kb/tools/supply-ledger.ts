import { prismaEnabled, getPrismaClient } from "../../lib/db";
import type { CallerContext } from "./s2s";
import type { DispatchResult } from "./dispatch";

// The supply ledger writer (240-ops-read-models section 4.3/4.4).
//
// One row per SERVED CALL, on both channels. Until this existed the 供给通道
// domain queried no database at all - every figure on that page was a demo
// constant. karda reports usage to the platform (local_usage -> C3), but that
// buffer is flushed and gone and carries no consumer/capability/asset breakdown,
// so it cannot answer "who called what, against which library".
//
// TWO rules shape everything here:
//
//  1. RECORDING MUST NEVER FAIL A CALL. The ledger is observability; a served
//     call that succeeded must not turn into an error because a bookkeeping
//     INSERT failed. Every write is best-effort and swallows its own errors.
//     The inverse - silently losing rows - is the accepted cost, and it is the
//     right trade: a missing row understates a chart, a thrown error breaks a
//     tenant's agent.
//  2. CLASSIFICATION IS PURE. What a dispatch result MEANS (ok / degraded /
//     error, which capability, which operation) is decided by a function with no
//     IO, so the mapping is testable without a database - which is the only way
//     its edge cases get covered at all.

export type SupplyChannel = "direct" | "runos";
export type SupplyOutcome = "ok" | "degraded" | "error";

export interface SupplyAssetCitation {
  kbId: string;
  citedCount: number;
}

export interface SupplyCallEvent {
  channel: SupplyChannel;
  capability: string;
  operation: string;
  consumerCode: string | null;
  workspaceId: string;
  taskIdRef: string | null;
  outcome: SupplyOutcome;
  errorCode: string | null;
  latencyMs: number;
  /** Per-library CITATION attribution (not recall) - see 240 section 4.4. */
  assets: SupplyAssetCitation[];
}

export interface SupplyLedger {
  record(event: SupplyCallEvent): Promise<void>;
}

/** Runos capability fronting each operation (230-runos-channel section 2). The
 *  direct S2S channel serves the same operations without a Runos capability
 *  wrapper, but the capability is still the授权/计费 unit, so it is recorded on
 *  both channels - that is what makes the two channels comparable at all. */
const CAPABILITY_BY_OPERATION: Record<string, string> = {
  search: "karda.kb-read",
  ask: "karda.kb-read",
  list_kbs: "karda.kb-read",
  write_document: "karda.kb-write",
  create_entry: "karda.kb-write",
  create_kb: "karda.kb-write",
  attach_kb: "karda.kb-write",
  detach_kb: "karda.kb-write",
};

/** `karda.search` -> `search`. The tool name is the wire name; the ledger stores
 *  the bare operation so it groups with the Runos channel, which sends
 *  snake_case operations without the product prefix. */
export function operationOf(toolName: string): string {
  return toolName.startsWith("karda.") ? toolName.slice("karda.".length) : toolName;
}

export function capabilityOf(operation: string): string {
  return CAPABILITY_BY_OPERATION[operation] ?? "karda.unknown";
}

/** How a dispatch result reads as a ledger outcome.
 *
 *  `degraded` is NOT a status code - it is a 200 that the retrieval chain marked
 *  as degraded or partial in its own body. Folding those into `ok` would hide
 *  exactly the condition the 供给通道 page exists to show: the channel answering,
 *  but not fully. */
export function classifyOutcome(res: DispatchResult): { outcome: SupplyOutcome; errorCode: string | null } {
  if (res.status >= 400) {
    const code = res.body?.error;
    return { outcome: "error", errorCode: typeof code === "string" ? code : `http_${res.status}` };
  }
  const result = res.body?.result as { degraded?: unknown; partial?: unknown } | undefined;
  if (result && (result.degraded === true || result.partial === true)) {
    return { outcome: "degraded", errorCode: null };
  }
  return { outcome: "ok", errorCode: null };
}

/** Citation attribution from a search/ask body. Counts CITED libraries only, and
 *  a library cited zero times gets no entry - heat is "was it believed", and
 *  counting recalls would make a library nobody ever trusted look busy. */
export function citationsOf(res: DispatchResult): SupplyAssetCitation[] {
  const result = res.body?.result as { citations?: unknown; hits?: unknown } | undefined;
  const rows = Array.isArray(result?.citations) ? result.citations : Array.isArray(result?.hits) ? result.hits : [];
  const byKb = new Map<string, number>();
  for (const row of rows) {
    const kbId = (row as { kbId?: unknown })?.kbId;
    if (typeof kbId !== "string" || kbId.length === 0) continue;
    byKb.set(kbId, (byKb.get(kbId) ?? 0) + 1);
  }
  return [...byKb.entries()].map(([kbId, citedCount]) => ({ kbId, citedCount }));
}

/** The `task_id` a caller threaded through (karda#101's cross-product work-unit
 *  key). Clamped to the column width rather than rejected: a too-long id is a
 *  caller bug that must not cost us the whole row. */
export function taskIdRefOf(args: Record<string, unknown>): string | null {
  const raw = args?.task_id;
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  return trimmed.length === 0 ? null : trimmed.slice(0, 128);
}

/** Build the event from everything the seam knows. Pure - no clock, no IO: the
 *  caller supplies the elapsed time it measured. */
export function supplyEventFor(input: {
  channel: SupplyChannel;
  toolName: string;
  args: Record<string, unknown>;
  caller: CallerContext;
  result: DispatchResult;
  latencyMs: number;
}): SupplyCallEvent | null {
  const workspaceId = input.caller.workspace;
  // No workspace means the call was refused before it served anything (dispatch
  // returns 400 no_workspace). There is no tenant to attribute it to, and a row
  // with a fabricated workspace would be worse than no row.
  if (!workspaceId) return null;

  const operation = operationOf(input.toolName);
  const { outcome, errorCode } = classifyOutcome(input.result);
  return {
    channel: input.channel,
    capability: capabilityOf(operation),
    operation,
    consumerCode: input.caller.callerProduct || null,
    workspaceId,
    taskIdRef: taskIdRefOf(input.args),
    outcome,
    errorCode,
    latencyMs: Math.max(0, Math.round(input.latencyMs)),
    assets: outcome === "error" ? [] : citationsOf(input.result),
  };
}

/** Drops everything. Used when no database is attached, so the seam has one
 *  code path instead of a null check at every call site. */
export const NULL_SUPPLY_LEDGER: SupplyLedger = {
  async record() {
    /* no ledger without a database */
  },
};

class PrismaSupplyLedger implements SupplyLedger {
  async record(event: SupplyCallEvent): Promise<void> {
    try {
      const p = await getPrismaClient();
      await p.supplyCall.create({
        data: {
          channel: event.channel,
          capability: event.capability,
          operation: event.operation,
          consumerCode: event.consumerCode,
          workspaceId: event.workspaceId,
          taskIdRef: event.taskIdRef,
          outcome: event.outcome,
          errorCode: event.errorCode,
          latencyMs: event.latencyMs,
          assets: event.assets.length
            ? { create: event.assets.map((a) => ({ kbId: a.kbId, citedCount: a.citedCount })) }
            : undefined,
        },
      });
    } catch {
      // Rule 1: bookkeeping never fails a served call. A lost row understates a
      // chart; a thrown error breaks a tenant's agent.
    }
  }
}

export function getSupplyLedger(): SupplyLedger {
  return prismaEnabled() ? new PrismaSupplyLedger() : NULL_SUPPLY_LEDGER;
}

/** The Runos channel answers in MCP's tool-result envelope, not a DispatchResult.
 *  `structuredContent` carries the same payload the direct channel returns, so
 *  one adapter lets BOTH channels share the single classifier above - which is
 *  the point: two classifiers would eventually disagree about what "degraded"
 *  means, and the 供给通道 page compares the two channels side by side. */
export function dispatchResultFromMcp(r: {
  structuredContent?: Record<string, unknown>;
  isError?: boolean;
}): DispatchResult {
  const payload = r.structuredContent ?? {};
  if (r.isError) {
    const code = (payload as { error?: unknown }).error;
    return { status: 500, body: { error: typeof code === "string" ? code : "mcp_tool_error" } };
  }
  return { status: 200, body: { result: payload } };
}

/**
 * The one seam every served call passes through. Times nothing itself - the
 * caller measures - and NEVER throws: see rule 1 at the top of this file.
 */
export async function recordSupplyCall(input: {
  channel: SupplyChannel;
  toolName: string;
  args: Record<string, unknown>;
  caller: CallerContext;
  result: DispatchResult;
  latencyMs: number;
  ledger?: SupplyLedger;
}): Promise<void> {
  try {
    const event = supplyEventFor(input);
    if (!event) return;
    await (input.ledger ?? getSupplyLedger()).record(event);
  } catch {
    // Belt-and-braces: even building the event must not surface to the caller.
  }
}
