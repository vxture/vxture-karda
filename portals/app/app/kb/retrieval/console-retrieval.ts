// Console retrieval (the recall-test + search/ask surface the spec makes a
// Console staple - product definition 5.4 "召回测试(Console 标配)"; deferred in
// track 10 until retrieval existed, unblocked by 5b/6b). Session-facing twin of
// search-tool/ask-tool with three deliberate deltas:
//
// - SCOPE: a Console user explores what they can SEE, not what some agent has
//   attached - so the scope is preset-merged over the caller's chosen kb_ids,
//   defaulting to the WHOLE visible set. Visibility still gates every id
//   (resolveScope), so this widens nothing.
// - NO karda.search/karda.ask METERING: this is karda's own first-party
//   diagnostic/browse surface, not an agent consuming the tool face. Atlas-side
//   costs (embed/rerank/generation) still meter at Atlas under this call's
//   taskId, attributed to the workspace.
// - SNIPPETS: results carry a text snippet for display - agents get ids and
//   fetch text on demand; a human needs to read the hit.
import { randomUUID } from "node:crypto";
import { runSearch, DEFAULT_SEARCH_PARAMS, UnavailableReranker } from "./search";
import { resolveScope } from "./scope";
import { verificationFilterOf, topKOf } from "./params";
import { Bm25Recaller } from "./bm25-recaller";
import { runAsk, type GenerationClient, type ChunkText } from "./ask";
import type { RecallCorpus, RecallTextResolver } from "./corpus";
import type { VisibleSetInput } from "./visible-set";
import type { ScopedKb } from "./scope";
import { retrievalAtlas, type RetrievalAtlas } from "../atlas/wiring";

/** Structural port over VisibleSetResolver so tests can fake it. */
export interface VisibleSetPort {
  resolve(input: VisibleSetInput): Promise<ScopedKb[]>;
}

export interface ConsoleCaller {
  org: string | null;
  ws: string;
  user: string;
}

export interface ConsoleRetrievalDeps {
  visibleSet: VisibleSetPort;
  corpus: RecallCorpus;
  texts: RecallTextResolver;
  /** null when Atlas A4 is unconfigured - ask reports not_configured. */
  generation?: GenerationClient | null;
  modelCode?: string;
  endpointCode?: string;
}

export interface ConsoleSearchItem {
  id: string;
  kbId: string;
  score: number;
  snippet: string;
}

export interface ConsoleSearchResult {
  items: ConsoleSearchItem[];
  degraded: null | "rerank_unavailable";
  partial: boolean;
  ignoredKbIds: string[];
  /** the kb ids the query actually ran over (after visibility gating). */
  scopeKbIds: string[];
}

const SNIPPET_LEN = 240;



function strArray(v: unknown): string[] | undefined {
  if (!Array.isArray(v)) return undefined;
  const out = v.filter((x): x is string => typeof x === "string" && x.length > 0);
  return out.length > 0 ? out : undefined;
}

async function consoleScope(caller: ConsoleCaller, kbIds: string[] | undefined, deps: ConsoleRetrievalDeps) {
  const visibleSet = await deps.visibleSet.resolve({
    org: caller.org,
    ws: caller.ws,
    product: "karda",
    user: caller.user,
  });
  // Default scope = everything visible; chosen kb_ids select within it via the
  // preset merge. resolveScope drops a non-visible preset silently (presets are
  // additive, not the narrowing branch), so the caller-facing echo of dropped
  // ids is computed here - same non-probing rule as everywhere: only ids the
  // caller itself supplied are echoed.
  const presetKbIds = kbIds ?? visibleSet.map((k) => k.kbId);
  const scope = resolveScope({ visibleSet, attached: [], presetKbIds });
  const inScope = new Set(scope.whitelist.map((k) => k.kbId));
  const ignoredKbIds = (kbIds ?? []).filter((id) => !inScope.has(id));
  return { scope, ignoredKbIds };
}

