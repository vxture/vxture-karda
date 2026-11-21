import type { EntitlementResolver } from "./resolver";
import { fetchEntitlement, type PlatformClientConfig } from "./platform-client";
import type { Entitlement } from "./types";
import type { PlatformContext } from "../platform/ticket";

// On-demand service cache only. User admission always reads fresh OBO facts.
// An unavailable authority is an error, never a cached commercial verdict.
const TTL_MS = 45_000;
export class PlatformEntitlementResolver implements EntitlementResolver {
  private cache = new Map<string, { value: Entitlement; expiresAt: number; revision: string }>();
  private generation = 0;
  constructor(private readonly cfg: PlatformClientConfig,
    private readonly load = fetchEntitlement, private readonly now = Date.now,
    private readonly version: (ws: string) => Promise<string> = async () => "local") {}
  async resolve(workspaceId: string, context?: PlatformContext): Promise<Entitlement> {
    if (context) return this.load(this.cfg, workspaceId, context);
    const generation = this.generation;
    const revision = await this.version(workspaceId);
    const hit = this.cache.get(workspaceId);
    if (hit && hit.expiresAt > this.now() && hit.revision === revision) return hit.value;
    const value = await this.load(this.cfg, workspaceId);
    if ((this.generation) === generation && await this.version(workspaceId) === revision) {
      if (this.cache.size >= 1000) this.cache.delete(this.cache.keys().next().value!);
      this.cache.set(workspaceId, { value, expiresAt: this.now() + TTL_MS, revision });
    }
    return value;
  }
  invalidate(workspaceId: string): void {
    this.cache.delete(workspaceId);
    this.generation++;
  }
}
