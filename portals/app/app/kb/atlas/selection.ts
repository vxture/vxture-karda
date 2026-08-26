// Grant-driven model selection (KD-018; owner ruling 2026-08-19), on the PRODUCT
// axis (`vxture-atlas#47`, ruling 2026-08-26).
//
// The principle is unchanged and is Atlas's own: "karda's business code
// shouldn't hardcode a specific modelCode - doing so defeats the point of
// routing through Atlas." karda sends a FIXED name per capability and Atlas-side
// authorization decides which model serves it. Changing vendor, price, or
// rolling a migration is an operator edit, zero karda changes.
//
// WHAT CHANGED: the name is an `endpointCode`, not a `taskProfile`.
//
// Atlas has two authorization axes and the word "grant" pointed at both:
//
//   product axis  `product_endpoint_grants`  holder = the PRODUCT, grants an
//                 ENDPOINT CODE, resolved from one string. The new axis.
//   tenant axis   `model_grants`             holder = a tenant, grants a MODEL,
//                 resolved from taskProfile + tenantId + application scope.
//                 LEGACY, with a countdown metric waiting to delete it.
//
// Label routing was only ever built on the tenant axis, so asking for a
// `taskProfile` dragged a tenant uuid along with it - not because authorization
// needed a tenant, but because the routing feature only existed over there.
// karda is a PRODUCT, not a tenant. The product axis was always the right one,
// and its re-point semantics are strictly stronger: change what `chat/default`
// points at and every product holding it follows, with no grant rows edited at
// all, while a taskProfile re-point means editing one grant row per tenant.
//
// The selector precedence is unchanged - `modelCode` > `endpointCode` >
// `taskProfile`, one of three, narrower wins. karda only ever needed the middle
// one.
//
// `taskProfile` is not coming back: Atlas ruled it will not be extended, and a
// future "different customers get different model tiers" need is answered by
// BUSINESS MODES on the product axis, not by tenant-scoped grants - binding
// models to tenants makes the tenant itself a routing dimension, O(tenants)
// instead of O(modes), and a label should say what the CALLER NEEDS, which a
// tenant identity does not carry.

/**
 * karda's four endpoint codes.
 *
 * NOT product-prefixed, unlike the retired task profiles. That is the point of
 * the product axis: the endpoint is a shared, operator-owned routing target and
 * several products can hold the same one. `chat/default` means "the default
 * chat endpoint", not "karda's chat endpoint", and re-pointing it moves every
 * holder at once.
 */
export const KARDA_ENDPOINTS = {
  ask: "chat/default",
  embed: "embedding/default",
  rerank: "rerank/default",
  /** Extraction gets its OWN endpoint, never `chat/default`. Batch, long
   *  context, latency-tolerant versus interactive and latency-critical - one
   *  endpoint would make routing, billing and observability unable to tell the
   *  two apart, and swapping extraction onto a cheaper model later would mean
   *  changing karda's code. Two endpoints, one configuration, permanently
   *  decoupled. */
  extract: "chat/extract",
} as const;

export interface ModelSelection {
  modelCode?: string;
  endpointCode?: string;
}

/**
 * Break-glass precedence: an explicit env pin beats the default endpoint.
 *
 * `ATLAS_*_MODEL` pins a concrete model and `ATLAS_*_ENDPOINT` pins a different
 * endpoint code. Both are for incidents; unset (the normal state) routes by the
 * product-axis grant, which is the whole design.
 */
function select(endpointEnv: string | undefined, modelEnv: string | undefined, defaultEndpoint: string): ModelSelection {
  if (modelEnv) return { modelCode: modelEnv };
  if (endpointEnv) return { endpointCode: endpointEnv };
  return { endpointCode: defaultEndpoint };
}

/** Cited answering (A4). */
export function askSelection(): ModelSelection {
  return select(process.env.ATLAS_ASK_ENDPOINT, process.env.ATLAS_ASK_MODEL, KARDA_ENDPOINTS.ask);
}

/** Embedding (A1). `kbPin` is the optional library-level lock
 *  (KB.embedding_model) and beats everything - a pinned library never drifts
 *  vector space, which is the KD-107 guarantee the pin exists for. */
export function embedSelection(kbPin?: string | null): ModelSelection {
  if (kbPin) return { modelCode: kbPin };
  return select(process.env.ATLAS_EMBED_ENDPOINT, process.env.ATLAS_EMBED_MODEL, KARDA_ENDPOINTS.embed);
}

/** Rerank (A3). */
export function rerankSelection(): ModelSelection {
  return select(process.env.ATLAS_RERANK_ENDPOINT, process.env.ATLAS_RERANK_MODEL, KARDA_ENDPOINTS.rerank);
}

/**
 * Batch knowledge extraction. Rides `/v1/chat` like ask, under its own endpoint
 * code - see `KARDA_ENDPOINTS.extract` for why they must not share one.
 *
 * Until the endpoint is granted to the product, Atlas answers
 * `404 ENDPOINT_NOT_ROUTABLE` - no model runs and nothing is charged. Same
 * semantics as the retired `TASK_PROFILE_NOT_ROUTABLE`: the named thing does not
 * exist or is not enabled, not retryable, never a silent fallback. The
 * extraction client maps it to a parked, resumable state, unchanged.
 */
export function extractSelection(): ModelSelection {
  return select(process.env.ATLAS_EXTRACT_ENDPOINT, process.env.ATLAS_EXTRACT_MODEL, KARDA_ENDPOINTS.extract);
}
