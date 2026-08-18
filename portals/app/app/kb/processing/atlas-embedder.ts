// The processing-side A1 embedder factory (5b): binds the shared Atlas core to
// one task's context. Background work has no S2S token to read the tenant from,
// so the org for the aud=atlas token exchange is resolved from provisioning
// truth: vx_provision.app_instance (workspace_id, product_code='karda') ->
// tenant_id. Resolution is lazy (inside embed()) so building the client stays
// sync and a lookup failure parks the task (UnavailableError) instead of
// crashing the resolver.
//
// The task id sent to Atlas is `karda:ingest:<docId>` - stable across retries
// of the same document, so one document's embedding cost aggregates under one
// work unit however many attempts it takes (karda#101: same task, same value).
import { prismaEnabled, getPrismaClient } from "../../lib/db";
import { getAtlasCore } from "../atlas/wiring";
import { AtlasEmbedClient } from "../atlas/embed";
import { UnavailableEmbeddingClient, type EmbeddingClient } from "./orchestrator";
import type { AtlasContext } from "../atlas/client";

export interface EmbedderTaskContext {
  docId: string;
  /** the task's org key = the KB's owning workspace (runtime.enqueueForDocument). */
  workspaceId: string;
}

/** workspace -> platform tenant UUID, from the provisioning contract table. */
export async function tenantForWorkspace(workspaceId: string): Promise<string | null> {
  if (!prismaEnabled()) return null;
  const p = await getPrismaClient();
  const row: { tenantId: string | null } | null = await p.appInstance.findFirst({
    where: { workspaceId, productCode: "karda" },
    select: { tenantId: true },
  });
  return row?.tenantId ?? null;
}

/**
 * The default embedder for the production resolver: the real A1 client when
 * Atlas is configured, else the suspend-stub - documents keep parking at embed
 * exactly as before until ATLAS_BASE_URL + creds + a model lock exist.
 */
export function processingEmbedder(ctx: EmbedderTaskContext): EmbeddingClient {
  const core = getAtlasCore();
  if (!core) return new UnavailableEmbeddingClient();

  const context = async (): Promise<AtlasContext> => {
    const tenant = await tenantForWorkspace(ctx.workspaceId);
    if (!tenant) throw new Error(`no provisioned tenant for workspace ${ctx.workspaceId}`);
    return { org: tenant, ws: ctx.workspaceId };
  };

  return new AtlasEmbedClient(core, { context, taskId: `karda:ingest:${ctx.docId}` });
}
