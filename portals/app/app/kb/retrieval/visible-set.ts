// The visible-set feed for scope resolution (120-retrieval-tools 3). The design
// names C2 as the source, but a library's visibility - its publish ladder
// (private / ws_published / org_published) and ownership - is karda's OWN
// authoritative data (knowledge_base.publish_state), so the ORG-namespace visible
// set is computed locally and self-contained (direction 2026-07-23). The
// PLATFORM-namespace visible set (P-tier packages) is the part that genuinely
// needs the C2 fetch; it is empty until those exist and lands as a later fill.
//
// Cached by (org, ws, product, user) with the same 300s TTL + event invalidation
// the design specifies (VisibleSetCache), so a publish/retract can evict at once.
import type { KbStore } from "../lib/store";
import { VisibleSetCache, type ScopedKb, type VisibleSetKey } from "./scope";

export interface VisibleSetInput {
  org: string | null;
  ws: string;
  product: string;
  user: string | null;
}

export class VisibleSetResolver {
  constructor(
    private kbs: KbStore,
    private cache: VisibleSetCache = new VisibleSetCache(),
  ) {}

  /**
   * The libraries the caller may SEE, grouped by namespace. Org namespace: the
   * workspace's libraries the user owns or that are published to the workspace /
   * org. Platform namespace: deferred to the C2 fill.
   */
  async resolve(input: VisibleSetInput, now: number = Date.now()): Promise<ScopedKb[]> {
    const key = this.key(input);
    const cached = this.cache.get(key, now);
    if (cached) return cached;

    const rows = await this.kbs.listKbs(input.ws);
    const visible: ScopedKb[] = rows
      .filter((r) => r.ownerSub === input.user || r.publishState === "ws_published" || r.publishState === "org_published")
      .map((r) => ({ kbId: r.id, namespace: "org" as const }));

    this.cache.set(key, visible, now);
    return visible;
  }

  /** Evict a caller's cached visible set (e.g. on a publish/retract). */
  invalidate(input: VisibleSetInput): void {
    this.cache.invalidate(this.key(input));
  }

  private key(input: VisibleSetInput): VisibleSetKey {
    return { org: input.org ?? "-", ws: input.ws, product: input.product, user: input.user };
  }
}

let singleton: VisibleSetResolver | null = null;

/** Process-wide resolver so its cache actually persists across requests. */
export function getVisibleSetResolver(kbs: KbStore): VisibleSetResolver {
  if (!singleton) singleton = new VisibleSetResolver(kbs);
  return singleton;
}

/** Test-only: drop the memoized resolver. */
export function resetVisibleSetResolver(): void {
  singleton = null;
}
