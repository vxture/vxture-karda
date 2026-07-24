// Scope resolution (120-retrieval-tools 1 step 2, 4): compute the recall
// whitelist = visible-set INTERSECT attachment INTERSECT optional kb_ids
// narrowing, grouped by namespace.
//
// This is the security floor of retrieval (product-definition 6.1: the whitelist
// precedes any recall execution and no degrade path may bypass it). Two rules
// carry the weight and are the reason this is pure and heavily tested:
//   - kb_ids can only NARROW, never widen. A kb the caller passes but cannot see
//     is silently dropped (and echoed as ignored, for debugging - not existence
//     probing, since it only echoes ids the caller itself supplied).
//   - the whitelist is an intersection, so anything the visible-set does not
//     contain cannot appear no matter what the attachment list or kb_ids say.

export type Namespace = "org" | "platform";

export interface ScopedKb {
  kbId: string;
  namespace: Namespace;
}

export interface ResolveInput {
  /** From C2 (cached, section 3). What the caller is ALLOWED to see. */
  visibleSet: ScopedKb[];
  /** Server-side attachment list, keyed user x product (section 4). Consumption
   *  config, not authorization - it narrows, it never grants. */
  attached: string[];
  /** Optional caller narrowing. Present ids outside the visible set are ignored. */
  kbIds?: string[];
  /** Product-preset libraries the agent merges explicitly by id (product_110 D5).
   *  These join by id and bypass the attachment list, but STILL must be visible. */
  presetKbIds?: string[];
}

export interface ResolvedScope {
  /** The recall whitelist, grouped and deduped. */
  whitelist: ScopedKb[];
  namespaces: Namespace[];
  /** kb_ids the caller passed that were dropped (not visible/attachable). */
  ignoredKbIds: string[];
}

export function resolveScope(input: ResolveInput): ResolvedScope {
  const visibleById = new Map(input.visibleSet.map((k) => [k.kbId, k]));

  // The base set of ids the caller may consume: attachments that are visible,
  // plus explicitly-merged preset ids that are visible. Attachment is
  // consumption config; visibility is the gate - so both must hold.
  const base = new Set<string>();
  for (const id of input.attached) if (visibleById.has(id)) base.add(id);
  for (const id of input.presetKbIds ?? []) if (visibleById.has(id)) base.add(id);

  const ignoredKbIds: string[] = [];
  let selected: Set<string>;

  if (input.kbIds && input.kbIds.length > 0) {
    // Narrowing: intersect the base with the requested ids. A requested id that
    // is not in the base (not visible, or not attached) is ignored and echoed.
    selected = new Set<string>();
    for (const id of input.kbIds) {
      if (base.has(id)) selected.add(id);
      else ignoredKbIds.push(id);
    }
  } else {
    selected = base;
  }

  const whitelist = [...selected].map((kbId) => visibleById.get(kbId)!);
  const namespaces = [...new Set(whitelist.map((k) => k.namespace))];
  return { whitelist, namespaces, ignoredKbIds };
}

// --- visible-set cache (section 3): event-invalidation + short TTL ----------

export interface VisibleSetKey {
  org: string;
  ws: string;
  product: string;
  user: string | null;
}

export const VISIBLE_SET_TTL_MS = 300_000; // 300s, aligned with the S2S token TTL

export function cacheKey(k: VisibleSetKey): string {
  return `${k.org}|${k.ws}|${k.product}|${k.user ?? "-"}`;
}

interface Entry {
  value: ScopedKb[];
  expiresAt: number;
}

/**
 * Hybrid cache: a short TTL as a floor, plus explicit invalidation so a platform
 * change (retract, grant revoke, entitlement change, package unsubscribe)
 * evicts immediately rather than waiting out the TTL - that is the product's
 * "revocation takes effect at once" promise. With the event channel down it
 * degrades to pure TTL (worst case 300s), which must be stated in the SLA.
 *
 * `now` is injectable so expiry is testable without wall-clock.
 */
export class VisibleSetCache {
  private map = new Map<string, Entry>();

  constructor(private ttlMs: number = VISIBLE_SET_TTL_MS) {}

  get(key: VisibleSetKey, now: number): ScopedKb[] | null {
    const s = cacheKey(key);
    const e = this.map.get(s);
    if (!e) return null;
    if (now >= e.expiresAt) {
      this.map.delete(s);
      return null;
    }
    return e.value;
  }

  set(key: VisibleSetKey, value: ScopedKb[], now: number): void {
    this.map.set(cacheKey(key), { value, expiresAt: now + this.ttlMs });
  }

  /** Explicit event invalidation (visible-set-invalidate). */
  invalidate(key: VisibleSetKey): void {
    this.map.delete(cacheKey(key));
  }

  /** Invalidate every entry for a (org, ws) - a workspace-wide change. */
  invalidateWorkspace(org: string, ws: string): void {
    const prefix = `${org}|${ws}|`;
    for (const k of this.map.keys()) if (k.startsWith(prefix)) this.map.delete(k);
  }

  get size(): number {
    return this.map.size;
  }
}