function atlasFor(caller: ConsoleCaller, taskId: string, deps: ConsoleRetrievalDeps): RetrievalAtlas {
  return caller.org
    ? retrievalAtlas({ org: caller.org, ws: caller.ws }, taskId, { texts: deps.texts })
    : { vectorRecaller: null, reranker: null };
}

async function snippetsFor(ids: string[], texts: RecallTextResolver): Promise<Map<string, string>> {
  const resolved = await texts.resolve(ids);
  return new Map(resolved.map((t) => [t.id, t.text.slice(0, SNIPPET_LEN)]));
}

export async function consoleSearch(
  caller: ConsoleCaller,
  args: Record<string, unknown>,
  deps: ConsoleRetrievalDeps,
): Promise<ConsoleSearchResult> {
  const { scope, ignoredKbIds } = await consoleScope(caller, strArray(args.kb_ids), deps);
  const taskId = `karda:console:${randomUUID()}`;
  const atlas = atlasFor(caller, taskId, deps);

  const result = await runSearch({
    query: typeof args.query === "string" ? args.query : "",
    scope,
    recallers: [new Bm25Recaller(deps.corpus), ...(atlas.vectorRecaller ? [atlas.vectorRecaller] : [])],
    reranker: atlas.reranker ?? new UnavailableReranker(),
    params: {
      ...DEFAULT_SEARCH_PARAMS,
      topK: topKOf(args.top_k),
      verificationFilter: verificationFilterOf(args.verification_filter),
    },
  });

  const snippets = await snippetsFor(result.items.map((i) => i.id), deps.texts);
  return {
    items: result.items.map((i) => ({ ...i, snippet: snippets.get(i.id) ?? "" })),
    degraded: result.degraded,
    partial: result.partial,
    ignoredKbIds,
    scopeKbIds: scope.whitelist.map((k) => k.kbId),
  };
}

export interface ConsoleAskResult {
  answer: string;
  citations: { id: string; kbId: string; snippet: string }[];
  degraded: null | "rerank_unavailable";
  partial: boolean;
  noContext: boolean;
}

export async function consoleAsk(
  caller: ConsoleCaller,
  args: Record<string, unknown>,
  deps: ConsoleRetrievalDeps,
): Promise<ConsoleAskResult | { notConfigured: true }> {
  if (!deps.generation) return { notConfigured: true };
  const { scope } = await consoleScope(caller, strArray(args.kb_ids), deps);
  const taskId = `karda:console:${randomUUID()}`;
  const atlas = atlasFor(caller, taskId, deps);

  const result = await runAsk({
    query: typeof args.question === "string" ? args.question : "",
    scope,
    recallers: [new Bm25Recaller(deps.corpus), ...(atlas.vectorRecaller ? [atlas.vectorRecaller] : [])],
    reranker: atlas.reranker ?? new UnavailableReranker(),
    // Same gap as the agent-facing ask-tool had: the 检验台 is meant to answer
    // "what will my agent get", so it has to be able to ASK for a tier.
    verificationFilter: verificationFilterOf(args.verification_filter),
    taskId,
    tenantId: caller.org ?? "",
    workspaceId: caller.ws,
    userId: caller.user,
    modelCode: deps.modelCode,
    endpointCode: deps.endpointCode,
    resolver: {
      async resolve(ids: string[]): Promise<ChunkText[]> {
        return (await deps.texts.resolve(ids)).map((t) => ({ id: t.id, kbId: t.kbId, content: t.text }));
      },
    },
    generation: deps.generation,
    contextK: typeof args.top_k === "number" && args.top_k > 0 ? args.top_k : 5,
  });

  const snippets = await snippetsFor(result.citations.map((c) => c.id), deps.texts);
  return {
    answer: result.answer,
    citations: result.citations.map((c) => ({ ...c, snippet: snippets.get(c.id) ?? "" })),
    degraded: result.degraded,
    partial: result.partial,
    noContext: result.noContext,
  };
}
